"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/sqlite.ts
var sqlite_exports = {};
__export(sqlite_exports, {
  createTableHandlers: () => createTableHandlers
});
module.exports = __toCommonJS(sqlite_exports);

// src/sqlite/db.ts
var SQLite = __toESM(require("wa-sqlite"), 1);
var import_wa_sqlite_async = __toESM(require("wa-sqlite/dist/wa-sqlite-async.mjs"), 1);

// src/sqlite/vfs.ts
var VFS = __toESM(require("wa-sqlite/src/VFS.js"), 1);

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
  return SQLite.Factory(await (0, import_wa_sqlite_async.default)(config));
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

// src/renderers/tableSource.ts
function kindOfDeclaredType(declared) {
  const t = declared.toUpperCase();
  if (t.includes("INT")) return "number";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "string";
  if (t.includes("BLOB") || t === "") return "binary";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "number";
  if (t.includes("DATE") || t.includes("TIME")) return "temporal";
  if (t.includes("BOOL")) return "boolean";
  if (t.includes("DEC") || t.includes("NUM")) return "number";
  return "string";
}

// src/sqlite/tableSource.ts
var CAPABILITIES = {
  sort: true,
  filter: true,
  total: true,
  randomAccess: true
};
function sqliteTableSource(db, table, opts = {}) {
  const countRows = opts.countRows ?? true;
  const quoted = quoteIdent(table);
  let columnsPromise = null;
  const totals = /* @__PURE__ */ new Map();
  async function columns() {
    columnsPromise ??= db.columns(table).then((cols) => cols.map((c) => ({
      name: c.name,
      kind: kindOfDeclaredType(c.declaredType)
    })));
    return columnsPromise;
  }
  async function whereFor(filter) {
    const needle = filter?.trim() ?? "";
    if (!needle) return null;
    const cols = await columns();
    if (!cols.length) return null;
    const escaped = needle.replace(/[\\%_]/g, (m) => `\\${m}`);
    return {
      sql: cols.map((c) => `cast(${quoteIdent(c.name)} as text) like ? escape '\\'`).join(" or "),
      params: cols.map(() => `%${escaped}%`)
    };
  }
  async function page(req) {
    const cols = await columns();
    const where = await whereFor(req.filter);
    const sortCol = req.sort && cols.some((c) => c.name === req.sort.column) ? req.sort : void 0;
    const sql = [
      `select * from ${quoted}`,
      where ? `where ${where.sql}` : "",
      sortCol ? `order by ${quoteIdent(sortCol.column)} ${sortCol.dir === "desc" ? "desc" : "asc"}` : "",
      "limit ? offset ?"
    ].filter(Boolean).join(" ");
    const { rows } = await db.select(sql, [...where?.params ?? [], req.limit, req.offset]);
    let total = null;
    if (countRows) {
      const key = where?.sql ? JSON.stringify(where.params) : "";
      total = totals.get(key) ?? await db.count(table, where ?? void 0).then((n) => {
        totals.set(key, n);
        return n;
      });
    }
    return { rows, columns: cols, total, offset: req.offset };
  }
  return {
    columns,
    page,
    capabilities: countRows ? CAPABILITIES : { ...CAPABILITIES, total: false }
  };
}

// src/sqlite/blockCache.ts
var DEFAULT_BLOCK_BYTES = 64 * 1024;
function cachedRangeReader(reader, opts) {
  const block = opts.blockBytes ?? DEFAULT_BLOCK_BYTES;
  const { cache, key } = opts;
  const stats = { hits: 0, misses: 0, reads: 0, bytes: 0 };
  const size = reader.size;
  const pending = /* @__PURE__ */ new Set();
  const blockLen = (i) => Math.min(block, size - i * block);
  function write(i, bytes) {
    const p = cache.put(`${key}#${i}`, bytes).catch(() => {
    }).finally(() => {
      pending.delete(p);
    });
    pending.add(p);
  }
  async function cached(i) {
    const got = await cache.get(`${key}#${i}`).catch(() => void 0);
    return got?.byteLength === blockLen(i) ? got : void 0;
  }
  async function read(offset, length) {
    const end = Math.min(offset + length, size);
    if (end <= offset) return new Uint8Array(0);
    const first = Math.floor(offset / block);
    const last = Math.floor((end - 1) / block);
    const count = last - first + 1;
    const blocks = await Promise.all(
      Array.from({ length: count }, (_, n) => cached(first + n))
    );
    for (let n = 0; n < count; n++) {
      if (blocks[n]) {
        stats.hits++;
        continue;
      }
      let m = n;
      while (m + 1 < count && !blocks[m + 1]) m++;
      stats.misses += m - n + 1;
      const runOffset = (first + n) * block;
      const runEnd = Math.min((first + m + 1) * block, size);
      const bytes = await reader.read(runOffset, runEnd - runOffset);
      stats.reads++;
      stats.bytes += bytes.byteLength;
      for (let k = n; k <= m; k++) {
        const start = (k - n) * block;
        if (start >= bytes.byteLength) break;
        const slice = bytes.subarray(start, Math.min(start + block, bytes.byteLength));
        blocks[k] = slice;
        write(first + k, slice);
      }
      n = m;
    }
    const out = new Uint8Array(end - offset);
    for (let n = 0; n < count; n++) {
      const bytes = blocks[n];
      if (!bytes) continue;
      const blockStart = (first + n) * block;
      const from = Math.max(offset, blockStart);
      const to = Math.min(end, blockStart + bytes.byteLength);
      if (to <= from) continue;
      out.set(bytes.subarray(from - blockStart, to - blockStart), from - offset);
    }
    return out;
  }
  return {
    size,
    read,
    stats,
    async flush() {
      await Promise.all([...pending]);
    }
  };
}
var SIZE_KEY = "#size";
async function cachedRangeReaderFromStore(store, path, opts) {
  const stored = await opts.cache.get(opts.key + SIZE_KEY).catch(() => void 0);
  if (stored?.byteLength === 8) {
    const size = new DataView(stored.buffer, stored.byteOffset, 8).getFloat64(0);
    if (Number.isSafeInteger(size) && size >= 0) {
      return cachedRangeReader({
        size,
        read: (offset, length) => store.get(path, { offset, length }).then((r) => r.bytes)
      }, opts);
    }
  }
  const reader = await rangeReaderFromStore(store, path);
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, reader.size);
  await opts.cache.put(opts.key + SIZE_KEY, bytes).catch(() => {
  });
  return cachedRangeReader(reader, opts);
}

// src/server/sqlite.ts
var DEFAULT_MAX_CONNECTIONS = 4;
var DEFAULT_MAX_LIMIT = 1e3;
function createTableHandlers(store, opts) {
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const cors = opts.corsOrigin === void 0 ? "*" : opts.corsOrigin;
  const corsHeaders = cors ? { "Access-Control-Allow-Origin": cors } : {};
  const maxConnections = opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const maxLimit = opts.maxLimit ?? DEFAULT_MAX_LIMIT;
  let runtimePromise = null;
  const open = [];
  const cacheKey = (path, version) => `${path}\0${version ?? ""}`;
  async function connectionFor(path, version) {
    const key = cacheKey(path, version);
    const hit = open.findIndex((c) => c.key === key);
    if (hit >= 0) {
      const [cached] = open.splice(hit, 1);
      open.push(cached);
      return cached;
    }
    let cachedReader;
    if (opts.blockCache && version) {
      cachedReader = await cachedRangeReaderFromStore(store, path, {
        cache: opts.blockCache,
        key: `${path}@${version}`,
        ...opts.blockBytes === void 0 ? {} : { blockBytes: opts.blockBytes }
      });
    }
    const reader = cachedReader ?? await rangeReaderFromStore(store, path);
    runtimePromise ??= createSqliteModule(opts.wasm);
    const db = await SqliteDb.open(reader, opts.wasm, { ...opts.vfs, runtime: await runtimePromise });
    const entry = { db, key, ...cachedReader ? { reader: cachedReader } : {} };
    if (maxConnections <= 0) return entry;
    open.push(entry);
    while (open.length > maxConnections) {
      const evicted = open.shift();
      void evicted.db.close();
    }
    return entry;
  }
  async function release(entry) {
    if (!open.includes(entry)) await entry.db.close();
  }
  return {
    async handle(request, ctx) {
      const url = new URL(request.url);
      const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
      if (route !== "/objects" && route !== "/page") return null;
      const path = url.searchParams.get("path");
      if (!path) return json({ error: "path required" }, 400, corsHeaders);
      let entry;
      try {
        entry = await connectionFor(path, url.searchParams.get("version"));
      } catch (e) {
        return errorJson(e, corsHeaders);
      }
      const { db } = entry;
      try {
        if (route === "/objects") {
          return json({ objects: await db.objects() }, 200, corsHeaders);
        }
        const table = url.searchParams.get("table");
        if (!table) return json({ error: "table required" }, 400, corsHeaders);
        if (!(await db.objects()).some((o) => o.name === table)) {
          return json({ error: `no such table: ${table}` }, 404, corsHeaders);
        }
        const sort = url.searchParams.get("sort");
        const req = {
          offset: clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
          limit: clampInt(url.searchParams.get("limit"), 25, 0, maxLimit),
          ...url.searchParams.get("filter") ? { filter: url.searchParams.get("filter") } : {},
          ...sort ? { sort: { column: sort, dir: url.searchParams.get("dir") === "desc" ? "desc" : "asc" } } : {}
        };
        return json(await sqliteTableSource(db, table).page(req), 200, corsHeaders);
      } catch (e) {
        return errorJson(e, corsHeaders);
      } finally {
        if (entry.reader) ctx?.waitUntil?.(entry.reader.flush());
        await release(entry);
      }
    }
  };
}
function clampInt(raw, fallback, min, max) {
  const n = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra }
  });
}
function errorJson(e, extra) {
  if (e instanceof Error && e.name === "NotFoundError") {
    return json({ error: e.message }, 404, extra);
  }
  return json({ error: e instanceof Error ? e.message : String(e) }, 500, extra);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createTableHandlers
});
//# sourceMappingURL=sqlite.cjs.map