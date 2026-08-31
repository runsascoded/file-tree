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
import * as SQLite from "wa-sqlite";
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";

// src/sqlite/vfs.ts
import * as VFS from "wa-sqlite/src/VFS.js";
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
export {
  sqliteCatalog,
  sqliteTableSource
};
//# sourceMappingURL=tableSource.js.map