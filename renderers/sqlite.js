// src/renderers/sqlite.tsx
import { useEffect as useEffect3, useMemo as useMemo4, useState as useState4 } from "react";

// src/sqlite/db.ts
import * as SQLite from "wa-sqlite";
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";

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
function sqliteCatalog(db, opts = {}) {
  const sources = /* @__PURE__ */ new Map();
  return {
    objects: () => db.objects(),
    source(name) {
      let source = sources.get(name);
      if (!source) {
        source = sqliteTableSource(db, name, opts);
        sources.set(name, source);
      }
      return source;
    }
  };
}

// src/renderers/tableBrowser.tsx
import {
  useCallback as useCallback3,
  useEffect as useEffect2,
  useMemo as useMemo3,
  useRef as useRef2,
  useState as useState3
} from "react";

// src/react/persistedState.ts
import { useState } from "react";
var defaultUseState = (_key, defaultValue) => useState(defaultValue);

// src/renderers/table.ts
var TD_STYLE = {
  padding: "0.2em 0.6em",
  whiteSpace: "nowrap",
  maxWidth: "30em",
  overflow: "hidden",
  textOverflow: "ellipsis"
};
var TH_STYLE = {
  padding: "0.3em 0.6em",
  textAlign: "left",
  fontWeight: 500,
  borderBottom: "1px solid rgba(127,127,127,0.4)"
};
var NUMERIC_ALIGN = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
function resolveColStyles(columns, path, opts, isNumeric) {
  const out = /* @__PURE__ */ new Map();
  for (const c of columns) {
    const align = isNumeric(c) ? NUMERIC_ALIGN : {};
    const cp = opts.cellProps?.(c, path) || {};
    const hp = opts.headerProps?.(c, path) || {};
    out.set(c.name, {
      cell: { ...TD_STYLE, ...align, ...cp.style },
      header: { ...TH_STYLE, ...align, ...hp.style },
      ...cp.className ? { cellClass: cp.className } : {},
      ...hp.className ? { headerClass: hp.className } : {}
    });
  }
  return out;
}

// src/renderers/tableControls.tsx
import { useCallback, useEffect, useMemo, useRef, useState as useState2 } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var BTN = {
  font: "inherit",
  fontSize: "0.85em",
  lineHeight: 1.4,
  cursor: "pointer",
  padding: "0.15em 0.5em",
  borderRadius: 3,
  color: "inherit",
  border: "1px solid rgba(127,127,127,0.4)",
  background: "transparent"
};
function useColumnVisibility(columns, usePersistedState, initialHidden = []) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("hide", initialHidden.join(","));
  const hidden = useMemo(
    () => new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)),
    [raw]
  );
  const toggle = useCallback((name) => {
    const next = new Set(hidden);
    next.delete(name) || next.add(name);
    setRaw([...next].join(","));
  }, [hidden, setRaw]);
  const showAll = useCallback(() => setRaw(""), [setRaw]);
  const visible = useMemo(
    () => columns.map((c) => c.name).filter((n) => !hidden.has(n)),
    [columns, hidden]
  );
  return { visible, toggle, showAll, hidden };
}
function ColumnPicker({ columns, vis }) {
  const [open, setOpen] = useState2(false);
  const { visible, toggle, showAll, hidden } = vis;
  return (
    // Note the *host* has to be positioned with a z-index for the panel
    // to paint over the table — see the summary line in `parquet.tsx` /
    // `csv.tsx`. A z-index here can't do it alone: this span is a flex
    // item of that line, so it paints in the line's place in the root
    // stacking order, which is before the table.
    /* @__PURE__ */ jsxs("span", { style: { position: "relative", display: "inline-block" }, children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setOpen((o) => !o),
          style: BTN,
          "aria-expanded": open,
          title: "Show or hide columns",
          children: [
            "columns ",
            visible.length,
            "/",
            columns.length
          ]
        }
      ),
      open && /* @__PURE__ */ jsxs(
        "span",
        {
          role: "group",
          "aria-label": "Columns",
          style: {
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 5,
            marginTop: "0.25em",
            padding: "0.4em 0.6em",
            borderRadius: 4,
            whiteSpace: "nowrap",
            border: "1px solid rgba(127,127,127,0.4)",
            background: "Canvas",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            display: "block"
          },
          children: [
            columns.map((c) => /* @__PURE__ */ jsxs("label", { style: { display: "block", cursor: "pointer", fontSize: "0.9em" }, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "checkbox",
                  checked: !hidden.has(c.name),
                  onChange: () => toggle(c.name)
                }
              ),
              " ",
              c.name
            ] }, c.name)),
            hidden.size > 0 && /* @__PURE__ */ jsx("button", { type: "button", onClick: showAll, style: { ...BTN, marginTop: "0.4em" }, children: "show all" })
          ]
        }
      )
    ] })
  );
}
function useFilter(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  return use("q", "");
}
function FilterInput({ value, onChange, count, placeholder = "filter" }) {
  return /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.4em" }, children: [
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "search",
        value,
        onChange: (e) => onChange(e.target.value),
        placeholder,
        spellCheck: false,
        style: {
          font: "inherit",
          fontSize: "0.9em",
          padding: "0.15em 0.4em",
          borderRadius: 3,
          border: "1px solid rgba(127,127,127,0.4)",
          background: "transparent",
          color: "inherit",
          minWidth: "10em"
        }
      }
    ),
    value.trim() !== "" && count && /* @__PURE__ */ jsxs("span", { style: { opacity: 0.7 }, children: [
      count.shown.toLocaleString(),
      " / ",
      count.total.toLocaleString()
    ] })
  ] });
}
function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current?.(...args), []);
}
function usePageNotify(onPage, ctxRef, deps) {
  const notify = useStableCallback(onPage);
  useEffect(() => {
    notify(ctxRef.current);
  }, deps);
}

// src/renderers/tableSort.ts
import { useCallback as useCallback2, useMemo as useMemo2 } from "react";
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = useCallback2((name) => {
    setRaw(raw === name ? `-${name}` : raw === `-${name}` ? "" : name);
  }, [raw, setRaw]);
  return { column, dir, toggle };
}
function sortGlyph(column, sort) {
  if (sort.column !== column) return "\u2195";
  return sort.dir === "asc" ? "\u25B2" : "\u25BC";
}

// src/renderers/tableBrowser.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var DEFAULT_PAGE_SIZE = 100;
var BTN2 = {
  font: "inherit",
  fontSize: "0.85em",
  lineHeight: 1.4,
  cursor: "pointer",
  padding: "0.15em 0.5em",
  borderRadius: 3,
  color: "inherit",
  border: "1px solid rgba(127,127,127,0.4)",
  background: "transparent"
};
var NUMERIC_KINDS = /* @__PURE__ */ new Set(["number"]);
var plural = (n, noun) => `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
function defaultTableCell(value) {
  if (value === null || value === void 0) {
    return /* @__PURE__ */ jsx2("span", { style: { opacity: 0.4 }, children: "null" });
  }
  if (value instanceof Uint8Array) {
    return /* @__PURE__ */ jsx2("span", { style: { opacity: 0.6 }, children: `<${value.byteLength} bytes>` });
  }
  return String(value);
}
function TableBrowser({
  catalog,
  objects,
  path,
  usePersistedState,
  pageSize = DEFAULT_PAGE_SIZE,
  status,
  renderCell,
  renderHeader,
  cellProps,
  headerProps,
  columnPicker = false,
  hiddenColumns,
  onPage,
  onCellHover
}) {
  const use = usePersistedState ?? defaultUseState;
  const [table, setTable] = use("table", "");
  const [page, setPage] = use("page", 0);
  const [filter, setFilter] = useFilter(usePersistedState);
  const sort = useSort(usePersistedState);
  const [result, setResult] = useState3(null);
  const [error, setError] = useState3(null);
  const [loading, setLoading] = useState3(false);
  const active = useMemo3(
    () => objects.find((o) => o.name === table) ?? objects[0] ?? null,
    [objects, table]
  );
  const source = useMemo3(
    () => active ? catalog.source(active.name) : null,
    [catalog, active]
  );
  const can = source?.capabilities;
  const columns = result?.columns ?? [];
  const { visible, ...vis } = useColumnVisibility(columns, usePersistedState, hiddenColumns);
  useEffect2(() => {
    if (!source) return;
    let live = true;
    setLoading(true);
    source.page({
      offset: page * pageSize,
      limit: pageSize,
      ...can?.filter ? { filter } : {},
      ...can?.sort && sort.column ? { sort: { column: sort.column, dir: sort.dir } } : {}
    }).then((r) => {
      if (live) {
        setResult(r);
        setError(null);
      }
    }).catch((e) => {
      if (live) setError(e instanceof Error ? e : new Error(String(e)));
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [source, page, pageSize, filter, sort.column, sort.dir, can?.filter, can?.sort]);
  const queryKey = `${active?.name ?? ""}\0${filter}\0${sort.column ?? ""}${sort.dir}`;
  const lastQueryKey = useRef2(null);
  useEffect2(() => {
    if (lastQueryKey.current !== null && lastQueryKey.current !== queryKey) setPage(0);
    lastQueryKey.current = queryKey;
  }, [queryKey, setPage]);
  const rows = result?.rows ?? [];
  const total = result?.total ?? null;
  const pageStart = result?.offset ?? 0;
  const unfilteredTotals = useRef2(/* @__PURE__ */ new Map());
  if (active && !filter.trim() && total !== null) unfilteredTotals.current.set(active.name, total);
  const unfilteredTotal = active ? unfilteredTotals.current.get(active.name) : void 0;
  const colStyles = useMemo3(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, (c) => NUMERIC_KINDS.has(c.kind)),
    [columns, path, cellProps, headerProps]
  );
  const pageCtxRef = useRef2({ rows: [], columns: [], path, pageStart: 0, totalRows: null });
  pageCtxRef.current = {
    rows,
    columns: columns.filter((c) => visible.includes(c.name)),
    path,
    pageStart,
    totalRows: total
  };
  usePageNotify(onPage, pageCtxRef, [rows, visible, path, pageStart, total]);
  const notifyHover = useStableCallback(onCellHover);
  const hoverHandlers = useCallback3((ctx) => onCellHover ? { onMouseEnter: () => notifyHover(ctx), onMouseLeave: () => notifyHover(null) } : {}, [onCellHover, notifyHover]);
  if (!objects.length) return /* @__PURE__ */ jsx2("div", { style: { opacity: 0.6 }, children: "no tables or views in this file" });
  const lastPage = total === null ? null : Math.max(0, Math.ceil(total / pageSize) - 1);
  const shown = columns.filter((c) => visible.includes(c.name));
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("p", { style: {
      opacity: 0.85,
      fontSize: "0.95em",
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      flexWrap: "wrap",
      position: "relative",
      zIndex: 2
    }, children: [
      objects.length > 1 && /* @__PURE__ */ jsx2(
        "select",
        {
          value: active?.name ?? "",
          onChange: (e) => setTable(e.target.value),
          "aria-label": "Table",
          style: { ...BTN2, cursor: "pointer" },
          children: objects.map((o) => /* @__PURE__ */ jsxs2("option", { value: o.name, children: [
            o.name,
            o.type === "view" ? " (view)" : ""
          ] }, o.name))
        }
      ),
      result && /* @__PURE__ */ jsxs2("span", { style: { opacity: 0.7 }, children: [
        plural(total ?? rows.length, "row"),
        total !== null && total > 0 && ` \xB7 ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}`
      ] }),
      can?.filter && /* @__PURE__ */ jsx2(
        FilterInput,
        {
          value: filter,
          onChange: setFilter,
          placeholder: "filter",
          ...total !== null && unfilteredTotal !== void 0 ? { count: { shown: total, total: unfilteredTotal } } : {}
        }
      ),
      columnPicker && columns.length > 0 && /* @__PURE__ */ jsx2(ColumnPicker, { columns, vis: { visible, ...vis } }),
      loading && /* @__PURE__ */ jsx2("span", { style: { opacity: 0.5 }, children: "\u2026" }),
      status
    ] }),
    error && /* @__PURE__ */ jsx2("p", { style: { color: "crimson", fontSize: "0.9em" }, children: error.message }),
    /* @__PURE__ */ jsx2("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs2("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsx2("tr", { style: {
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas"
      }, children: shown.map((c) => {
        const styles = colStyles.get(c.name);
        const label = can?.sort ? /* @__PURE__ */ jsxs2(
          "span",
          {
            onClick: () => sort.toggle(c.name),
            style: { cursor: "pointer", userSelect: "none" },
            title: `Sort by ${c.name}`,
            children: [
              c.name,
              " ",
              /* @__PURE__ */ jsx2("span", { style: { opacity: sort.column === c.name ? 0.9 : 0.3 }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : /* @__PURE__ */ jsx2("span", { children: c.name });
        return /* @__PURE__ */ jsx2(
          "th",
          {
            style: styles?.header ?? TH_STYLE,
            ...styles?.headerClass ? { className: styles.headerClass } : {},
            children: renderHeader ? renderHeader({ column: c, path, defaultNode: label }) : label
          },
          c.name
        );
      }) }) }),
      /* @__PURE__ */ jsxs2("tbody", { children: [
        rows.map((row, i) => /* @__PURE__ */ jsx2("tr", { children: shown.map((c) => {
          const styles = colStyles.get(c.name);
          const ctx = {
            value: row[c.name],
            column: c,
            row,
            rowIndex: pageStart + i,
            path,
            defaultNode: defaultTableCell(row[c.name])
          };
          return /* @__PURE__ */ jsx2(
            "td",
            {
              style: styles?.cell ?? TD_STYLE,
              ...styles?.cellClass ? { className: styles.cellClass } : {},
              ...hoverHandlers(ctx),
              children: renderCell ? renderCell(ctx) : ctx.defaultNode
            },
            c.name
          );
        }) }, pageStart + i)),
        rows.length === 0 && !loading && !error && /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsx2("td", { colSpan: Math.max(1, shown.length), style: { ...TD_STYLE, opacity: 0.6 }, children: filter.trim() ? "no rows match" : "no rows" }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2("p", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginTop: "0.6em" }, children: [
      /* @__PURE__ */ jsx2("button", { type: "button", style: BTN2, disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039 prev" }),
      /* @__PURE__ */ jsx2("span", { style: { opacity: 0.7, fontSize: "0.85em" }, children: can?.randomAccess === false ? `rows ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}` : `page ${(page + 1).toLocaleString()}${lastPage !== null ? ` / ${(lastPage + 1).toLocaleString()}` : ""}` }),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          style: BTN2,
          disabled: lastPage !== null ? page >= lastPage : rows.length < pageSize,
          onClick: () => setPage(page + 1),
          children: "next \u203A"
        }
      )
    ] })
  ] });
}

// src/renderers/sqlite.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SqliteViewer({
  store,
  path,
  usePersistedState,
  wasm,
  runtime,
  vfs,
  showStats = false,
  countRows,
  ...browser
}) {
  const [db, setDb] = useState4(null);
  const [objects, setObjects] = useState4(null);
  const [error, setError] = useState4(null);
  useEffect3(() => {
    let live = true;
    let opened = null;
    setDb(null);
    setObjects(null);
    setError(null);
    (async () => {
      try {
        const reader = await rangeReaderFromStore(store, path);
        opened = await SqliteDb.open(reader, wasm, { ...vfs, ...runtime ? { runtime } : {} });
        const found = await opened.objects();
        if (!live) return;
        setDb(opened);
        setObjects(found);
      } catch (e) {
        if (live) setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      live = false;
      void opened?.close();
    };
  }, [store, path]);
  const catalog = useMemo4(
    () => db ? sqliteCatalog(db, countRows === void 0 ? {} : { countRows }) : null,
    [db, countRows]
  );
  if (error) {
    return /* @__PURE__ */ jsxs3("div", { style: { color: "crimson", fontSize: "0.9em" }, children: [
      /* @__PURE__ */ jsx3("strong", { children: "SQLite:" }),
      " ",
      error.message
    ] });
  }
  if (!catalog || !objects) return /* @__PURE__ */ jsx3("div", { style: { opacity: 0.6 }, children: "opening database\u2026" });
  return /* @__PURE__ */ jsx3(
    TableBrowser,
    {
      ...browser,
      catalog,
      objects,
      path,
      ...usePersistedState ? { usePersistedState } : {},
      ...showStats && db ? {
        status: /* @__PURE__ */ jsxs3("span", { style: { opacity: 0.5, fontSize: "0.9em" }, title: "ranged reads / cache hits", children: [
          db.stats.reads,
          " reads \xB7 ",
          db.stats.hits,
          " cached"
        ] })
      } : {}
    }
  );
}
var sqlite_default = SqliteViewer;
export {
  DEFAULT_PAGE_SIZE,
  SqliteViewer,
  sqlite_default as default
};
//# sourceMappingURL=sqlite.js.map