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

// src/renderers/tableSort.ts
var tableSort_exports = {};
__export(tableSort_exports, {
  DEFAULT_FULL_LOAD_MAX_BYTES: () => DEFAULT_FULL_LOAD_MAX_BYTES,
  compareValues: () => compareValues,
  sortGlyph: () => sortGlyph,
  useSort: () => useSort,
  useSortedRows: () => useSortedRows
});
module.exports = __toCommonJS(tableSort_exports);
var import_react2 = require("react");

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

// src/renderers/tableSort.ts
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = (0, import_react2.useCallback)((name) => {
    setRaw(raw === name ? `-${name}` : raw === `-${name}` ? "" : name);
  }, [raw, setRaw]);
  return { column, dir, toggle };
}
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
function useSortedRows(rows, sort, comparators, columns) {
  return (0, import_react2.useMemo)(() => {
    if (!rows || !sort.column) return rows;
    const col = columns?.find((c) => c.name === sort.column);
    const cmp = (col && comparators?.(col)) ?? compareValues;
    const key = sort.column;
    const sign = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((x, y) => sign * cmp(x[key], y[key]));
  }, [rows, sort.column, sort.dir, comparators, columns]);
}
function sortGlyph(column, sort) {
  if (sort.column !== column) return "\u2195";
  return sort.dir === "asc" ? "\u25B2" : "\u25BC";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_FULL_LOAD_MAX_BYTES,
  compareValues,
  sortGlyph,
  useSort,
  useSortedRows
});
//# sourceMappingURL=tableSort.cjs.map