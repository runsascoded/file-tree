/** A second-level, *shared* block cache under the VFS.
 *
 *  `StoreVFS` already caches blocks, but that cache lives and dies with
 *  one connection. On Cloudflare that's the wrong lifetime: the platform
 *  reuses an isolate across requests but may evict it at any moment, so
 *  a module-scope connection cache is best-effort by construction. The
 *  expensive part of a cold start isn't the wasm compile (per-isolate,
 *  and CPU) — it's the page reads, which are network.
 *
 *  So: put those blocks somewhere that outlives the isolate.
 *  `caches.default` is shared by every isolate in the colo, needs no
 *  binding, no migration and no plan, and costs one option to wire up.
 *  A Durable Object gets you strictly more — one guaranteed connection
 *  with a warm cache — at the price of a migration in every consumer's
 *  `wrangler.toml`, hand-managed `locationHint` (a DO placed near the
 *  first *reader* rather than near the bucket inverts the entire reason
 *  for running the engine server-side), and head-of-line blocking
 *  between readers of one file. Worth it when a measurement says so.
 *
 *  Layered under the VFS rather than replacing its cache: `StoreVFS`'s
 *  `Map` stays the L1 (synchronous, per-connection, readahead-aware) and
 *  this is the L2. That also means zero VFS changes.
 *
 *  **Blocks are fixed-size and aligned**, which the VFS's are not — it
 *  issues reads of `minBlock × readahead` bytes as a scan accelerates.
 *  Quantizing here is what makes an entry written by one request
 *  reusable by the next, whatever readahead size that one happened to
 *  reach.
 *
 *  **Keys must identify contents, not location.** Pass a `key` that
 *  includes a version — an etag, or the `lastModified` the file listing
 *  already carries — or a re-uploaded database gets served from the old
 *  file's pages. A cache miss is only ever a read; a stale hit is
 *  silent corruption.
 */
import { rangeReaderFromStore, type RangeReader } from './vfs'
import type { Store } from '../types'

/** Somewhere to put bytes that outlives one connection.
 *
 *  Deliberately tiny, and deliberately allowed to forget: every method
 *  may fail or return nothing, and the reader falls back to a real read.
 *  Nothing may depend on a hit. */
export interface BlockCache {
  get(key: string): Promise<Uint8Array | undefined>
  put(key: string, bytes: Uint8Array): Promise<void>
}

export interface BlockCacheStats {
  /** Blocks served by the cache. */
  hits: number
  /** Blocks that had to be fetched. */
  misses: number
  /** Ranged reads issued to the underlying reader. Lower than `misses`
   *  when contiguous misses coalesce, which is the point. */
  reads: number
  /** Bytes fetched from the underlying reader. */
  bytes: number
}

export interface CachedRangeReaderOptions {
  cache: BlockCache
  /** Identity of the file's *contents*. Include a version. */
  key: string
  /** Block granularity. Bigger blocks mean fewer, larger cache entries
   *  and more waste on a random-access workload; 64 KiB is 16 SQLite
   *  pages at the common 4 KiB page size. */
  blockBytes?: number
}

export interface CachedRangeReader extends RangeReader {
  readonly stats: BlockCacheStats
  /** Settles when every in-flight `put` has finished.
   *
   *  Writes are not awaited on the read path — a cache write should
   *  never be in front of a query — so a Worker should hand this to
   *  `ctx.waitUntil` to keep them alive past the response. Tests await
   *  it before asserting. */
  flush(): Promise<void>
}

const DEFAULT_BLOCK_BYTES = 64 * 1024

/** Wrap a `RangeReader` so its reads are served from `cache` where
 *  possible, and written back where not. */
export function cachedRangeReader(
  reader: RangeReader,
  opts: CachedRangeReaderOptions,
): CachedRangeReader {
  const block = opts.blockBytes ?? DEFAULT_BLOCK_BYTES
  const { cache, key } = opts
  const stats: BlockCacheStats = { hits: 0, misses: 0, reads: 0, bytes: 0 }
  const size = reader.size

  const pending = new Set<Promise<void>>()

  /** Length of block `i` — short only at EOF. */
  const blockLen = (i: number) => Math.min(block, size - i * block)

  function write(i: number, bytes: Uint8Array): void {
    const p = cache.put(`${key}#${i}`, bytes).catch(() => {}).finally(() => { pending.delete(p) })
    pending.add(p)
  }

  /** A cached block, or `undefined` if absent — or the wrong length.
   *
   *  The length check is not defensiveness for its own sake: a
   *  truncated entry would be spliced into a SQLite page and read as
   *  data. Treating it as a miss costs one read. */
  async function cached(i: number): Promise<Uint8Array | undefined> {
    const got = await cache.get(`${key}#${i}`).catch(() => undefined)
    return got?.byteLength === blockLen(i) ? got : undefined
  }

  async function read(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, size)
    if (end <= offset) return new Uint8Array(0)

    const first = Math.floor(offset / block)
    const last = Math.floor((end - 1) / block)
    const count = last - first + 1

    // Lookups are independent, so issue them together rather than
    // walking the range serially — over a network-backed cache that's
    // the difference between one round-trip and `count` of them.
    const blocks = await Promise.all(
      Array.from({ length: count }, (_, n) => cached(first + n)),
    )

    // Fetch each contiguous run of misses in a single ranged read.
    for (let n = 0; n < count; n++) {
      if (blocks[n]) { stats.hits++; continue }
      let m = n
      while (m + 1 < count && !blocks[m + 1]) m++
      stats.misses += m - n + 1

      const runOffset = (first + n) * block
      const runEnd = Math.min((first + m + 1) * block, size)
      const bytes = await reader.read(runOffset, runEnd - runOffset)
      stats.reads++
      stats.bytes += bytes.byteLength

      for (let k = n; k <= m; k++) {
        const start = (k - n) * block
        if (start >= bytes.byteLength) break
        const slice = bytes.subarray(start, Math.min(start + block, bytes.byteLength))
        blocks[k] = slice
        write(first + k, slice)
      }
      n = m
    }

    const out = new Uint8Array(end - offset)
    for (let n = 0; n < count; n++) {
      const bytes = blocks[n]
      if (!bytes) continue
      const blockStart = (first + n) * block
      const from = Math.max(offset, blockStart)
      const to = Math.min(end, blockStart + bytes.byteLength)
      if (to <= from) continue
      out.set(bytes.subarray(from - blockStart, to - blockStart), from - offset)
    }
    return out
  }

  return {
    size,
    read,
    stats,
    async flush() { await Promise.all([...pending]) },
  }
}

/** Key under which a file's size is cached alongside its blocks.
 *
 *  Not an afterthought: learning the size is a *separate* round-trip
 *  before the first block can be read, and on a cold isolate that
 *  round-trip is the whole latency of a request that otherwise hits the
 *  cache for everything. `#size` can't collide with a block, whose
 *  suffix is always an integer. */
const SIZE_KEY = '#size'

/** `cachedRangeReader` over a `Store`, with the size cached too.
 *
 *  With a warm cache this reaches the store zero times — which
 *  `rangeReaderFromStore` alone cannot manage, since it must probe for
 *  the size before there is anything to cache against. Safe for exactly
 *  the reason the blocks are: `key` names fixed contents, and a file's
 *  size is part of its contents. */
export async function cachedRangeReaderFromStore(
  store: Store,
  path: string,
  opts: CachedRangeReaderOptions,
): Promise<CachedRangeReader> {
  const stored = await opts.cache.get(opts.key + SIZE_KEY).catch(() => undefined)
  if (stored?.byteLength === 8) {
    const size = new DataView(stored.buffer, stored.byteOffset, 8).getFloat64(0)
    // Integral and in range, or the entry is not one of ours.
    if (Number.isSafeInteger(size) && size >= 0) {
      return cachedRangeReader({
        size,
        read: (offset, length) => store.get(path, { offset, length }).then(r => r.bytes),
      }, opts)
    }
  }

  const reader = await rangeReaderFromStore(store, path)
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, reader.size)
  await opts.cache.put(opts.key + SIZE_KEY, bytes).catch(() => {})
  return cachedRangeReader(reader, opts)
}

/** A `BlockCache` in a `Map`, with an LRU bound.
 *
 *  For Node, and for tests. In a long-lived process this is a genuine
 *  shared cache; in a Worker it is per-isolate and therefore no better
 *  than the VFS's own. */
export function memoryBlockCache(maxBytes = 64 * 1024 * 1024): BlockCache {
  const map = new Map<string, Uint8Array>()
  let bytes = 0
  return {
    async get(key) {
      const got = map.get(key)
      // Re-insert on hit: an insertion-ordered `Map` is already an LRU.
      if (got) { map.delete(key); map.set(key, got) }
      return got
    },
    async put(key, value) {
      if (map.has(key)) return
      map.set(key, value)
      bytes += value.byteLength
      while (bytes > maxBytes && map.size > 1) {
        const [oldest, dropped] = map.entries().next().value as [string, Uint8Array]
        map.delete(oldest)
        bytes -= dropped.byteLength
      }
    },
  }
}

export interface WorkersBlockCacheOptions {
  /** Defaults to `caches.default`. */
  cache?: Cache
  /** Host for the synthetic cache keys. Never resolved — the Cache API
   *  keys on a URL, so one is manufactured. Change it to partition two
   *  deployments sharing a zone. */
  host?: string
  /** `ctx.waitUntil`, so writes survive the response. Without it a
   *  write racing the end of a request may simply be dropped, which is
   *  a missed hit and nothing worse. */
  waitUntil?: (p: Promise<unknown>) => void
  /** `max-age` on stored blocks, seconds. Keys carry a version, so this
   *  can be long. Default 7 days. */
  maxAge?: number
}

/** A `BlockCache` over the Cloudflare Cache API.
 *
 *  Scoped to one colo, not the world — "shared across invocations"
 *  means invocations in that data center. Evictable at any time. */
export function workersBlockCache(opts: WorkersBlockCacheOptions = {}): BlockCache {
  const host = opts.host ?? 'blocks.file-tree.invalid'
  const maxAge = opts.maxAge ?? 7 * 24 * 60 * 60
  const cacheFor = () => opts.cache ?? (caches as unknown as { default: Cache }).default
  const url = (key: string) => `https://${host}/${encodeURIComponent(key)}`

  return {
    async get(key) {
      const res = await cacheFor().match(new Request(url(key)))
      if (!res) return undefined
      return new Uint8Array(await res.arrayBuffer())
    },
    async put(key, bytes) {
      // `BodyInit` is declared as `ArrayBufferView<ArrayBuffer>`, while a
      // `Uint8Array` is generic over `ArrayBufferLike`. The value is
      // accepted at runtime; only the declaration is narrower.
      const res = new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': `public, max-age=${maxAge}`,
        },
      })
      const p = cacheFor().put(new Request(url(key)), res)
      opts.waitUntil?.(p)
      await p
    },
  }
}
