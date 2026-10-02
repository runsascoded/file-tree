"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/renderers/memoryTableSource.ts
var memoryTableSource_exports = {};
__export(memoryTableSource_exports, {
  inferColumns: () => inferColumns,
  inferKind: () => inferKind,
  memoryTableSource: () => memoryTableSource,
  singleTableCatalog: () => singleTableCatalog
});
module.exports = __toCommonJS(memoryTableSource_exports);

// src/renderers/tableSort.ts
var import_react2 = require("react");

// src/react/persistedState.ts
var import_react = require("react");

// src/renderers/tableSort.ts
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function compareValues(a, b) {
  const aNull = a === null || a === void 0 || a === "";
  const bNull = b === null || b === void 0 || b === "";
  if (aNull || bNull) return aNull && bNull ? 0 : aNull ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const an = typeof a === "bigint" ? Number(a) : Number(a);
  const bn = typeof b === "bigint" ? Number(b) : Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  if (Number.isFinite(an) && Number.isFinite(bn)) return 0;
  return String(a).localeCompare(String(b));
}

// src/renderers/tableControls.tsx
var import_react3 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function filterRows(rows, q, columns) {
  const needle = q.trim().toLowerCase();
  if (!rows || !needle) return rows;
  return rows.filter((r) => columns.some((c) => {
    const v = r[c];
    return v !== null && v !== void 0 && String(v).toLowerCase().includes(needle);
  }));
}

// src/renderers/memoryTableSource.ts
var CAPABILITIES = { sort: true, filter: true, total: true, randomAccess: true };
function inferKind(value) {
  switch (typeof value) {
    case "number":
    case "bigint":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      if (value instanceof Date) return "temporal";
      if (value instanceof Uint8Array) return "binary";
      return void 0;
    default:
      return "string";
  }
}
function inferColumns(rows) {
  const kinds = /* @__PURE__ */ new Map();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (kinds.get(k) !== void 0) continue;
      kinds.set(k, v === null || v === void 0 || v === "" ? void 0 : inferKind(v));
    }
  }
  return [...kinds].map(([name, kind]) => kind ? { name, kind } : { name });
}
function memoryTableSource(rows, opts = {}) {
  const columns = opts.columns ?? inferColumns(rows);
  const names = columns.map((c) => c.name);
  return {
    capabilities: CAPABILITIES,
    columns: async () => columns,
    async page(req) {
      let out = filterRows([...rows], req.filter ?? "", names) ?? [];
      if (req.sort) {
        const { column, dir } = req.sort;
        const col = columns.find((c) => c.name === column);
        const cmp = (col && opts.sortComparators?.(col)) ?? compareValues;
        const sign = dir === "desc" ? -1 : 1;
        out = out.sort((x, y) => sign * cmp(x[column], y[column]));
      }
      return { rows: out.slice(req.offset, req.offset + req.limit), columns, total: out.length, offset: req.offset };
    }
  };
}
function singleTableCatalog(name, source) {
  return {
    objects: async () => [{ name, type: "table" }],
    source: () => source
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  inferColumns,
  inferKind,
  memoryTableSource,
  singleTableCatalog
});
//# sourceMappingURL=memoryTableSource.cjs.map