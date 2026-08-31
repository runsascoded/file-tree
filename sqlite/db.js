// src/sqlite/db.ts
import * as SQLite from "wa-sqlite";
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";

// src/sqlite/vfs.ts
import * as VFS from "wa-sqlite/src/VFS.js";
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

// src/sqlite/db.ts
async function createSqliteModule(source) {
  const config = {};
  if (source.wasmModule) {
    config.locateFile = (name) => name;
    config.instantiateWasm = (imports, receiveInstance) => {
      const instance = new WebAssembly.Instance(source.wasmModule, imports);
      return receiveInstance(instance);
    };
  } else if (source.wasmBinary) {
    config.wasmBinary = source.wasmBinary;
  } else if (source.wasmUrl) {
    config.locateFile = () => source.wasmUrl;
  } else {
    throw new Error("createSqliteModule: one of wasmUrl, wasmBinary or wasmModule is required");
  }
  return SQLite.Factory(await SQLiteESMFactory(config));
}
function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}
var uniqueVfsName = 0;
var SqliteDb = class _SqliteDb {
  sqlite3;
  vfs;
  db;
  closed = false;
  /** A SQLite connection is not reentrant: two `sqlite3_step` loops
   *  interleaved on one handle is misuse, and SQLite says so
   *  (`SQLITE_MISUSE`, "bad parameter or other API misuse"). Every
   *  `await` in `select` is a chance for that to happen — a filter
   *  keystroke landing mid-page-load is enough, and React's
   *  double-invoked effects in development guarantee it. So work is
   *  chained rather than run concurrently. */
  queue = Promise.resolve();
  constructor(sqlite3, vfs, db) {
    this.sqlite3 = sqlite3;
    this.vfs = vfs;
    this.db = db;
  }
  static async open(reader, source, opts = {}) {
    const { runtime, ...vfsOpts } = opts;
    const sqlite3 = runtime ?? await createSqliteModule(source);
    const vfs = new StoreVFS(reader, vfsOpts);
    vfs.name = `file-tree-${uniqueVfsName++}`;
    sqlite3.vfs_register(vfs, false);
    const db = await sqlite3.open_v2(SQLITE_FILENAME, SQLite.SQLITE_OPEN_READONLY, vfs.name);
    return new _SqliteDb(sqlite3, vfs, db);
  }
  /** Ranged reads and cache hits so far — the number a UI can show to
   *  explain why something was fast or slow. */
  get stats() {
    return this.vfs.stats;
  }
  /** Run `work` after everything already queued on this connection. */
  serialize(work) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {
    });
    return next;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.serialize(async () => {
      await this.sqlite3.close(this.db);
    });
  }
  /** Run `sql`, binding `params` positionally. */
  async select(sql, params = []) {
    return this.serialize(async () => {
      if (this.closed) throw new Error("SqliteDb: connection is closed");
      const rows = [];
      let columns = [];
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        if (params.length) this.sqlite3.bind_collection(stmt, params);
        columns = this.sqlite3.column_names(stmt);
        while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          const values = this.sqlite3.row(stmt);
          rows.push(Object.fromEntries(columns.map((c, i) => [c, values[i] ?? null])));
        }
      }
      return { columns, rows };
    });
  }
  /** Tables and views, in name order.
   *
   *  Excludes SQLite's own `sqlite_%` bookkeeping, which is never what
   *  someone opening a `.db` came to look at. */
  async objects() {
    const { rows } = await this.select(
      `select name, type, sql from sqlite_master
       where type in ('table','view') and name not like 'sqlite_%'
       order by type, name`
    );
    return rows.map((r) => ({
      name: String(r.name),
      type: r.type === "view" ? "view" : "table",
      sql: r.sql === null ? null : String(r.sql)
    }));
  }
  /** Columns of one table or view, in declaration order. */
  async columns(table) {
    const { rows } = await this.select(
      'select name, type, "notnull", pk from pragma_table_info(?)',
      [table]
    );
    return rows.map((r) => ({
      name: String(r.name),
      declaredType: String(r.type ?? ""),
      notNull: Number(r.notnull) === 1,
      primaryKey: Number(r.pk) > 0
    }));
  }
  /** `select count(*)`, which SQLite answers from the smallest covering
   *  index rather than the table. Still a scan of *something*, so it's
   *  separate from `page` — a caller that doesn't need a total shouldn't
   *  pay for one. */
  async count(table, where) {
    const { rows } = await this.select(
      `select count(*) as n from ${quoteIdent(table)}${where ? ` where ${where.sql}` : ""}`,
      where?.params ?? []
    );
    return Number(rows[0]?.n ?? 0);
  }
};
export {
  SqliteDb,
  createSqliteModule,
  quoteIdent
};
//# sourceMappingURL=db.js.map