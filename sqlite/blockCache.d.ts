import { RangeReader } from './vfs.js';
import { Store } from '../index.js';

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

/** Somewhere to put bytes that outlives one connection.
 *
 *  Deliberately tiny, and deliberately allowed to forget: every method
 *  may fail or return nothing, and the reader falls back to a real read.
 *  Nothing may depend on a hit. */
interface BlockCache {
    get(key: string): Promise<Uint8Array | undefined>;
    put(key: string, bytes: Uint8Array): Promise<void>;
}
interface BlockCacheStats {
    /** Blocks served by the cache. */
    hits: number;
    /** Blocks that had to be fetched. */
    misses: number;
    /** Ranged reads issued to the underlying reader. Lower than `misses`
     *  when contiguous misses coalesce, which is the point. */
    reads: number;
    /** Bytes fetched from the underlying reader. */
    bytes: number;
}
interface CachedRangeReaderOptions {
    cache: BlockCache;
    /** Identity of the file's *contents*. Include a version. */
    key: string;
    /** Block granularity. Bigger blocks mean fewer, larger cache entries
     *  and more waste on a random-access workload; 64 KiB is 16 SQLite
     *  pages at the common 4 KiB page size. */
    blockBytes?: number;
}
interface CachedRangeReader extends RangeReader {
    readonly stats: BlockCacheStats;
    /** Settles when every in-flight `put` has finished.
     *
     *  Writes are not awaited on the read path — a cache write should
     *  never be in front of a query — so a Worker should hand this to
     *  `ctx.waitUntil` to keep them alive past the response. Tests await
     *  it before asserting. */
    flush(): Promise<void>;
}
/** Wrap a `RangeReader` so its reads are served from `cache` where
 *  possible, and written back where not. */
declare function cachedRangeReader(reader: RangeReader, opts: CachedRangeReaderOptions): CachedRangeReader;
/** `cachedRangeReader` over a `Store`, with the size cached too.
 *
 *  With a warm cache this reaches the store zero times — which
 *  `rangeReaderFromStore` alone cannot manage, since it must probe for
 *  the size before there is anything to cache against. Safe for exactly
 *  the reason the blocks are: `key` names fixed contents, and a file's
 *  size is part of its contents. */
declare function cachedRangeReaderFromStore(store: Store, path: string, opts: CachedRangeReaderOptions): Promise<CachedRangeReader>;
/** A `BlockCache` in a `Map`, with an LRU bound.
 *
 *  For Node, and for tests. In a long-lived process this is a genuine
 *  shared cache; in a Worker it is per-isolate and therefore no better
 *  than the VFS's own. */
declare function memoryBlockCache(maxBytes?: number): BlockCache;
interface WorkersBlockCacheOptions {
    /** Defaults to `caches.default`. */
    cache?: Cache;
    /** Host for the synthetic cache keys. Never resolved — the Cache API
     *  keys on a URL, so one is manufactured. Change it to partition two
     *  deployments sharing a zone. */
    host?: string;
    /** `ctx.waitUntil`, so writes survive the response. Without it a
     *  write racing the end of a request may simply be dropped, which is
     *  a missed hit and nothing worse. */
    waitUntil?: (p: Promise<unknown>) => void;
    /** `max-age` on stored blocks, seconds. Keys carry a version, so this
     *  can be long. Default 7 days. */
    maxAge?: number;
}
/** A `BlockCache` over the Cloudflare Cache API.
 *
 *  Scoped to one colo, not the world — "shared across invocations"
 *  means invocations in that data center. Evictable at any time. */
declare function workersBlockCache(opts?: WorkersBlockCacheOptions): BlockCache;

export { type BlockCache, type BlockCacheStats, type CachedRangeReader, type CachedRangeReaderOptions, type WorkersBlockCacheOptions, cachedRangeReader, cachedRangeReaderFromStore, memoryBlockCache, workersBlockCache };
