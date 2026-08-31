import { Store } from '../index.cjs';

/** The only thing the VFS needs: a size, and ranged reads. */
interface RangeReader {
    /** Total object size in bytes. */
    readonly size: number;
    /** Bytes `[offset, offset + length)`. May return fewer bytes only at
     *  EOF; the VFS zero-fills and reports a short read. */
    read(offset: number, length: number): Promise<Uint8Array>;
}
/** Adapt a `Store` to `RangeReader`.
 *
 *  Goes through `asyncBufferFromStore` for the size, which already
 *  handles the S3-CORS case where `Content-Range` is stripped and the
 *  1-byte-range size probe silently reports `1`. */
declare function rangeReaderFromStore(store: Store, path: string): Promise<RangeReader>;
interface StoreVFSOptions {
    /** Smallest read issued, in bytes. Also the cache granularity.
     *
     *  Small is right for the first queries — listing tables is a single
     *  page — and wrong for a scan, so this is a floor rather than a fixed
     *  size; see `maxBlockBytes`. */
    minBlockBytes?: number;
    /** Largest read issued, in bytes.
     *
     *  Sequential access doubles the block size up to this, which is the
     *  dial between round-trips and bandwidth: over HTTP, a full scan of
     *  a 1827-page table costs 900 requests at 4 KiB and 15 at 256 KiB.
     *  A Worker reading through an R2 binding should raise both bounds —
     *  its bandwidth is local — while a browser on a slow link wants the
     *  small floor for first paint. */
    maxBlockBytes?: number;
    /** Cache ceiling. Least-recently-used blocks are dropped past it.
     *
     *  The cache is why this is usable at all: an unindexed `ORDER BY`
     *  reads the entire table *before returning its first row*, so the
     *  difference between a warm and cold cache is the difference between
     *  a paginated table and a stall on every click. Sized to hold a
     *  small database whole. */
    maxCacheBytes?: number;
}
interface VFSStats {
    /** Ranged reads issued to the underlying reader. Over HTTP this is
     *  the round-trip count, which is what actually costs. */
    reads: number;
    /** Bytes fetched. */
    bytes: number;
    /** Block lookups served from cache. */
    hits: number;
    /** Block lookups that had to fetch. */
    misses: number;
    /** Blocks dropped by the LRU. Non-zero means `maxCacheBytes` is
     *  smaller than the working set, and scans will re-fetch. */
    evictions: number;
}
/** The filename to open a `StoreVFS` with.
 *
 *  Short on purpose. One `StoreVFS` serves one object — it holds the
 *  reader — so the name carries no information, and wa-sqlite's
 *  distributed build ignores `mxPathName` and allocates SQLite's default
 *  64 bytes regardless of what a VFS asks for. Passing a real store key
 *  through would break on long ones for no benefit. */
declare const SQLITE_FILENAME = "db";
/** `VFS.Base`, retyped.
 *
 *  wa-sqlite 1.0.0's bundled `.d.ts` describes a newer VFS contract than
 *  the JavaScript it ships: it types `xRead`'s buffer as
 *  `{ size, value }`, while `dist/wa-sqlite-async.mjs` calls
 *  `xRead(fileId, HEAPU8.subarray(…), offset)` with a plain
 *  `Uint8Array`. Checking our overrides against the wrong contract
 *  produces errors that would be wrong to "fix". Declaring the shape we
 *  actually inherit — the runtime defaults, plus the `handleAsync` that
 *  registration installs — keeps the inheritance and drops the bad
 *  signatures. */
declare const VFSBase: new () => {
    /** Installed by `vfs_register` on an Asyncify build. Unwinds the wasm
     *  stack, awaits, and rewinds — which is what lets `xRead` be async. */
    handleAsync(f: () => Promise<number>): number;
};
declare class StoreVFS extends VFSBase {
    name: string;
    readonly stats: VFSStats;
    private readonly reader;
    private readonly minBlock;
    private readonly maxBlock;
    private readonly maxCache;
    /** Block index → its bytes. Every block is `minBlock` long (short only
     *  at EOF), so lookup is one aligned `Map` hit rather than a search.
     *
     *  Insertion-ordered, so the first key is the least recently used — a
     *  `Map` is already an LRU if you re-insert on hit. */
    private readonly blocks;
    private cacheBytes;
    /** Readahead state. Blocks stay a fixed size; what grows is how many
     *  of them one request fetches. A miss at the block right after the
     *  last fetch is a scan, and doubling turns 900 requests into 15.
     *
     *  Growing the *block* size instead would be the obvious move and is
     *  wrong: re-aligning to a larger size rounds the offset *down*, so
     *  each grown read re-fetches bytes already cached. */
    private nextBlock;
    private readahead;
    private readonly maxReadahead;
    private sectorSize;
    private readonly openFiles;
    constructor(reader: RangeReader, opts?: StoreVFSOptions);
    /** Drop every cached block. */
    clearCache(): void;
    xOpen(name: string | null, fileId: number, flags: number, pOutFlags: DataView): number;
    xClose(fileId: number): number;
    /** Nothing but the database exists — in particular no `-journal` and
     *  no `-wal`, which SQLite probes for on open. */
    xAccess(_name: string, _flags: number, pResOut: DataView): number;
    xDelete(_name: string, _syncDir: number): number;
    xFileSize(_fileId: number, pSize64: DataView): number;
    xRead(_fileId: number, pData: Uint8Array, iOffset: number): number;
    xWrite(): number;
    xTruncate(): number;
    xSync(): number;
    xSectorSize(): number;
    /** The bytes never change under us, which lets SQLite skip work it
     *  would otherwise do to guard against concurrent writers. */
    xDeviceCharacteristics(): number;
    xLock(): number;
    xUnlock(): number;
    xCheckReservedLock(_fileId: number, pResOut: DataView): number;
    /** Block `index`, fetching it — and its readahead run — if absent. */
    private blockFor;
    private evict;
}

export { type RangeReader, SQLITE_FILENAME, StoreVFS, type StoreVFSOptions, type VFSStats, rangeReaderFromStore };
