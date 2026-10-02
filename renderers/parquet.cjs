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

// src/renderers/parquet.tsx
var parquet_exports = {};
__export(parquet_exports, {
  NUMERIC_TYPES: () => NUMERIC_TYPES,
  ParquetViewer: () => ParquetViewer,
  RG_CACHE_SIZE: () => RG_CACHE_SIZE,
  chainCellRenderers: () => chainCellRenderers,
  coarseKind: () => coarseKind,
  default: () => parquet_default,
  defaultCompressors: () => defaultCompressors,
  dittoMark: () => dittoMark,
  dittoRenderer: () => dittoRenderer,
  formatTemporal: () => formatTemporal,
  inferColumnFormats: () => inferColumnFormats,
  inferTemporalFormat: () => inferTemporalFormat,
  makeParquetViewer: () => makeParquetViewer,
  pathGroups: () => pathGroups,
  readParquetRows: () => readParquetRows,
  repeatsAbove: () => repeatsAbove,
  runGroups: () => runGroups,
  runRenderer: () => runRenderer,
  toMillis: () => toMillis,
  useAllRows: () => useAllRows,
  useParquetMeta: () => useParquetMeta,
  useRowGroup: () => useRowGroup,
  withDefaultCompressors: () => withDefaultCompressors
});
module.exports = __toCommonJS(parquet_exports);
var import_react7 = require("react");

// src/renderers/parquetData.ts
var import_react = require("react");
var import_hyparquet = require("hyparquet");

// src/renderers/parquetCompressors.ts
var import_fzstd = require("fzstd");
var defaultCompressors = {
  ZSTD: (input, outputLength) => (0, import_fzstd.decompress)(input, new Uint8Array(outputLength))
};
function withDefaultCompressors(compressors) {
  return compressors ? { ...defaultCompressors, ...compressors } : defaultCompressors;
}

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

// src/renderers/parquetData.ts
var NUMERIC_TYPES = /* @__PURE__ */ new Set(["INT32", "INT64", "INT96", "FLOAT", "DOUBLE"]);
var RG_CACHE_SIZE = 4;
function coarseKind(physicalType) {
  if (NUMERIC_TYPES.has(physicalType)) return "number";
  if (physicalType === "BOOLEAN") return "boolean";
  if (physicalType === "BYTE_ARRAY" || physicalType === "FIXED_LEN_BYTE_ARRAY") return "string";
  return void 0;
}
function useParquetMeta(store, path) {
  const [meta, setMeta] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    setMeta(null);
    setError(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const md = await (0, import_hyparquet.parquetMetadataAsync)(file);
        if (cancelled) return;
        const schema = (0, import_hyparquet.parquetSchema)(md).children.map((c) => {
          const el = c.element;
          const lt = el.logical_type;
          const physicalType = el.type ? String(el.type) : void 0;
          return {
            name: el.name,
            ...physicalType ? { physicalType, kind: coarseKind(physicalType) } : {},
            ...lt ? { logicalType: lt.type } : {},
            ...lt && "unit" in lt ? { timeUnit: lt.unit } : {},
            ...el.converted_type ? { convertedType: String(el.converted_type) } : {}
          };
        });
        const rowGroups = [];
        let cum = 0;
        md.row_groups.forEach((rg, i) => {
          const numRows = Number(rg.num_rows);
          const stats = /* @__PURE__ */ new Map();
          for (const chunk of rg.columns) {
            const cm = chunk.meta_data;
            const s = cm?.statistics;
            if (!cm || !s) continue;
            const min = s.min_value ?? s.min;
            const max = s.max_value ?? s.max;
            const nullCount = s.null_count != null ? Number(s.null_count) : void 0;
            if (min === void 0 && max === void 0 && nullCount === void 0) continue;
            stats.set(cm.path_in_schema.join("."), {
              ...min !== void 0 ? { min } : {},
              ...max !== void 0 ? { max } : {},
              ...nullCount !== void 0 ? { nullCount } : {}
            });
          }
          rowGroups.push({
            index: i,
            numRows,
            rowStart: cum,
            rowEnd: cum + numRows,
            uncompressedBytes: Number(rg.total_byte_size),
            compressedBytes: rg.total_compressed_size != null ? Number(rg.total_compressed_size) : null,
            stats,
            sortingColumns: (rg.sorting_columns ?? []).map((sc) => ({
              columnIdx: Number(sc.column_idx),
              descending: !!sc.descending,
              nullsFirst: !!sc.nulls_first
            }))
          });
          cum += numRows;
        });
        setMeta({ schema, totalRows: Number(md.num_rows), byteSize: file.byteLength, rowGroups });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  return { meta, error };
}
async function readParquetRows(store, path, { rowStart, rowEnd, compressors } = {}) {
  const file = await asyncBufferFromStore(store, path);
  const out = [];
  await (0, import_hyparquet.parquetRead)({
    file,
    ...rowStart != null ? { rowStart } : {},
    ...rowEnd != null ? { rowEnd } : {},
    ...compressors ? { compressors } : {},
    rowFormat: "object",
    onComplete: (data) => {
      if (Array.isArray(data)) for (const r of data) out.push(r);
    }
  });
  return out;
}
function useRowGroup(store, path, meta, index, cacheSize = RG_CACHE_SIZE, compressors) {
  const [rows, setRows] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const cache = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  (0, import_react.useEffect)(() => {
    cache.current = /* @__PURE__ */ new Map();
    setRows(null);
    setError(null);
  }, [store, path, compressors]);
  (0, import_react.useEffect)(() => {
    if (!meta || meta.rowGroups.length === 0) return;
    const rgIdx = Math.min(index, meta.rowGroups.length - 1);
    const rg = meta.rowGroups[rgIdx];
    const cached = cache.current.get(rgIdx);
    if (cached) {
      cache.current.delete(rgIdx);
      cache.current.set(rgIdx, cached);
      setRows(cached);
      return;
    }
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const out = await readParquetRows(store, path, {
          rowStart: rg.rowStart,
          rowEnd: rg.rowEnd,
          compressors: withDefaultCompressors(compressors)
        });
        if (cancelled) return;
        cache.current.set(rgIdx, out);
        while (cache.current.size > cacheSize) {
          const oldest = cache.current.keys().next().value;
          if (oldest === void 0) break;
          cache.current.delete(oldest);
        }
        setRows(out);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path, index, meta, cacheSize, compressors]);
  return { rows, error };
}
function useAllRows(store, path, meta, enabled, compressors) {
  const [rows, setRows] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (!enabled || !meta) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const out = await readParquetRows(store, path, { compressors: withDefaultCompressors(compressors) });
        if (!cancelled) setRows(out);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path, meta, enabled, compressors]);
  return { rows, error };
}
var PREDICATE_RE = /^\s*([^<>=\s]+)\s*(>=|<=|=|<|>)\s*(.+?)\s*$/;
function parsePredicate(text) {
  const m = PREDICATE_RE.exec(text);
  if (!m) return null;
  return { column: m[1], op: m[2], value: m[3] };
}
function statValue(v) {
  if (v instanceof Uint8Array) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(v);
    } catch {
      return void 0;
    }
  }
  return v;
}
function cmp(a, b) {
  const an = Number(a), bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}
function rowGroupMatches(rg, p) {
  const st = rg.stats.get(p.column);
  if (!st) return true;
  const min = statValue(st.min);
  const max = statValue(st.max);
  switch (p.op) {
    case "=":
      return (min === void 0 || cmp(min, p.value) <= 0) && (max === void 0 || cmp(max, p.value) >= 0);
    case ">":
      return max === void 0 || cmp(max, p.value) > 0;
    case ">=":
      return max === void 0 || cmp(max, p.value) >= 0;
    case "<":
      return min === void 0 || cmp(min, p.value) < 0;
    case "<=":
      return min === void 0 || cmp(min, p.value) <= 0;
  }
}
function pruneRowGroups(rowGroups, p) {
  return rowGroups.filter((rg) => rowGroupMatches(rg, p));
}
function isSortedBy(meta, column) {
  const idx = meta.schema.findIndex((c) => c.name === column);
  if (idx < 0 || meta.rowGroups.length === 0) return false;
  return meta.rowGroups.every((rg) => rg.sortingColumns.some((sc) => sc.columnIdx === idx));
}
function constantColumns(meta) {
  const out = /* @__PURE__ */ new Map();
  if (meta.rowGroups.length === 0) return out;
  for (const col of meta.schema) {
    let value;
    let ok = true;
    for (const rg of meta.rowGroups) {
      const st = rg.stats.get(col.name);
      if (!st || st.min === void 0 || st.max === void 0 || (st.nullCount ?? 0) > 0) {
        ok = false;
        break;
      }
      const lo = statValue(st.min);
      if (lo === void 0 || !Object.is(lo, statValue(st.max))) {
        ok = false;
        break;
      }
      if (value === void 0) value = lo;
      else if (!Object.is(value, lo)) {
        ok = false;
        break;
      }
    }
    if (ok && value !== void 0) out.set(col.name, value);
  }
  return out;
}

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/react/persistedState.ts
var import_react2 = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react2.useState)(defaultValue);

// src/renderers/temporal.ts
var WINDOWS = [
  ["SECONDS", 63e7, 41e8],
  ["MILLIS", 63e10, 41e11],
  ["MICROS", 63e13, 41e14],
  ["NANOS", 63e16, 41e17]
];
var NUMERIC_PHYSICAL = /* @__PURE__ */ new Set(["INT64", "DOUBLE"]);
var TEMPORAL_NAME = /^(dt|ts|time|timestamp|date)$|_(at|time|ts|date)$/i;
var SAMPLE_LIMIT = 1e4;
var MS_PER_DAY = 864e5;
function toMillis(v, unit) {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "bigint") {
    switch (unit) {
      case "DAYS":
        return Number(v) * MS_PER_DAY;
      case "SECONDS":
        return Number(v) * 1e3;
      case "MILLIS":
        return Number(v);
      case "MICROS":
        return Number(v / 1000n);
      case "NANOS":
        return Number(v / 1000000n);
    }
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  switch (unit) {
    case "DAYS":
      return v * MS_PER_DAY;
    case "SECONDS":
      return v * 1e3;
    case "MILLIS":
      return v;
    case "MICROS":
      return v / 1e3;
    case "NANOS":
      return v / 1e6;
  }
}
function unitFromTypes(col) {
  if (col.logicalType === "TIMESTAMP" && col.timeUnit) return { unit: col.timeUnit, source: "logical" };
  if (col.logicalType === "DATE") return { unit: "DAYS", source: "logical" };
  switch (col.convertedType) {
    case "TIMESTAMP_MILLIS":
      return { unit: "MILLIS", source: "converted" };
    case "TIMESTAMP_MICROS":
      return { unit: "MICROS", source: "converted" };
    case "DATE":
      return { unit: "DAYS", source: "converted" };
  }
  return null;
}
function unitFromValues(col, values) {
  if (!TEMPORAL_NAME.test(col.name)) return null;
  if (col.physicalType !== void 0 && !NUMERIC_PHYSICAL.has(col.physicalType)) return null;
  let unit = null;
  let seen = 0;
  for (const v of values) {
    if (seen >= SAMPLE_LIMIT) break;
    if (v === null || v === void 0) continue;
    seen++;
    let n;
    if (typeof v === "bigint") n = Number(v);
    else if (typeof v === "number" && Number.isFinite(v)) n = v;
    else return null;
    const hit = WINDOWS.find(([, lo, hi]) => n >= lo && n < hi);
    if (!hit) return null;
    if (unit === null) unit = hit[0];
    else if (unit !== hit[0]) return null;
  }
  return unit === null ? null : { unit, source: "inferred" };
}
function precisionOf(values, unit) {
  let subSecond = false;
  let withinMinute = false;
  let seen = 0;
  for (const v of values) {
    if (seen >= SAMPLE_LIMIT) break;
    const ms = toMillis(v, unit);
    if (ms === null) continue;
    seen++;
    if (!Number.isInteger(ms) || ms % 1e3 !== 0) {
      subSecond = true;
      break;
    }
    if (ms % 6e4 !== 0) withinMinute = true;
  }
  return subSecond ? "ms" : withinMinute ? "sec" : "min";
}
function inferTemporalFormat(col, values, { infer = true } = {}) {
  let us = unitFromTypes(col);
  if (!us) {
    for (const v of values) {
      if (v === null || v === void 0) continue;
      if (v instanceof Date) us = { unit: "MILLIS", source: "logical" };
      break;
    }
  }
  if (!us && infer) us = unitFromValues(col, values);
  if (!us) return null;
  if (us.unit === "DAYS") return { ...us, precision: "day" };
  return { ...us, precision: precisionOf(values, us.unit) };
}
function formatTemporal(v, fmt) {
  const ms = toMillis(v, fmt.unit);
  if (ms === null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  const day = iso.slice(0, 10);
  switch (fmt.precision) {
    case "day":
      return day;
    case "min":
      return `${day} ${iso.slice(11, 16)}Z`;
    case "sec":
      return `${day} ${iso.slice(11, 19)}Z`;
    case "ms":
      return `${day} ${iso.slice(11, 23)}Z`;
  }
}
function inferColumnFormats(cols, rows, opts = {}) {
  const out = /* @__PURE__ */ new Map();
  if (!rows || rows.length === 0) return out;
  for (const col of cols) {
    const values = {
      *[Symbol.iterator]() {
        for (const r of rows) yield r[col.name];
      }
    };
    const fmt = inferTemporalFormat(col, values, opts);
    if (fmt) out.set(col.name, fmt);
  }
  return out;
}

// src/renderers/tableControls.tsx
var import_react3 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
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
  const hidden = (0, import_react3.useMemo)(
    () => new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)),
    [raw]
  );
  const toggle = (0, import_react3.useCallback)((name) => {
    const next = new Set(hidden);
    next.delete(name) || next.add(name);
    setRaw([...next].join(","));
  }, [hidden, setRaw]);
  const showAll = (0, import_react3.useCallback)(() => setRaw(""), [setRaw]);
  const visible = (0, import_react3.useMemo)(
    () => columns.map((c) => c.name).filter((n) => !hidden.has(n)),
    [columns, hidden]
  );
  return { visible, toggle, showAll, hidden };
}
function ColumnPicker({ columns, vis }) {
  const [open, setOpen] = (0, import_react3.useState)(false);
  const { visible, toggle, showAll, hidden } = vis;
  return (
    // Note the *host* has to be positioned with a z-index for the panel
    // to paint over the table — see the summary line in `parquet.tsx` /
    // `csv.tsx`. A z-index here can't do it alone: this span is a flex
    // item of that line, so it paints in the line's place in the root
    // stacking order, which is before the table.
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { position: "relative", display: "inline-block" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
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
      open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
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
            columns.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "block", cursor: "pointer", fontSize: "0.9em" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
            hidden.size > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: showAll, style: { ...BTN, marginTop: "0.4em" }, children: "show all" })
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
function filterRows(rows, q, columns) {
  const needle = q.trim().toLowerCase();
  if (!rows || !needle) return rows;
  return rows.filter((r) => columns.some((c) => {
    const v = r[c];
    return v !== null && v !== void 0 && String(v).toLowerCase().includes(needle);
  }));
}
function FilterInput({ value, onChange, count, placeholder = "filter" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.4em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
    value.trim() !== "" && count && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.7 }, children: [
      count.shown.toLocaleString(),
      " / ",
      count.total.toLocaleString()
    ] })
  ] });
}
function useStableCallback(fn) {
  const ref = (0, import_react3.useRef)(fn);
  ref.current = fn;
  return (0, import_react3.useCallback)((...args) => ref.current?.(...args), []);
}
function usePageNotify(onPage, ctxRef, deps) {
  const notify = useStableCallback(onPage);
  (0, import_react3.useEffect)(() => {
    notify(ctxRef.current);
  }, deps);
}

// src/renderers/columnResize.tsx
var import_react4 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var MIN_WIDTH = 40;
var FIT_SLACK = 2;
var DRAG_THRESHOLD = 3;
var NO_STYLE = {};
function parseWidths(raw) {
  const m = /* @__PURE__ */ new Map();
  for (const part of raw.split(",")) {
    if (!part) continue;
    const i = part.lastIndexOf(":");
    if (i <= 0) continue;
    const name = part.slice(0, i);
    const px = Number(part.slice(i + 1));
    if (name && Number.isFinite(px) && px > 0) m.set(name, px);
  }
  return m;
}
function serializeWidths(m) {
  return [...m].map(([n, w]) => `${n}:${Math.round(w)}`).join(",");
}
function columnFingerprint(columns) {
  const s = columns.map((c) => c.name).sort().join("");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 33) + s.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}
function scopeKey(scope, columns, path) {
  if (typeof scope === "function") return `f:${scope(columns, path)}`;
  if (scope === "schema") return `s:${columnFingerprint(columns)}`;
  if (scope === "column") return "c";
  return `p:${path}`;
}
function readLS(key) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key, value) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
  }
}
function useLocalStorageString(key, initial) {
  const [value, setValue] = (0, import_react4.useState)(() => readLS(key) ?? initial);
  (0, import_react4.useEffect)(() => {
    setValue(readLS(key) ?? initial);
  }, [key, initial]);
  (0, import_react4.useEffect)(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e) => {
      if (e.key === key) setValue(e.newValue ?? initial);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initial]);
  const set = (0, import_react4.useCallback)((v) => {
    writeLS(key, v);
    setValue(v);
  }, [key]);
  return [value, set];
}
function useColumnWidths({ on, scope, columns, path, usePersistedState }) {
  const use = usePersistedState ?? defaultUseState;
  const [urlRaw, setUrlRaw] = use("cw", "");
  const lsKey = (0, import_react4.useMemo)(() => `ft-colw:${scopeKey(scope, columns, path)}`, [scope, columns, path]);
  const [lsRaw, setLsRaw] = useLocalStorageString(lsKey, "");
  const onPath = scope === "path";
  const raw = onPath ? urlRaw : lsRaw;
  const setRaw = onPath ? setUrlRaw : setLsRaw;
  const persisted = (0, import_react4.useMemo)(() => parseWidths(raw), [raw]);
  const persistedRef = (0, import_react4.useRef)(persisted);
  persistedRef.current = persisted;
  const [drag, setDrag] = (0, import_react4.useState)(null);
  const commit = (0, import_react4.useCallback)((col, w) => {
    const m = new Map(persistedRef.current);
    m.set(col, Math.max(MIN_WIDTH, w));
    setRaw(serializeWidths(m));
  }, [setRaw]);
  const startResize = (0, import_react4.useCallback)((col, e) => {
    if (!on) return;
    const th = e.target.closest("th");
    if (!th) return;
    const startW = th.getBoundingClientRect().width;
    const startX = e.clientX;
    const widthAt = (clientX) => Math.max(MIN_WIDTH, startW + (clientX - startX));
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    let dragging = false;
    const move = (ev) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return;
        dragging = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }
      setDrag({ col, w: widthAt(ev.clientX) });
    };
    const up = (ev) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (dragging) {
        commit(col, widthAt(ev.clientX));
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
      }
      setDrag(null);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }, [on, commit]);
  const autoFit = (0, import_react4.useCallback)((col, e) => {
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    const th = e.target.closest("th");
    const table = th?.closest("table");
    if (!th || !table) return;
    const idx = th.cellIndex;
    let max = th.scrollWidth;
    for (const tr of table.querySelectorAll("tbody tr")) {
      const td = tr.children[idx];
      if (td && td.cellIndex === idx) max = Math.max(max, td.scrollWidth);
    }
    commit(col, Math.ceil(max) + FIT_SLACK);
  }, [on, commit]);
  const styleFor = (0, import_react4.useCallback)((col) => {
    if (!on) return NO_STYLE;
    const w = drag && drag.col === col ? drag.w : persisted.get(col);
    return w == null ? NO_STYLE : { width: w, minWidth: w, maxWidth: w };
  }, [on, drag, persisted]);
  return (0, import_react4.useMemo)(() => ({ styleFor, startResize, autoFit }), [styleFor, startResize, autoFit]);
}
function ColumnResizeHandle({ col, widths }) {
  const [hot, setHot] = (0, import_react4.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "span",
    {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": `Resize ${col} column`,
      title: "Drag to resize \xB7 double-click to fit",
      onPointerEnter: () => setHot(true),
      onPointerLeave: () => setHot(false),
      onPointerDown: (e) => widths.startResize(col, e),
      onDoubleClick: (e) => widths.autoFit(col, e),
      onClick: (e) => e.stopPropagation(),
      style: {
        position: "absolute",
        top: 0,
        right: 0,
        height: "100%",
        width: 9,
        cursor: "col-resize",
        touchAction: "none",
        userSelect: "none",
        borderRight: `2px solid ${hot ? "rgba(127,127,127,0.7)" : "transparent"}`
      }
    }
  );
}

// src/renderers/tableSort.ts
var import_react5 = require("react");
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = (0, import_react5.useCallback)((name) => {
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
  return (0, import_react5.useMemo)(() => {
    if (!rows || !sort.column) return rows;
    const col = columns?.find((c) => c.name === sort.column);
    const cmp2 = (col && comparators?.(col)) ?? compareValues;
    const key = sort.column;
    const sign = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((x, y) => sign * cmp2(x[key], y[key]));
  }, [rows, sort.column, sort.dir, comparators, columns]);
}
function sortGlyph(column, sort) {
  if (sort.column !== column) return "\u2195";
  return sort.dir === "asc" ? "\u25B2" : "\u25BC";
}

// src/renderers/table.ts
function tableCellCtx(ctx) {
  return Object.defineProperty(ctx, "prevRow", { get: () => ctx.at(-1), enumerable: true });
}
function chainCellRenderers(...renderers) {
  const rs = renderers.filter((r) => r !== void 0);
  if (rs.length <= 1) return rs[0];
  return (ctx) => rs.reduce((node, r) => {
    const next = Object.defineProperties({}, Object.getOwnPropertyDescriptors(ctx));
    next.defaultNode = node;
    return r(next);
  }, ctx.defaultNode);
}
function repeatsAbove(ctx) {
  const above = ctx.at(-1);
  return above !== void 0 && Object.is(ctx.value, above[ctx.column.name]);
}
var MIDDLE_TAIL = 12;
var ELLIPSIS_END = () => "end";
function normalizeEllipsis(e) {
  if (e === void 0) return ELLIPSIS_END;
  if (typeof e === "string") return () => e;
  if (typeof e === "function") return (c) => e(c) ?? "end";
  return (c) => e[c.name] ?? "end";
}
var ELIDE_DEFAULTS = {
  maxWidth: "30em",
  tooltip: "native",
  content: cellTitle,
  onlyWhenClipped: true,
  ellipsis: ELLIPSIS_END
};
function resolveElide(elide) {
  if (elide === false) return { ...ELIDE_DEFAULTS, maxWidth: false, tooltip: false };
  if (elide === true || elide === void 0) return ELIDE_DEFAULTS;
  const { ellipsis, ...rest } = elide;
  return { ...ELIDE_DEFAULTS, ...rest, ellipsis: normalizeEllipsis(ellipsis) };
}
function elideCellStyle(el) {
  return { maxWidth: el.maxWidth === false ? "none" : el.maxWidth };
}
function cellClipped(el) {
  return el.scrollWidth > el.clientWidth + 1;
}
function applyElide(el, args) {
  const { value, node, hasCustomRender, column, row, path, raw, ellipsis } = args;
  if (el.tooltip === false) return { node };
  const text = el.content(value);
  if (typeof el.tooltip === "function") {
    return { node: el.tooltip({ value, text, raw, node, column, row, path }) };
  }
  if (hasCustomRender) return { node };
  const shown = raw ?? text;
  if (!shown) return { node };
  if (raw != null || ellipsis === "middle") return { title: shown, node };
  if (!el.onlyWhenClipped) return { title: shown, node };
  return { onMouseEnter: (e) => {
    e.currentTarget.title = cellClipped(e.currentTarget) ? shown : "";
  }, node };
}
var TD_STYLE = {
  padding: "0.2em 0.6em",
  whiteSpace: "nowrap",
  maxWidth: "30em",
  overflow: "hidden",
  textOverflow: "ellipsis"
};
function cellTitle(value) {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "bigint":
    case "boolean":
      return String(value);
    case "object":
      return value instanceof Date ? value.toISOString() : void 0;
    default:
      return void 0;
  }
}
var TH_STYLE = {
  padding: "0.3em 0.6em",
  textAlign: "left",
  fontWeight: 650,
  borderBottom: "2px solid rgba(127,127,127,0.55)",
  backgroundColor: "rgba(127,127,127,0.06)"
};
var NUMERIC_ALIGN = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
function resolveColStyles(columns, path, opts, isNumeric, el = ELIDE_DEFAULTS) {
  const out = /* @__PURE__ */ new Map();
  const es = elideCellStyle(el);
  for (const c of columns) {
    const align = isNumeric(c) ? NUMERIC_ALIGN : {};
    const cp = opts.cellProps?.(c, path) || {};
    const hp = opts.headerProps?.(c, path) || {};
    const ellipsis = el.ellipsis(c);
    const startDir = ellipsis === "start" ? { direction: "rtl", textAlign: "left" } : {};
    out.set(c.name, {
      // `es` overrides `TD_STYLE`'s default cap; `cp.style` still wins last,
      // so a consumer's per-column width beats the elide default.
      cell: { ...TD_STYLE, ...align, ...es, ...startDir, ...cp.style },
      header: { ...TH_STYLE, ...align, ...hp.style },
      ellipsis,
      ...cp.className ? { cellClass: cp.className } : {},
      ...hp.className ? { headerClass: hp.className } : {}
    });
  }
  return out;
}

// src/renderers/tableBody.tsx
var import_react6 = require("react");

// src/renderers/elideNode.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function splitMiddle(text, tail = MIDDLE_TAIL) {
  if (text === void 0 || text.length <= tail + 1) return null;
  return [text.slice(0, text.length - tail), text.slice(text.length - tail)];
}
function ellipsisWrap(mode, node, text, tail = MIDDLE_TAIL) {
  if (mode === "start") return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("bdi", { children: node });
  if (mode === "middle") {
    const split = splitMiddle(text, tail);
    if (split) {
      const [head, end] = split;
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", minWidth: 0, maxWidth: "100%" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }, children: head }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { whiteSpace: "nowrap", flexShrink: 0 }, children: end })
      ] });
    }
  }
  return node;
}

// src/renderers/tableRuns.ts
function normalizeDitto(ditto) {
  const out = /* @__PURE__ */ new Map();
  if (!ditto) return out;
  if (isList(ditto)) {
    for (const c of ditto) out.set(c, { mode: "mark", min: 2, float: true, every: 5 });
    return out;
  }
  for (const [c, s] of Object.entries(ditto)) {
    const spec = typeof s === "string" ? { mode: s } : s;
    out.set(c, {
      mode: spec.mode ?? "sticky",
      min: spec.min ?? 2,
      float: spec.float ?? true,
      every: spec.every ?? 5,
      ...spec.key ? { key: spec.key } : {},
      ...spec.render ? { render: spec.render } : {}
    });
  }
  return out;
}
function normalizePaths(paths) {
  if (!paths) return /* @__PURE__ */ new Map();
  if (isList(paths)) return new Map(paths.map((c) => [c, "dim"]));
  return new Map(Object.entries(paths));
}
function isList(o) {
  return Array.isArray(o);
}
var isEmpty = (v) => v === null || v === void 0 || v === "";
function runKey(spec, value, row) {
  if (isEmpty(value)) return void 0;
  const k = spec.key ? spec.key(value, row) : value;
  return k === null ? void 0 : k;
}
function computeRuns(rows, column, spec) {
  const keys = rows.map((r) => runKey(spec, r[column], r));
  const out = new Array(rows.length).fill(void 0);
  const min = Math.max(2, spec.min ?? 2);
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    if (keys[i] !== void 0) while (j < rows.length && Object.is(keys[j], keys[i])) j++;
    const length = j - i;
    if (keys[i] !== void 0 && length >= min) {
      for (let k = i; k < j; k++) out[k] = { start: k === i, end: k === j - 1, length, index: k - i };
    }
    i = j;
  }
  return out;
}
var SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
function schemeLength(p) {
  return SCHEME.exec(p)?.[0].length ?? 0;
}
function sharedPathPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  let l = 0;
  while (l < n && a[l] === b[l]) l++;
  if (l === 0) return 0;
  const cut = a.lastIndexOf("/", l - 1);
  return cut >= schemeLength(a) ? cut + 1 : 0;
}
function isSortedBy2(rows, column) {
  let asc = true;
  let desc = true;
  for (let i = 1; i < rows.length && (asc || desc); i++) {
    const c = compareValues(rows[i - 1][column], rows[i][column]);
    if (c > 0) asc = false;
    if (c < 0) desc = false;
  }
  return asc || desc;
}
function nextSegment(value, base) {
  const rem = value.slice(base.length);
  const from = base === "" ? schemeLength(rem) : 0;
  const cut = rem.indexOf("/", from);
  return cut === -1 || cut === rem.length - 1 ? null : rem.slice(0, cut + 1);
}
function pathGroups(column, opts = {}) {
  const min = Math.max(2, opts.min ?? 2);
  return (rows) => {
    if (!isSortedBy2(rows, column)) return [];
    const vals = rows.map((r) => typeof r[column] === "string" ? r[column] : "");
    const build = (lo, hi, base) => {
      const out = [];
      let i = lo;
      while (i < hi) {
        const seg = vals[i].startsWith(base) ? nextSegment(vals[i], base) : null;
        if (seg === null) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < hi && vals[j].startsWith(base + seg) && nextSegment(vals[j], base) === seg) j++;
        if (j - i >= min) {
          let prefix = base + seg;
          for (; ; ) {
            const next = nextSegment(vals[i], prefix);
            if (next === null) break;
            let all = true;
            for (let k = i + 1; k < j && all; k++) all = nextSegment(vals[k], prefix) === next;
            if (!all) break;
            prefix += next;
          }
          out.push({
            key: `${column}:${prefix}`,
            start: i,
            end: j,
            column,
            label: prefix.slice(base.length),
            title: prefix,
            prefix,
            children: build(i, j, prefix)
          });
        }
        i = j;
      }
      return out;
    };
    return build(0, rows.length, "");
  };
}
function runGroups(column, opts = {}) {
  return (rows) => {
    const runs = computeRuns(rows, column, opts);
    const seen = /* @__PURE__ */ new Map();
    const out = [];
    runs.forEach((r, i) => {
      if (!r?.start) return;
      const k = String(runKey(opts, rows[i][column], rows[i]));
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      out.push({ key: `${column}=${k}#${n}`, start: i, end: i + r.length, column, label: k, title: k });
    });
    return out;
  };
}
function groupHash(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 36 ** 4).toString(36).padStart(4, "0");
}
function parseFolds(raw) {
  const out = /* @__PURE__ */ new Set();
  for (let i = 0; i + 4 <= raw.length; i += 4) out.add(raw.slice(i, i + 4));
  return out;
}
var TREE_FALLBACK_NOTE = "Paths group into a tree only when sorted by this column; showing shared prefixes dimmed.";
function pathModes(rows, columns, paths) {
  const shown = new Set(columns.map((c) => c.name));
  const modes = /* @__PURE__ */ new Map();
  const notes = /* @__PURE__ */ new Map();
  let tree;
  for (const [c, mode] of normalizePaths(paths)) {
    if (!shown.has(c)) continue;
    if (mode === "tree" && tree === void 0 && isSortedBy2(rows, c)) {
      tree = c;
      modes.set(c, "tree");
    } else {
      modes.set(c, "dim");
      if (mode === "tree") notes.set(c, TREE_FALLBACK_NOTE);
    }
  }
  return { paths: modes, ...tree !== void 0 ? { tree } : {}, notes };
}
function tableLayout(rows, columns, opts) {
  const shown = new Set(columns.map((c) => c.name));
  const specs = new Map([...normalizeDitto(opts.ditto)].filter(([c]) => shown.has(c)));
  const pm = pathModes(rows, columns, opts.paths);
  const groupFn = opts.groups ?? (pm.tree !== void 0 ? pathGroups(pm.tree) : void 0);
  const groups = groupFn ? groupFn(rows) : [];
  const folded = opts.folded ?? /* @__PURE__ */ new Set();
  const items = [];
  const walk = (gs, lo, hi, depth, parent) => {
    let i = lo;
    for (const g of gs) {
      for (; i < g.start; i++) items.push({ kind: "row", i, depth, ...parent ? { group: parent } : {} });
      const collapsed = folded.has(groupHash(g.key));
      items.push({ kind: "group", group: g, depth, collapsed, size: g.end - g.start });
      if (!collapsed) walk(g.children ?? [], g.start, g.end, depth + 1, g);
      i = g.end;
    }
    for (; i < hi; i++) items.push({ kind: "row", i, depth, ...parent ? { group: parent } : {} });
  };
  walk(groups, 0, rows.length, 0);
  const visible = items.flatMap((it) => it.kind === "row" ? [it.i] : []);
  const visRows = visible.map((i) => rows[i]);
  const runs = new Map([...specs].map(([c, s]) => {
    const vr = computeRuns(visRows, c, s);
    const out = new Array(rows.length).fill(void 0);
    visible.forEach((i, k) => {
      out[i] = vr[k];
    });
    return [c, out];
  }));
  return { items, runs, specs, ...pm };
}

// src/renderers/ditto.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function dittoMark(value) {
  const title = cellTitle(value);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-label": "ditto", ...title != null ? { title } : {}, style: { opacity: 0.3, display: "block", textAlign: "center" }, children: "\u3003" });
}
var RULE = "1px solid currentColor";
function runLine(value, end, head = "tick") {
  const title = cellTitle(value);
  const rule = !end ? { top: "-0.2em", bottom: "-0.2em", borderLeft: RULE } : head === "tick" ? { top: "-0.2em", height: "calc(0.2em + 0.5lh)", width: "0.6em", borderLeft: RULE, borderBottom: RULE } : { top: "-0.2em", height: "calc(0.2em + 0.4lh)", borderLeft: RULE };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "span",
    {
      "aria-label": end ? "run end" : "run",
      ...title != null ? { title } : {},
      style: { display: "block", position: "relative" },
      children: [
        "\xA0",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { position: "absolute", left: "0.3em", opacity: 0.35, ...rule } }),
        end && head === "arrow" && // A CSS triangle centered on the rule, picking up where it ends.
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: {
          position: "absolute",
          left: "0.5px",
          top: "0.4lh",
          opacity: 0.5,
          borderLeft: "0.3em solid transparent",
          borderRight: "0.3em solid transparent",
          borderTop: "0.45em solid currentColor"
        } })
      ]
    }
  );
}
function runOf(ctx, spec) {
  if (ctx.run) return ctx.run;
  const k = runKey(spec, ctx.value, ctx.row);
  if (k === void 0) return void 0;
  const same = (r) => r !== void 0 && Object.is(runKey(spec, r[ctx.column.name], r), k);
  const above = same(ctx.at(-1));
  const below = same(ctx.at(1));
  return above || below ? { start: !above, end: !below } : void 0;
}
var DRAWN = /* @__PURE__ */ new Set(["mark", "line", "arrow"]);
function dittoRenderer(ditto) {
  const specs = normalizeDitto(ditto);
  return (ctx) => {
    const spec = specs.get(ctx.column.name);
    if (!spec || !DRAWN.has(spec.mode)) return ctx.defaultNode;
    const run = runOf(ctx, spec);
    if (!run || run.start) return ctx.defaultNode;
    return spec.mode === "mark" ? dittoMark(ctx.value) : runLine(ctx.value, run.end, spec.mode === "arrow" ? "arrow" : "tick");
  };
}
var DIM = 0.4;
function dimmedPath(path, shared) {
  if (shared <= 0) return path;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { opacity: DIM }, children: path.slice(0, shared) }),
    path.slice(shared)
  ] });
}
function dimPathNode(path, above) {
  return dimmedPath(path, typeof above === "string" ? sharedPathPrefix(path, above) : 0);
}
function treeChildNode(parent, tail, last) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": true, style: { opacity: DIM, whiteSpace: "pre" }, children: last ? "\u2514 " : "\u251C " }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 0 }, children: parent }),
    tail
  ] });
}
var RULE_X = "0.9em";
var pct = (x, span) => `${x / span * 100}%`;
function arrowhead(top, key) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "span",
    {
      style: {
        position: "absolute",
        top,
        left: `calc(${RULE_X} - 0.3em + 0.5px)`,
        opacity: 0.5,
        borderLeft: "0.3em solid transparent",
        borderRight: "0.3em solid transparent",
        borderTop: "0.45em solid currentColor"
      }
    },
    key
  );
}
function runRenderer(mode, opts = {}) {
  const { float = true, every = 5 } = opts;
  return ({ span, offsets, defaultNode, stickyTop }) => {
    const last = offsets[offsets.length - 1];
    const deco = [];
    if (mode === "mark") {
      for (const o of offsets.slice(1)) {
        deco.push(
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-label": "ditto", style: {
            position: "absolute",
            left: 0,
            right: 0,
            top: pct(o, span),
            height: pct(1, span),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.3
          }, children: "\u3003" }, o)
        );
      }
    } else if ((mode === "line" || mode === "arrow") && offsets.length > 1) {
      const top = pct(offsets[0] + 1, span);
      const bottom = pct(span - last - 0.5, span);
      deco.push(
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-label": mode === "line" ? "run line" : "run arrow", style: {
          position: "absolute",
          left: RULE_X,
          top,
          bottom,
          opacity: 0.35,
          borderLeft: RULE,
          ...mode === "line" ? { width: "0.6em", borderBottom: RULE } : {}
        } }, "rule")
      );
      if (mode === "arrow") {
        offsets.forEach((o, k) => {
          if (k > 0 && k < offsets.length - 1 && every > 0 && k % every === 0) deco.push(arrowhead(`calc(${pct(o + 0.5, span)} - 0.3em)`, k));
        });
        deco.push(arrowhead(`calc(${pct(last + 0.5, span)} - 0.2em)`, "end"));
      }
    }
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": true, style: { position: "absolute", inset: 0, pointerEvents: "none" }, children: deco }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: {
        position: float ? "sticky" : "relative",
        ...float ? { top: stickyTop } : {},
        background: "var(--ft-run-bg, Canvas)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }, children: defaultNode })
    ] });
  };
}

// src/renderers/tableBody.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function useHeadHeight(tbody, on) {
  const [h, setH] = (0, import_react6.useState)(0);
  (0, import_react6.useLayoutEffect)(() => {
    const head = tbody.current?.parentElement?.querySelector(":scope > thead");
    if (!on || !head) return;
    const update = () => setH(head.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(head);
    return () => ro.disconnect();
  }, [tbody, on]);
  return h;
}
var INDENT_EM = 1.1;
var FOLD_BTN = {
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  padding: "0 0.3em 0 0",
  opacity: 0.6
};
function TableRows({
  rows,
  columns,
  path,
  colStyles,
  widthStyle,
  el,
  ditto,
  paths,
  groups,
  renderCell,
  defaultNode,
  raw,
  rowIndex,
  rowKey = (i) => i,
  rowStyle,
  onCellHover,
  usePersistedState,
  children
}) {
  const use = usePersistedState ?? defaultUseState;
  const [foldRaw, setFoldRaw] = use("fold", "");
  const folded = (0, import_react6.useMemo)(() => parseFolds(foldRaw), [foldRaw]);
  const toggleFold = (key) => {
    const h = groupHash(key);
    const next = new Set(folded);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    setFoldRaw([...next].join(""));
  };
  const layout = (0, import_react6.useMemo)(
    () => tableLayout(rows, columns, { ditto, paths, ...groups ? { groups } : {}, folded }),
    [rows, columns, ditto, paths, groups, folded]
  );
  const notifyHover = useStableCallback(onCellHover);
  const tbody = (0, import_react6.useRef)(null);
  const anyMerged = [...layout.specs.values()].some((s) => s.mode !== "none");
  const headH = useHeadHeight(tbody, anyMerged);
  const renderers = (0, import_react6.useMemo)(() => new Map([...layout.specs].map(([c, s]) => [
    c,
    s.mode === "none" ? void 0 : s.render ?? runRenderer(s.mode, { float: s.float, every: s.every })
  ])), [layout.specs]);
  const displayOf = [];
  const order = [];
  layout.items.forEach((it, d) => {
    if (it.kind === "row") {
      displayOf[it.i] = d;
      order.push(it.i);
    }
  });
  const posOf = [];
  order.forEach((i, k) => {
    posOf[i] = k;
  });
  const coveredTo = /* @__PURE__ */ new Map();
  const covered = (c, d) => (coveredTo.get(c) ?? -1) >= d;
  const width = (c) => widthStyle?.(c) ?? {};
  const trs = layout.items.map((it, d) => {
    if (it.kind === "group") {
      const { group: g, depth: depth2, collapsed, size } = it;
      const label = typeof g.label === "string" && g.prefix ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 0 }, children: g.prefix.slice(0, g.prefix.length - g.label.length) }),
        g.label
      ] }) : g.label;
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("tr", { "data-group": g.key, "data-depth": depth2, style: rowStyle, children: columns.map((c) => {
        if (covered(c.name, d)) return null;
        const st = colStyles.get(c.name);
        const style = { ...st?.cell ?? TD_STYLE, ...width(c.name) };
        if (c.name !== g.column) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { style, className: st?.cellClass }, c.name);
        return (
          // `ltr`: a header is toggle + label, not a value to clip from the start.
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("td", { style: { ...style, direction: "ltr", paddingLeft: `calc(${style.paddingLeft ?? "0.6em"} + ${depth2 * INDENT_EM}em)` }, className: st?.cellClass, ...g.title ? { title: g.title } : {}, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", "aria-expanded": !collapsed, "aria-label": collapsed ? "expand" : "collapse", onClick: () => toggleFold(g.key), style: FOLD_BTN, children: collapsed ? "\u25B8" : "\u25BE" }),
            label,
            collapsed && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { opacity: 0.5 }, children: ` \xB7 ${size.toLocaleString()} row${size === 1 ? "" : "s"}` })
          ] }, c.name)
        );
      }) }, `group:${g.key}`);
    }
    const { i, depth, group } = it;
    const row = rows[i];
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("tr", { style: rowStyle, children: columns.map((c) => {
      if (covered(c.name, d)) return null;
      const st = colStyles.get(c.name);
      const ellipsis = st?.ellipsis ?? "end";
      const value = row[c.name];
      const run = layout.runs.get(c.name)?.[i];
      const base = defaultNode(value, c);
      let start = base;
      let indent = 0;
      const pathMode = layout.paths.get(c.name);
      const isPath = pathMode !== void 0 && typeof value === "string";
      if (isPath) {
        if (group?.prefix !== void 0 && group.column === c.name && value.startsWith(group.prefix)) {
          start = treeChildNode(group.prefix, value.slice(group.prefix.length), i === group.end - 1);
          indent = depth;
        } else {
          const above = order[posOf[i] - 1];
          start = dimPathNode(value, above === void 0 ? void 0 : rows[above][c.name]);
        }
      }
      const ctx = tableCellCtx({
        value,
        column: c,
        row,
        at: (dr) => rows[i + dr],
        rowIndex: rowIndex(i),
        path,
        defaultNode: start,
        ...run ? { run } : {}
      });
      const rendered = renderCell ? renderCell(ctx) : start;
      const custom = rendered !== base;
      const wrapped = ellipsisWrap(ellipsis, rendered, !custom && typeof value === "string" ? value : void 0);
      const elided = applyElide(el, { value, node: wrapped, hasCustomRender: custom, column: c, row, path, raw: raw?.(value, c), ellipsis });
      const { node } = elided;
      let { title, onMouseEnter: measure } = elided;
      const runRender = renderers.get(c.name);
      if (isPath && rendered === start && el.tooltip === "native" || run?.start && runRender && el.tooltip === "native" && !custom) {
        const t = cellTitle(value);
        if (t !== void 0) {
          title = t;
          measure = void 0;
        }
      }
      const hoverEnter = onCellHover ? () => notifyHover(ctx) : void 0;
      const handlers = {
        ...measure || hoverEnter ? { onMouseEnter: (e) => {
          measure?.(e);
          hoverEnter?.();
        } } : {},
        ...onCellHover ? { onMouseLeave: () => notifyHover(null) } : {}
      };
      const tips = title != null ? { title } : {};
      const style = {
        ...st?.cell ?? TD_STYLE,
        ...width(c.name),
        ...indent ? { paddingLeft: `calc(${(st?.cell ?? TD_STYLE).paddingLeft ?? "0.6em"} + ${indent * INDENT_EM}em)` } : {}
      };
      if (run?.start && runRender) {
        const runRows = order.slice(posOf[i], posOf[i] + run.length);
        const spanEnd = displayOf[runRows[runRows.length - 1]];
        const span = spanEnd - d + 1;
        coveredTo.set(c.name, spanEnd);
        const content = runRender({
          value,
          column: c,
          rows: runRows.map((k) => rows[k]),
          span,
          offsets: runRows.map((k) => displayOf[k] - d),
          defaultNode: node,
          stickyTop: headH,
          path
        });
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "td",
          {
            rowSpan: span,
            "data-run": run.length,
            className: st?.cellClass,
            style: { ...style, overflow: "visible", verticalAlign: "top", position: "relative" },
            ...tips,
            ...handlers,
            children: content
          },
          c.name
        );
      }
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { style, className: st?.cellClass, ...tips, ...handlers, children: node }, c.name);
    }) }, rowKey(i));
  });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("tbody", { ref: tbody, children: [
    trs,
    children
  ] });
}
function PathNote({ note, onSort }) {
  if (!note) return null;
  const style = {
    marginLeft: "0.5em",
    fontSize: "0.8em",
    fontWeight: 400,
    opacity: 0.75,
    padding: "0 0.4em",
    border: "1px dashed currentColor",
    borderRadius: 3,
    background: "transparent",
    color: "inherit",
    font: "inherit"
  };
  return onSort ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", title: note, onClick: (e) => {
    e.stopPropagation();
    onSort();
  }, style: { ...style, cursor: "pointer" }, children: "sort for tree" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { title: note, style, children: "tree needs sort" });
}

// src/renderers/parquet.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var ROWS_PER_PAGE = 100;
var ROW_STYLE = { borderTop: "1px solid rgba(127,127,127,0.15)" };
function makeParquetViewer(opts = {}) {
  return function BoundParquetViewer(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ParquetViewer, { ...props, ...opts });
  };
}
function ParquetViewer({ store, path, usePersistedState, renderCell, renderHeader, cellProps, headerProps, inferTimestamps = true, alignNumeric = true, columnPicker = false, hiddenColumns, fullLoadMaxBytes = DEFAULT_FULL_LOAD_MAX_BYTES, sortComparators, pageSize = ROWS_PER_PAGE, ditto, paths, groups, foldConstantColumns = false, compressors, onPage, onCellHover, elide, resizableColumns = false }) {
  const { meta, error: metaError } = useParquetMeta(store, path);
  const use = usePersistedState ?? defaultUseState;
  const [page, setPage] = use("page", 0);
  const [rgPage, setRgPage] = (0, import_react7.useState)(0);
  (0, import_react7.useEffect)(() => {
    setRgPage(0);
  }, [page]);
  const smallTable = meta !== null && meta.byteSize <= fullLoadMaxBytes;
  const { rows: rgRows, error: rgError } = useRowGroup(store, path, meta, page, void 0, compressors);
  const { rows: allRows, error: allError } = useAllRows(store, path, meta, smallTable, compressors);
  const sort = useSort(usePersistedState);
  const [filter, setFilter] = useFilter(usePersistedState);
  const { visible, ...vis } = useColumnVisibility(meta?.schema ?? [], usePersistedState, hiddenColumns);
  const error = metaError ?? (smallTable ? allError : rgError);
  (0, import_react7.useEffect)(() => {
    if (meta && (page < 0 || page >= meta.rowGroups.length)) setPage(0);
  }, [meta, page, setPage]);
  const sortedAll = useSortedRows(smallTable ? allRows : null, sort, sortComparators, meta?.schema);
  const filteredAll = (0, import_react7.useMemo)(
    () => filterRows(sortedAll, filter, visible),
    [sortedAll, filter, visible]
  );
  const rows = smallTable ? filteredAll : rgRows;
  const predicate = smallTable ? null : parsePredicate(filter);
  const prunedGroups = (0, import_react7.useMemo)(
    () => predicate && meta ? pruneRowGroups(meta.rowGroups, predicate) : null,
    [predicate?.column, predicate?.op, predicate?.value, meta]
  );
  const temporal = (0, import_react7.useMemo)(
    () => meta ? inferColumnFormats(meta.schema, rows, { infer: inferTimestamps }) : /* @__PURE__ */ new Map(),
    [meta, rows, inferTimestamps]
  );
  const el = (0, import_react7.useMemo)(() => resolveElide(elide), [elide]);
  const folded = (0, import_react7.useMemo)(
    () => foldConstantColumns && meta ? constantColumns(meta) : /* @__PURE__ */ new Map(),
    [foldConstantColumns, meta]
  );
  const cw = useColumnWidths({
    on: !!resizableColumns,
    scope: typeof resizableColumns === "object" ? resizableColumns.scope ?? "path" : "path",
    columns: meta?.schema ?? [],
    path,
    usePersistedState
  });
  const colStyles = (0, import_react7.useMemo)(
    // Numeric alignment keys off the *rendered* meaning, not the
    // physical type: a column read as temporal prints as text, so
    // right-aligning it would just detach it from its header.
    () => resolveColStyles(
      meta?.schema ?? [],
      path,
      { cellProps, headerProps },
      (c) => alignNumeric && !temporal.has(c.name) && c.physicalType !== void 0 && NUMERIC_TYPES.has(c.physicalType),
      el
    ),
    [meta, temporal, alignNumeric, cellProps, headerProps, path, el]
  );
  const pageCtxRef = (0, import_react7.useRef)({ rows: [], columns: [], path, pageStart: 0, totalRows: 0 });
  usePageNotify(onPage, pageCtxRef, [rows, rgPage, page, path, visible.join(",")]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!meta) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { opacity: 0.6 }, children: "reading parquet metadata\u2026" });
  const { schema: rawSchema, totalRows, byteSize, rowGroups } = meta;
  const allColumns = rawSchema.map((c) => temporal.has(c.name) ? { ...c, kind: "temporal" } : c);
  const schema = allColumns.filter((c) => visible.includes(c.name) && !folded.has(c.name));
  const FilterBar = () => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { opacity: 0.8, fontSize: "0.9em", margin: "0 0 0.5em", display: "flex", alignItems: "center", gap: "0.6em", flexWrap: "wrap" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      FilterInput,
      {
        value: filter,
        onChange: (v) => {
          setFilter(v);
          setRgPage(0);
          setPage(0);
        },
        placeholder: smallTable ? "filter rows" : "filter (e.g. dt >= 2026-01-01)",
        ...smallTable && sortedAll ? { count: { shown: rows?.length ?? 0, total: sortedAll.length } } : {}
      }
    ),
    predicate && prunedGroups && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { opacity: 0.7 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: prunedGroups.length }),
      " / ",
      rowGroups.length,
      " row groups can match",
      isSortedBy(meta, predicate.column) && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        " \xB7 file is sorted by ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: predicate.column })
      ] })
    ] }),
    !smallTable && !predicate && filter.trim() !== "" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { opacity: 0.7 }, children: [
      "streaming \u2014 only comparisons (",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: "col >= x" }),
      ") can be answered without the whole file"
    ] })
  ] });
  if (rowGroups.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { opacity: 0.7 }, children: "parquet file has no row groups" });
  }
  const activeGroups = prunedGroups ?? rowGroups;
  if (activeGroups.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(FilterBar, {}),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { opacity: 0.7 }, children: [
        "No row group can contain a match for ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: filter }),
        "."
      ] })
    ] });
  }
  const rgIndex = Math.min(Math.max(page, 0), activeGroups.length - 1);
  const rg = activeGroups[rgIndex];
  const rowBase = smallTable ? 0 : rg.rowStart;
  const rgPageCount = rows ? Math.max(1, Math.ceil(rows.length / pageSize)) : 0;
  const clampedRgPage = Math.min(Math.max(rgPage, 0), Math.max(0, rgPageCount - 1));
  const pageRowStart = rowBase + clampedRgPage * pageSize;
  const pageRowEnd = rows ? rowBase + Math.min((clampedRgPage + 1) * pageSize, rows.length) : pageRowStart;
  const visibleRows = rows ? rows.slice(clampedRgPage * pageSize, (clampedRgPage + 1) * pageSize) : null;
  pageCtxRef.current = { rows: visibleRows ?? [], columns: schema, path, pageStart: pageRowStart, totalRows };
  const pathNotes = paths ? pathModes(visibleRows ?? [], schema, paths).notes : void 0;
  const goPrevPage = () => {
    if (clampedRgPage > 0) setRgPage(clampedRgPage - 1);
    else if (!smallTable && rgIndex > 0) setPage(rgIndex - 1);
  };
  const goNextPage = () => {
    if (clampedRgPage < rgPageCount - 1) setRgPage(clampedRgPage + 1);
    else if (!smallTable && rgIndex < activeGroups.length - 1) setPage(rgIndex + 1);
  };
  const canGoPrev = clampedRgPage > 0 || !smallTable && rgIndex > 0;
  const canGoNext = rows !== null && clampedRgPage < rgPageCount - 1 || !smallTable && rgIndex < activeGroups.length - 1;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em", display: "flex", alignItems: "center", gap: "0.6em", flexWrap: "wrap", position: "relative", zIndex: 2 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: totalRows.toLocaleString() }),
        " rows \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: allColumns.length }),
        " columns \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: rowGroups.length }),
        " row group",
        rowGroups.length === 1 ? "" : "s",
        " \xB7 ",
        fmtSize(byteSize)
      ] }),
      columnPicker && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColumnPicker, { columns: allColumns, vis: { visible, ...vis } })
    ] }),
    folded.size > 0 && // Constant columns, stated once instead of repeated down the grid.
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: { opacity: 0.7, fontSize: "0.9em", margin: "0 0 0.5em", display: "flex", gap: "1em", flexWrap: "wrap" }, children: [...folded].map(([name, value]) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: name }),
      " = ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: String(value) })
    ] }, name)) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: "schema" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: allColumns.map((c) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: c.name }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.1em 0", opacity: 0.7 }, children: typeLabel(c, temporal.get(c.name)) })
      ] }, c.name)) }) })
    ] }),
    rowGroups.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: [
        "row groups (",
        rowGroups.length,
        ")"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.1em 0.6em 0.1em 0", fontWeight: 400 }, children: "#" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "rows" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "compressed" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "uncompressed" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: rowGroups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { style: { background: g.index === rgIndex ? "rgba(127,127,127,0.12)" : void 0, cursor: "pointer" }, onClick: () => setPage(g.index), children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: g.index }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: g.numRows.toLocaleString() }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.8 }, children: g.compressedBytes != null ? fmtSize(g.compressedBytes) : "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6 }, children: fmtSize(g.uncompressedBytes) })
        ] }, g.index)) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(FilterBar, {}),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Pager, { rg, rgCount: activeGroups.length, setPage, totalRows }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      RowPager,
      {
        canGoPrev,
        canGoNext,
        goPrev: goPrevPage,
        goNext: goNextPage,
        rowStart: pageRowStart,
        rowEnd: pageRowEnd,
        totalRows,
        pageIdx: clampedRgPage,
        pageCount: rgPageCount,
        smallTable,
        rows
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { style: { position: "sticky", top: 0, zIndex: 1, background: "linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas" }, children: schema.map((c) => {
        const st = colStyles.get(c.name);
        const stats = rg.stats.get(c.name);
        const title = statsTitle(stats, temporal.get(c.name));
        const label = title ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { title, children: c.name }) : c.name;
        const defaultNode = smallTable ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "span",
          {
            role: "button",
            tabIndex: 0,
            onClick: () => {
              sort.toggle(c.name);
              setRgPage(0);
            },
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                sort.toggle(c.name);
                setRgPage(0);
              }
            },
            title: `Sort by ${c.name}`,
            style: { cursor: "pointer", userSelect: "none" },
            children: [
              label,
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: sort.column === c.name ? 0.8 : 0.3, marginLeft: "0.3em", fontSize: "0.85em" }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : label;
        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("th", { style: { ...st?.header ?? TH_STYLE, ...resizableColumns ? { position: "relative" } : {}, ...cw.styleFor(c.name) }, className: st?.headerClass, children: [
          renderHeader ? renderHeader({ column: c, ...stats ? { stats } : {}, path, defaultNode }) : defaultNode,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(PathNote, { note: pathNotes?.get(c.name), onSort: smallTable ? () => {
            sort.toggle(c.name);
            setRgPage(0);
          } : void 0 }),
          resizableColumns && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColumnResizeHandle, { col: c.name, widths: cw })
        ] }, c.name);
      }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        TableRows,
        {
          rows: visibleRows ?? [],
          columns: schema,
          path,
          colStyles,
          widthStyle: cw.styleFor,
          el,
          ...ditto ? { ditto } : {},
          ...paths ? { paths } : {},
          ...groups ? { groups } : {},
          ...usePersistedState ? { usePersistedState } : {},
          ...renderCell ? { renderCell } : {},
          defaultNode: (value, c) => fmtCell(value, temporal.get(c.name)),
          raw: (value, c) => cellRaw(value, temporal.get(c.name)),
          rowIndex: (i) => pageRowStart + i,
          rowKey: (i) => clampedRgPage * pageSize + i,
          rowStyle: ROW_STYLE,
          ...onCellHover ? { onCellHover } : {},
          children: visibleRows === null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("td", { colSpan: schema.length, style: { padding: "0.5em", opacity: 0.6 }, children: [
            "loading row group ",
            rgIndex,
            "\u2026"
          ] }) })
        }
      )
    ] }) })
  ] });
}
function RowPager({ canGoPrev, canGoNext, goPrev, goNext, rowStart, rowEnd, totalRows, pageIdx, pageCount, rows, smallTable }) {
  if (rows === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.3em 0", fontSize: "0.85em", opacity: 0.5 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "rows \u2014" }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.3em 0", fontSize: "0.85em", opacity: 0.9 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: !canGoPrev, onClick: goPrev, children: "\u2039" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { fontVariantNumeric: "tabular-nums" }, children: [
      "rows ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: rowStart.toLocaleString() }),
      "\u2013",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: rowEnd.toLocaleString() }),
      " / ",
      totalRows.toLocaleString(),
      pageCount > 1 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { opacity: 0.6 }, children: [
        " \xB7 page ",
        pageIdx + 1,
        "/",
        pageCount,
        smallTable ? "" : " of RG"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: !canGoNext, onClick: goNext, children: "\u203A" })
  ] });
}
function Pager({ rg, rgCount, setPage, totalRows }) {
  if (rgCount <= 1) return null;
  const sizeLabel = rg.compressedBytes != null ? fmtSize(rg.compressedBytes) : fmtSize(rg.uncompressedBytes);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: rg.index === 0, onClick: () => setPage(0), children: "\xAB" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: rg.index === 0, onClick: () => setPage(rg.index - 1), children: "\u2039" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { opacity: 0.8 }, children: [
      "row group ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: rg.index + 1 }),
      " / ",
      rgCount,
      " \xB7 rows ",
      rg.rowStart.toLocaleString(),
      "\u2013",
      rg.rowEnd.toLocaleString(),
      " / ",
      totalRows.toLocaleString(),
      " \xB7 ",
      sizeLabel
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rg.index + 1), children: "\u203A" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rgCount - 1), children: "\xBB" })
  ] });
}
function rawText(v) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function fmtCell(v, temporal) {
  if (v === null || v === void 0) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: 0.3 }, children: "\xB7" });
  if (temporal) {
    const s = formatTemporal(v, temporal);
    if (s !== null) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontVariantNumeric: "tabular-nums" }, children: s });
  }
  return rawText(v);
}
function cellRaw(v, temporal) {
  if (temporal && v !== null && v !== void 0 && formatTemporal(v, temporal) !== null) return rawText(v);
  return void 0;
}
function statValue2(v, temporal) {
  if (v === null || v === void 0) return null;
  if (temporal) {
    const s = formatTemporal(v, temporal);
    if (s !== null) return s;
  }
  if (typeof v === "bigint" || typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}\u2026` : v;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) {
    try {
      const s = new TextDecoder("utf-8", { fatal: true }).decode(v);
      return s.length > 40 ? `${s.slice(0, 40)}\u2026` : s;
    } catch {
      return null;
    }
  }
  return null;
}
function statsTitle(stats, temporal) {
  if (!stats) return void 0;
  const parts = [];
  const min = statValue2(stats.min, temporal);
  const max = statValue2(stats.max, temporal);
  if (min !== null && max !== null) parts.push(min === max ? `= ${min}` : `${min} \u2026 ${max}`);
  else if (min !== null) parts.push(`\u2265 ${min}`);
  else if (max !== null) parts.push(`\u2264 ${max}`);
  if (stats.nullCount) parts.push(`${stats.nullCount.toLocaleString()} null`);
  return parts.length ? `row group: ${parts.join(" \xB7 ")}` : void 0;
}
function typeLabel(c, temporal) {
  const parts = [c.physicalType ?? "?"];
  const ann = c.logicalType ? c.timeUnit ? `${c.logicalType}(${c.timeUnit})` : c.logicalType : c.convertedType;
  if (ann) parts.push(ann);
  if (temporal?.source === "inferred") parts.push(`epoch ${temporal.unit.toLowerCase()} (inferred)`);
  return parts.join(" \xB7 ");
}
var parquet_default = ParquetViewer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NUMERIC_TYPES,
  ParquetViewer,
  RG_CACHE_SIZE,
  chainCellRenderers,
  coarseKind,
  defaultCompressors,
  dittoMark,
  dittoRenderer,
  formatTemporal,
  inferColumnFormats,
  inferTemporalFormat,
  makeParquetViewer,
  pathGroups,
  readParquetRows,
  repeatsAbove,
  runGroups,
  runRenderer,
  toMillis,
  useAllRows,
  useParquetMeta,
  useRowGroup,
  withDefaultCompressors
});
//# sourceMappingURL=parquet.cjs.map