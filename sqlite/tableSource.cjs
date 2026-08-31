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

// src/sqlite/tableSource.ts
var tableSource_exports = {};
__export(tableSource_exports, {
  sqliteCatalog: () => sqliteCatalog,
  sqliteTableSource: () => sqliteTableSource
});
module.exports = __toCommonJS(tableSource_exports);

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

// src/sqlite/db.ts
var SQLite = __toESM(require("wa-sqlite"), 1);
var import_wa_sqlite_async = __toESM(require("wa-sqlite/dist/wa-sqlite-async.mjs"), 1);

// src/sqlite/vfs.ts
var VFS = __toESM(require("wa-sqlite/src/VFS.js"), 1);
var DEFAULTS = {
  minBlockBytes: 8 * 1024,
  maxBlockBytes: 256 * 1024,
  maxCacheBytes: 64 * 1024 * 1024
};

// src/sqlite/db.ts
function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  sqliteCatalog,
  sqliteTableSource
});
//# sourceMappingURL=tableSource.cjs.map