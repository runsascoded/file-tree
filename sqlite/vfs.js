// src/sqlite/vfs.ts
import * as VFS from "wa-sqlite/src/VFS.js";

// src/react/asyncBuffer.ts
async function asyncBufferFromStore(store, path) {
  let byteLength;
  if (typeof store.getUrl === "function") {
    try {
      const r = await fetch(store.getUrl(path), { method: "HEAD" });
      if (r.ok) {
        const cl = parseInt(r.headers.get("Content-Length") ?? "", 10);
        if (Number.isFinite(cl) && cl > 0) byteLength = cl;
      }
    } catch {
    }
  }
  if (byteLength === void 0) {
    const head = await store.get(path, { offset: 0, length: 1 });
    byteLength = head.totalSize ?? head.bytes.byteLength;
  }
  return {
    byteLength,
    async slice(start, end) {
      const e = end ?? byteLength;
      const length = e - start;
      if (length <= 0) return new ArrayBuffer(0);
      const r = await store.get(path, { offset: start, length });
      return r.bytes.buffer.slice(
        r.bytes.byteOffset,
        r.bytes.byteOffset + r.bytes.byteLength
      );
    }
  };
}

// src/sqlite/vfs.ts
async function rangeReaderFromStore(store, path) {
  const buf = await asyncBufferFromStore(store, path);
  return {
    size: buf.byteLength,
    async read(offset, length) {
      const r = await store.get(path, { offset, length });
      return r.bytes;
    }
  };
}
var DEFAULTS = {
  minBlockBytes: 8 * 1024,
  maxBlockBytes: 256 * 1024,
  maxCacheBytes: 64 * 1024 * 1024
};
var HEADER_PAGE_SIZE_OFFSET = 16;
var SQLITE_FILENAME = "db";
var VFSBase = VFS.Base;
var StoreVFS = class extends VFSBase {
  name = "store";
  stats = { reads: 0, bytes: 0, hits: 0, misses: 0, evictions: 0 };
  reader;
  minBlock;
  maxBlock;
  maxCache;
  /** Block index → its bytes. Every block is `minBlock` long (short only
   *  at EOF), so lookup is one aligned `Map` hit rather than a search.
   *
   *  Insertion-ordered, so the first key is the least recently used — a
   *  `Map` is already an LRU if you re-insert on hit. */
  blocks = /* @__PURE__ */ new Map();
  cacheBytes = 0;
  /** Readahead state. Blocks stay a fixed size; what grows is how many
   *  of them one request fetches. A miss at the block right after the
   *  last fetch is a scan, and doubling turns 900 requests into 15.
   *
   *  Growing the *block* size instead would be the obvious move and is
   *  wrong: re-aligning to a larger size rounds the offset *down*, so
   *  each grown read re-fetches bytes already cached. */
  nextBlock = -1;
  readahead = 1;
  maxReadahead;
  sectorSize = 4096;
  openFiles = /* @__PURE__ */ new Set();
  constructor(reader, opts = {}) {
    super();
    this.reader = reader;
    this.minBlock = opts.minBlockBytes ?? DEFAULTS.minBlockBytes;
    this.maxBlock = opts.maxBlockBytes ?? DEFAULTS.maxBlockBytes;
    this.maxCache = opts.maxCacheBytes ?? DEFAULTS.maxCacheBytes;
    this.maxReadahead = Math.max(1, Math.floor(this.maxBlock / this.minBlock));
  }
  /** Drop every cached block. */
  clearCache() {
    this.blocks.clear();
    this.cacheBytes = 0;
    this.nextBlock = -1;
    this.readahead = 1;
  }
  // --- VFS surface -------------------------------------------------
  xOpen(name, fileId, flags, pOutFlags) {
    if (name === null) return VFS.SQLITE_CANTOPEN;
    this.openFiles.add(fileId);
    pOutFlags.setInt32(0, flags | VFS.SQLITE_OPEN_READONLY, true);
    return VFS.SQLITE_OK;
  }
  xClose(fileId) {
    this.openFiles.delete(fileId);
    return VFS.SQLITE_OK;
  }
  /** Nothing but the database exists — in particular no `-journal` and
   *  no `-wal`, which SQLite probes for on open. */
  xAccess(_name, _flags, pResOut) {
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }
  xDelete(_name, _syncDir) {
    return VFS.SQLITE_OK;
  }
  xFileSize(_fileId, pSize64) {
    pSize64.setBigInt64(0, BigInt(this.reader.size), true);
    return VFS.SQLITE_OK;
  }
  xRead(_fileId, pData, iOffset) {
    return this.handleAsync(async () => {
      const n = pData.byteLength;
      if (iOffset >= this.reader.size) {
        pData.fill(0);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      let written = 0;
      while (written < n) {
        const pos = iOffset + written;
        if (pos >= this.reader.size) break;
        const index = Math.floor(pos / this.minBlock);
        const bytes = await this.blockFor(index);
        const inBlock = pos - index * this.minBlock;
        const take = Math.min(n - written, bytes.byteLength - inBlock);
        if (take <= 0) break;
        pData.set(bytes.subarray(inBlock, inBlock + take), written);
        written += take;
      }
      if (written < n) {
        pData.fill(0, written);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      if (iOffset === 0 && n >= HEADER_PAGE_SIZE_OFFSET + 2) {
        const raw = new DataView(pData.buffer, pData.byteOffset).getUint16(HEADER_PAGE_SIZE_OFFSET);
        this.sectorSize = raw === 1 ? 65536 : raw;
      }
      return VFS.SQLITE_OK;
    });
  }
  xWrite() {
    return VFS.SQLITE_READONLY;
  }
  xTruncate() {
    return VFS.SQLITE_READONLY;
  }
  xSync() {
    return VFS.SQLITE_OK;
  }
  xSectorSize() {
    return this.sectorSize;
  }
  /** The bytes never change under us, which lets SQLite skip work it
   *  would otherwise do to guard against concurrent writers. */
  xDeviceCharacteristics() {
    return VFS.SQLITE_IOCAP_IMMUTABLE;
  }
  xLock() {
    return VFS.SQLITE_OK;
  }
  xUnlock() {
    return VFS.SQLITE_OK;
  }
  xCheckReservedLock(_fileId, pResOut) {
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }
  // --- block cache -------------------------------------------------
  /** Block `index`, fetching it — and its readahead run — if absent. */
  async blockFor(index) {
    const cached = this.blocks.get(index);
    if (cached) {
      this.stats.hits++;
      this.blocks.delete(index);
      this.blocks.set(index, cached);
      return cached;
    }
    this.stats.misses++;
    this.readahead = index === this.nextBlock ? Math.min(this.readahead * 2, this.maxReadahead) : 1;
    const offset = index * this.minBlock;
    const length = Math.min(this.readahead * this.minBlock, this.reader.size - offset);
    const bytes = await this.reader.read(offset, length);
    this.stats.reads++;
    this.stats.bytes += bytes.byteLength;
    for (let i = 0; i * this.minBlock < bytes.byteLength; i++) {
      const block = bytes.subarray(i * this.minBlock, (i + 1) * this.minBlock);
      this.blocks.set(index + i, block);
      this.cacheBytes += block.byteLength;
    }
    this.nextBlock = index + Math.ceil(bytes.byteLength / this.minBlock);
    this.evict();
    return this.blocks.get(index);
  }
  evict() {
    while (this.cacheBytes > this.maxCache && this.blocks.size > 1) {
      const oldest = this.blocks.keys().next().value;
      const block = this.blocks.get(oldest);
      this.blocks.delete(oldest);
      this.cacheBytes -= block.byteLength;
      this.stats.evictions++;
    }
  }
};
export {
  SQLITE_FILENAME,
  StoreVFS,
  rangeReaderFromStore
};
//# sourceMappingURL=vfs.js.map