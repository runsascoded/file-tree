// src/renderers/tableSort.ts
import { useCallback, useMemo } from "react";

// src/react/persistedState.ts
import { useState } from "react";

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
import { useCallback as useCallback2, useEffect, useMemo as useMemo2, useRef, useState as useState2 } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
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
export {
  inferColumns,
  inferKind,
  memoryTableSource,
  singleTableCatalog
};
//# sourceMappingURL=memoryTableSource.js.map