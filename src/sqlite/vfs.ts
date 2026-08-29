/** A SQLite VFS backed by ranged reads.
 *
 *  `Store.get(path, { offset, length })` is already exactly what a VFS
 *  `xRead` needs, so one implementation covers every deployment shape
 *  the SQLite viewer can take:
 *
 *  - browser + `HttpStore` — the database stays on the origin and the
 *    page pulls the ~4 KiB it needs per query
 *  - Cloudflare Worker + `R2Store` — the same class, except the seeking
 *    happens next to the data and the browser sees one request per query
 *  - Node + anything — how the tests run
 *
 *  Deliberately no React and no `Store` import in the hot path: a Worker
 *  wants this with neither in sight. `RangeReader` is the whole
 *  dependency; `rangeReaderFromStore` adapts a `Store` to it for callers
 *  that have one.
 *
 *  **Read-only.** Writes return `SQLITE_READONLY` rather than being
 *  quietly dropped, and journals/temp files are refused at `xOpen` —
 *  a read-only connection never asks for them, so a request for one
 *  means something is wrong and should say so.
 *
 *  Requires wa-sqlite's *Asyncify* build (`wa-sqlite-async.mjs`): the
 *  reads are async, and the synchronous build cannot await. See
 *  `specs/sqlite-and-table-sources.md` for the two non-obvious options
 *  needed to load that build inside a Worker.
 */
/// <reference types="wa-sqlite" />
// wa-sqlite ships no `.d.ts` beside `src/VFS.js`; the declarations for
// it are ambient, inside the types entry the root import resolves to.
// Nothing here imports the root, so pull them in explicitly.
import * as VFS from 'wa-sqlite/src/VFS.js'
import type { Store } from '../types'
import { asyncBufferFromStore } from '../react/asyncBuffer'

/** The only thing the VFS needs: a size, and ranged reads. */
export interface RangeReader {
  /** Total object size in bytes. */
  readonly size: number
  /** Bytes `[offset, offset + length)`. May return fewer bytes only at
   *  EOF; the VFS zero-fills and reports a short read. */
  read(offset: number, length: number): Promise<Uint8Array>
}

/** Adapt a `Store` to `RangeReader`.
 *
 *  Goes through `asyncBufferFromStore` for the size, which already
 *  handles the S3-CORS case where `Content-Range` is stripped and the
 *  1-byte-range size probe silently reports `1`. */
export async function rangeReaderFromStore(store: Store, path: string): Promise<RangeReader> {
  const buf = await asyncBufferFromStore(store, path)
  return {
    size: buf.byteLength,
    async read(offset: number, length: number): Promise<Uint8Array> {
      const r = await store.get(path, { offset, length })
      return r.bytes
    },
  }
}

export interface StoreVFSOptions {
  /** Smallest read issued, in bytes. Also the cache granularity.
   *
   *  Small is right for the first queries — listing tables is a single
   *  page — and wrong for a scan, so this is a floor rather than a fixed
   *  size; see `maxBlockBytes`. */
  minBlockBytes?: number
  /** Largest read issued, in bytes.
   *
   *  Sequential access doubles the block size up to this, which is the
   *  dial between round-trips and bandwidth: over HTTP, a full scan of
   *  a 1827-page table costs 900 requests at 4 KiB and 15 at 256 KiB.
   *  A Worker reading through an R2 binding should raise both bounds —
   *  its bandwidth is local — while a browser on a slow link wants the
   *  small floor for first paint. */
  maxBlockBytes?: number
  /** Cache ceiling. Least-recently-used blocks are dropped past it.
   *
   *  The cache is why this is usable at all: an unindexed `ORDER BY`
   *  reads the entire table *before returning its first row*, so the
   *  difference between a warm and cold cache is the difference between
   *  a paginated table and a stall on every click. Sized to hold a
   *  small database whole. */
  maxCacheBytes?: number
}

const DEFAULTS = {
  minBlockBytes: 8 * 1024,
  maxBlockBytes: 256 * 1024,
  maxCacheBytes: 64 * 1024 * 1024,
}

export interface VFSStats {
  /** Ranged reads issued to the underlying reader. Over HTTP this is
   *  the round-trip count, which is what actually costs. */
  reads: number
  /** Bytes fetched. */
  bytes: number
  /** Block lookups served from cache. */
  hits: number
  /** Block lookups that had to fetch. */
  misses: number
  /** Blocks dropped by the LRU. Non-zero means `maxCacheBytes` is
   *  smaller than the working set, and scans will re-fetch. */
  evictions: number
}

/** SQLite's on-disk page size lives at offset 16 of the header. Used as
 *  the sector size so SQLite's own alignment matches ours. */
const HEADER_PAGE_SIZE_OFFSET = 16

/** The filename to open a `StoreVFS` with.
 *
 *  Short on purpose. One `StoreVFS` serves one object — it holds the
 *  reader — so the name carries no information, and wa-sqlite's
 *  distributed build ignores `mxPathName` and allocates SQLite's default
 *  64 bytes regardless of what a VFS asks for. Passing a real store key
 *  through would break on long ones for no benefit. */
export const SQLITE_FILENAME = 'db'

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
const VFSBase = VFS.Base as unknown as new () => {
  /** Installed by `vfs_register` on an Asyncify build. Unwinds the wasm
   *  stack, awaits, and rewinds — which is what lets `xRead` be async. */
  handleAsync(f: () => Promise<number>): number
}

export class StoreVFS extends VFSBase {
  name = 'store'

  readonly stats: VFSStats = { reads: 0, bytes: 0, hits: 0, misses: 0, evictions: 0 }

  private readonly reader: RangeReader
  private readonly minBlock: number
  private readonly maxBlock: number
  private readonly maxCache: number

  /** Block index → its bytes. Every block is `minBlock` long (short only
   *  at EOF), so lookup is one aligned `Map` hit rather than a search.
   *
   *  Insertion-ordered, so the first key is the least recently used — a
   *  `Map` is already an LRU if you re-insert on hit. */
  private readonly blocks = new Map<number, Uint8Array>()
  private cacheBytes = 0

  /** Readahead state. Blocks stay a fixed size; what grows is how many
   *  of them one request fetches. A miss at the block right after the
   *  last fetch is a scan, and doubling turns 900 requests into 15.
   *
   *  Growing the *block* size instead would be the obvious move and is
   *  wrong: re-aligning to a larger size rounds the offset *down*, so
   *  each grown read re-fetches bytes already cached. */
  private nextBlock = -1
  private readahead = 1
  private readonly maxReadahead: number

  private sectorSize = 4096
  private readonly openFiles = new Set<number>()

  constructor(reader: RangeReader, opts: StoreVFSOptions = {}) {
    super()
    this.reader = reader
    this.minBlock = opts.minBlockBytes ?? DEFAULTS.minBlockBytes
    this.maxBlock = opts.maxBlockBytes ?? DEFAULTS.maxBlockBytes
    this.maxCache = opts.maxCacheBytes ?? DEFAULTS.maxCacheBytes
    this.maxReadahead = Math.max(1, Math.floor(this.maxBlock / this.minBlock))
  }

  /** Drop every cached block. */
  clearCache(): void {
    this.blocks.clear()
    this.cacheBytes = 0
    this.nextBlock = -1
    this.readahead = 1
  }

  // --- VFS surface -------------------------------------------------

  xOpen(name: string | null, fileId: number, flags: number, pOutFlags: DataView): number {
    // `null` is SQLite asking for a temporary file. Refusing is correct
    // rather than defensive: this VFS has no writable storage, and
    // wa-sqlite is built with in-memory temp storage, so a read-only
    // connection never gets here.
    if (name === null) return VFS.SQLITE_CANTOPEN
    this.openFiles.add(fileId)
    pOutFlags.setInt32(0, flags | VFS.SQLITE_OPEN_READONLY, true)
    return VFS.SQLITE_OK
  }

  xClose(fileId: number): number {
    this.openFiles.delete(fileId)
    return VFS.SQLITE_OK
  }

  /** Nothing but the database exists — in particular no `-journal` and
   *  no `-wal`, which SQLite probes for on open. */
  xAccess(_name: string, _flags: number, pResOut: DataView): number {
    pResOut.setInt32(0, 0, true)
    return VFS.SQLITE_OK
  }

  xDelete(_name: string, _syncDir: number): number {
    return VFS.SQLITE_OK
  }

  xFileSize(_fileId: number, pSize64: DataView): number {
    pSize64.setBigInt64(0, BigInt(this.reader.size), true)
    return VFS.SQLITE_OK
  }

  xRead(_fileId: number, pData: Uint8Array, iOffset: number): number {
    return this.handleAsync(async () => {
      const n = pData.byteLength
      if (iOffset >= this.reader.size) {
        pData.fill(0)
        return VFS.SQLITE_IOERR_SHORT_READ
      }
      let written = 0
      while (written < n) {
        const pos = iOffset + written
        if (pos >= this.reader.size) break
        const index = Math.floor(pos / this.minBlock)
        const bytes = await this.blockFor(index)
        const inBlock = pos - index * this.minBlock
        const take = Math.min(n - written, bytes.byteLength - inBlock)
        if (take <= 0) break
        pData.set(bytes.subarray(inBlock, inBlock + take), written)
        written += take
      }
      if (written < n) {
        pData.fill(0, written)
        return VFS.SQLITE_IOERR_SHORT_READ
      }
      // The header carries the page size; matching it as our sector
      // size keeps SQLite's own read alignment in step with the cache.
      if (iOffset === 0 && n >= HEADER_PAGE_SIZE_OFFSET + 2) {
        const raw = new DataView(pData.buffer, pData.byteOffset).getUint16(HEADER_PAGE_SIZE_OFFSET)
        // 1 encodes 65536; anything else is the size itself.
        this.sectorSize = raw === 1 ? 65536 : raw
      }
      return VFS.SQLITE_OK
    })
  }

  xWrite(): number { return VFS.SQLITE_READONLY }
  xTruncate(): number { return VFS.SQLITE_READONLY }
  xSync(): number { return VFS.SQLITE_OK }
  xSectorSize(): number { return this.sectorSize }

  /** The bytes never change under us, which lets SQLite skip work it
   *  would otherwise do to guard against concurrent writers. */
  xDeviceCharacteristics(): number { return VFS.SQLITE_IOCAP_IMMUTABLE }

  xLock(): number { return VFS.SQLITE_OK }
  xUnlock(): number { return VFS.SQLITE_OK }

  xCheckReservedLock(_fileId: number, pResOut: DataView): number {
    pResOut.setInt32(0, 0, true)
    return VFS.SQLITE_OK
  }

  // --- block cache -------------------------------------------------

  /** Block `index`, fetching it — and its readahead run — if absent. */
  private async blockFor(index: number): Promise<Uint8Array> {
    const cached = this.blocks.get(index)
    if (cached) {
      this.stats.hits++
      // Re-insert to mark most-recently-used.
      this.blocks.delete(index)
      this.blocks.set(index, cached)
      return cached
    }
    this.stats.misses++

    this.readahead = index === this.nextBlock
      ? Math.min(this.readahead * 2, this.maxReadahead)
      : 1

    const offset = index * this.minBlock
    const length = Math.min(this.readahead * this.minBlock, this.reader.size - offset)
    const bytes = await this.reader.read(offset, length)
    this.stats.reads++
    this.stats.bytes += bytes.byteLength

    // Split the run into blocks. `subarray` is a view, so splitting is
    // free, and a run's blocks age independently in the LRU. Note the
    // views share one `ArrayBuffer`: the memory comes back when the last
    // block of a run is evicted, not the first.
    for (let i = 0; i * this.minBlock < bytes.byteLength; i++) {
      const block = bytes.subarray(i * this.minBlock, (i + 1) * this.minBlock)
      this.blocks.set(index + i, block)
      this.cacheBytes += block.byteLength
    }
    this.nextBlock = index + Math.ceil(bytes.byteLength / this.minBlock)
    this.evict()
    return this.blocks.get(index)!
  }

  private evict(): void {
    while (this.cacheBytes > this.maxCache && this.blocks.size > 1) {
      const oldest = this.blocks.keys().next().value as number
      const block = this.blocks.get(oldest)!
      this.blocks.delete(oldest)
      this.cacheBytes -= block.byteLength
      this.stats.evictions++
    }
  }
}
