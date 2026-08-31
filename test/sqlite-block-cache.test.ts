/** The L2 block cache: `cachedRangeReader` on its own, then the whole
 *  remote path across a simulated isolate eviction.
 *
 *  Read counts are asserted exactly for the same reason they are in
 *  `sqlite-vfs.test.ts` — the class exists to remove reads, and a
 *  regression that removes none still returns the right rows. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  cachedRangeReader, cachedRangeReaderFromStore, memoryBlockCache, type BlockCache,
} from '../src/sqlite/blockCache'
import type { RangeReader } from '../src/sqlite/vfs'
import { MockStore } from '../src/stores/mock'
import { createTableHandlers } from '../src/server/sqlite'
import { httpTableCatalog } from '../src/renderers/httpTableSource'
import type { Store } from '../src/types'
import type { Handlers } from '../src/server'

const here = dirname(fileURLToPath(import.meta.url))
// `Uint8Array`, not the `Buffer` `readFileSync` returns: vitest's
// `toEqual` distinguishes them even when every byte matches.
const DB = new Uint8Array(readFileSync(join(here, 'fixtures/sample.sqlite')))
/** `sample.sqlite` after a plausible re-upload — same schema, different
 *  rows, near-identical size and layout. */
const DB2 = new Uint8Array(readFileSync(join(here, 'fixtures/sample-v2.sqlite')))
const WASM = readFileSync(join(here, '../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm'))

/** A reader over a buffer that records every range asked for. */
function recordingReader(bytes: Uint8Array): RangeReader & { ranges: [number, number][] } {
  const ranges: [number, number][] = []
  return {
    size: bytes.byteLength,
    ranges,
    async read(offset: number, length: number) {
      ranges.push([offset, length])
      return bytes.subarray(offset, offset + length)
    },
  }
}

const B = 4096

describe('cachedRangeReader', () => {
  test('quantizes to aligned blocks, whatever range is asked for', async () => {
    const cache = memoryBlockCache()
    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache, key: 'k', blockBytes: B })

    expect(await cached.read(100, 16)).toEqual(DB.subarray(100, 116))
    expect(reader.ranges).toEqual([[0, B]])
    expect(cached.stats).toEqual({ hits: 0, misses: 1, reads: 1, bytes: B })
  })

  test('serves later reads inside a cached block without touching the reader', async () => {
    const cache = memoryBlockCache()
    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache, key: 'k', blockBytes: B })

    await cached.read(0, 16)
    await cached.flush()
    expect(await cached.read(4000, 16)).toEqual(DB.subarray(4000, 4016))
    expect(reader.ranges).toEqual([[0, B]])
    expect(cached.stats).toEqual({ hits: 1, misses: 1, reads: 1, bytes: B })
  })

  test('coalesces a run of misses into one read, and splits around a hit', async () => {
    const cache = memoryBlockCache()
    const warm = cachedRangeReader(recordingReader(DB), { cache, key: 'k', blockBytes: B })
    await warm.read(B, 16)          // block 1 only
    await warm.flush()

    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache, key: 'k', blockBytes: B })
    // Blocks 0..3: 0 misses, 1 hits, 2 and 3 miss — so two reads, and
    // the second covers both remaining blocks in one range.
    expect(await cached.read(0, 4 * B)).toEqual(DB.subarray(0, 4 * B))
    expect(reader.ranges).toEqual([[0, B], [2 * B, 2 * B]])
    expect(cached.stats).toEqual({ hits: 1, misses: 3, reads: 2, bytes: 3 * B })
  })

  test('a second reader over the same cache and key issues no reads at all', async () => {
    const cache = memoryBlockCache()
    const first = cachedRangeReader(recordingReader(DB), { cache, key: 'k', blockBytes: B })
    await first.read(0, 3 * B)
    await first.flush()

    const reader = recordingReader(DB)
    const second = cachedRangeReader(reader, { cache, key: 'k', blockBytes: B })
    expect(await second.read(1000, 2 * B)).toEqual(DB.subarray(1000, 1000 + 2 * B))
    expect(reader.ranges).toEqual([])
    expect(second.stats).toEqual({ hits: 3, misses: 0, reads: 0, bytes: 0 })
  })

  test('a different key shares nothing — this is what a version bump buys', async () => {
    const cache = memoryBlockCache()
    const first = cachedRangeReader(recordingReader(DB), { cache, key: 'db@v1', blockBytes: B })
    await first.read(0, B)
    await first.flush()

    const reader = recordingReader(DB)
    const second = cachedRangeReader(reader, { cache, key: 'db@v2', blockBytes: B })
    await second.read(0, B)
    expect(reader.ranges).toEqual([[0, B]])
  })

  test('reads the short final block, and clamps a read past EOF', async () => {
    const cache = memoryBlockCache()
    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache, key: 'k', blockBytes: B })
    const size = DB.byteLength
    const lastStart = Math.floor((size - 1) / B) * B

    expect(await cached.read(size - 10, 999)).toEqual(DB.subarray(size - 10, size))
    expect(reader.ranges).toEqual([[lastStart, size - lastStart]])
    // Re-reading the short block must hit: its cached length is the
    // block's real length, not `blockBytes`.
    await cached.flush()
    await cached.read(size - 10, 10)
    expect(cached.stats).toEqual({
      hits: 1, misses: 1, reads: 1, bytes: size - lastStart,
    })
  })

  test('an empty read never reaches the reader', async () => {
    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache: memoryBlockCache(), key: 'k', blockBytes: B })
    expect(await cached.read(100, 0)).toEqual(new Uint8Array(0))
    expect(await cached.read(DB.byteLength, 50)).toEqual(new Uint8Array(0))
    expect(reader.ranges).toEqual([])
  })

  test('treats a truncated entry as a miss rather than splicing it in', async () => {
    // A wrong hit is silent corruption; a miss is one read.
    const cache = memoryBlockCache()
    await cache.put('k#0', new Uint8Array(16))
    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache, key: 'k', blockBytes: B })

    expect(await cached.read(0, 32)).toEqual(DB.subarray(0, 32))
    expect(reader.ranges).toEqual([[0, B]])
    expect(cached.stats).toEqual({ hits: 0, misses: 1, reads: 1, bytes: B })
  })

  test('survives a cache that throws, and a cache that forgets everything', async () => {
    const broken: BlockCache = {
      async get() { throw new Error('cache down') },
      async put() { throw new Error('cache down') },
    }
    const reader = recordingReader(DB)
    const cached = cachedRangeReader(reader, { cache: broken, key: 'k', blockBytes: B })
    expect(await cached.read(0, 32)).toEqual(DB.subarray(0, 32))
    await cached.flush()
    expect(cached.stats).toEqual({ hits: 0, misses: 1, reads: 1, bytes: B })
  })
})

describe('cachedRangeReaderFromStore', () => {
  /** A `Store` over one buffer that counts every `get`, including the
   *  size probe — which is the read this is about. */
  function oneFileStore(bytes: Uint8Array) {
    const state = { gets: [] as (string | null)[] }
    const store: Store = {
      async list() { return { entries: [] } },
      async get(_p, range) {
        state.gets.push(range ? `${range.offset}+${range.length}` : 'whole')
        const b = range ? bytes.subarray(range.offset, range.offset + range.length) : bytes
        return { bytes: b, totalSize: bytes.byteLength }
      },
    }
    return { store, state }
  }

  test('caches the size, so a warm reader touches the store zero times', async () => {
    const cache = memoryBlockCache()
    const first = oneFileStore(DB)
    const a = await cachedRangeReaderFromStore(first.store, 'p', { cache, key: 'p@v1', blockBytes: B })
    expect(await a.read(0, 32)).toEqual(DB.subarray(0, 32))
    await a.flush()
    expect(a.size).toBe(DB.byteLength)

    const second = oneFileStore(DB)
    const b = await cachedRangeReaderFromStore(second.store, 'p', { cache, key: 'p@v1', blockBytes: B })
    expect(b.size).toBe(DB.byteLength)
    expect(await b.read(0, 32)).toEqual(DB.subarray(0, 32))
    expect(second.state.gets).toEqual([])
  })

  test('probes again when the cached size is not one of ours', async () => {
    const cache = memoryBlockCache()
    await cache.put('p@v1#size', new Uint8Array([1, 2, 3]))
    const { store, state } = oneFileStore(DB)
    const r = await cachedRangeReaderFromStore(store, 'p', { cache, key: 'p@v1', blockBytes: B })
    expect(r.size).toBe(DB.byteLength)
    expect(state.gets).toEqual(['0+1'])
  })
})

describe('memoryBlockCache', () => {
  test('drops the least recently used block past its ceiling', async () => {
    const cache = memoryBlockCache(3 * B)
    for (const i of [0, 1, 2]) await cache.put(`k#${i}`, new Uint8Array(B))
    await cache.get('k#0')                          // 0 is now the newest
    await cache.put('k#3', new Uint8Array(B))       // evicts 1

    expect(await Promise.all([0, 1, 2, 3].map(i => cache.get(`k#${i}`).then(v => !!v))))
      .toEqual([true, false, true, true])
  })
})

/** A store that counts reads and can swap the bytes underneath. */
function countingStore(path: string, bytes: Uint8Array) {
  const state = { bytes, reads: 0 }
  const store: Store = {
    async list() { return { entries: [] } },
    async get(p, range) {
      if (p !== path) throw Object.assign(new Error(`not found: ${p}`), { name: 'NotFoundError' })
      state.reads++
      const b = range ? state.bytes.subarray(range.offset, range.offset + range.length) : state.bytes
      return { bytes: b, totalSize: state.bytes.byteLength }
    },
  }
  return { store, state }
}

const PATH = 'db/sample.sqlite'

function handlers(store: Store, blockCache?: BlockCache): Handlers {
  return createTableHandlers(store, {
    wasm: { wasmBinary: WASM },
    basePath: '/tables',
    ...(blockCache ? { blockCache } : {}),
  })
}

function catalogFor(h: Handlers, version?: string) {
  return httpTableCatalog({
    baseUrl: 'https://example.test/tables',
    path: PATH,
    ...(version ? { version } : {}),
    fetch: (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return await h.handle(new Request(url)) ?? new Response('no route', { status: 404 })
    }) as typeof fetch,
  })
}

/** The query every case below runs, so the read counts compare. */
const query = (h: Handlers, version?: string) =>
  catalogFor(h, version).source('events').page({ offset: 0, limit: 5, sort: { column: 'note', dir: 'asc' } })

describe('a shared block cache across isolates', () => {
  /** Reads for one cold query. Pinned because the counts *are* the
   *  feature — but they are read *shapes*, so a deliberate change to
   *  readahead or block size should update them, not loosen them. */
  const COLD_VFS = 7      // 8 KiB floor, doubling readahead, no L2
  const COLD_L2 = 4       // 64 KiB aligned blocks underneath

  test('the L2 changes the read shape even cold: fewer, larger reads', async () => {
    const bare = countingStore(PATH, DB)
    await query(handlers(bare.store))
    expect(bare.state.reads).toBe(COLD_VFS)

    const withCache = countingStore(PATH, DB)
    await query(handlers(withCache.store, memoryBlockCache()), 'v1')
    expect(withCache.state.reads).toBe(COLD_L2)
  })

  test('a fresh handler over a warm cache does no store reads at all', async () => {
    const cache = memoryBlockCache()
    const first = countingStore(PATH, DB)
    await query(handlers(first.store, cache), 'v1')
    expect(first.state.reads).toBe(COLD_L2)

    // A new `createTableHandlers` is a new isolate: no connection, no
    // VFS cache, no compiled wasm. Only the block cache survives — and
    // it is the part that was network.
    const second = countingStore(PATH, DB)
    await query(handlers(second.store, cache), 'v1')
    expect(second.state.reads).toBe(0)
  })

  test('without a version the cache is skipped, and stays empty', async () => {
    const cache = memoryBlockCache()
    const first = countingStore(PATH, DB)
    await query(handlers(first.store, cache))
    const second = countingStore(PATH, DB)
    await query(handlers(second.store, cache))
    expect([first.state.reads, second.state.reads]).toEqual([COLD_VFS, COLD_VFS])
  })

  test('a version bump re-reads rather than serving the old file\'s pages', async () => {
    const cache = memoryBlockCache()
    const { store, state } = countingStore(PATH, DB)
    const h = handlers(store, cache)

    await query(h, 'v1')
    state.reads = 0
    // Same handler, same path, new version. Both caches are keyed on
    // contents, so neither the warm connection nor the warm blocks may
    // be reused.
    await query(h, 'v2')
    expect(state.reads).toBe(COLD_L2)
  })
})

describe('a file re-uploaded under a live handler', () => {
  const firstRegion = (h: Handlers, version: string) =>
    catalogFor(h, version).source('regions')
      .page({ offset: 0, limit: 1, sort: { column: 'code', dir: 'asc' } })
      .then(r => r.rows)

  test('a new version sees the new bytes', async () => {
    const { store, state } = countingStore(PATH, DB)
    const h = handlers(store, memoryBlockCache())

    expect(await firstRegion(h, 'v1')).toEqual([{ code: 'chi', name: 'Chicago' }])
    state.bytes = DB2
    expect(await firstRegion(h, 'v2')).toEqual([{ code: 'bos', name: 'Boston' }])
  })

  test('reusing the version serves the old file — which is why versions matter', async () => {
    // Not a wart being documented as a feature: it is the contract. The
    // caller promises a version names fixed bytes, and this is what
    // breaking that promise looks like.
    const { store, state } = countingStore(PATH, DB)
    const h = handlers(store, memoryBlockCache())

    expect(await firstRegion(h, 'v1')).toEqual([{ code: 'chi', name: 'Chicago' }])
    state.bytes = DB2
    expect(await firstRegion(h, 'v1')).toEqual([{ code: 'chi', name: 'Chicago' }])
  })
})
