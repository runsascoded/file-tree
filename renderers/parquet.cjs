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
  ParquetViewer: () => ParquetViewer,
  formatTemporal: () => formatTemporal,
  inferColumnFormats: () => inferColumnFormats,
  inferTemporalFormat: () => inferTemporalFormat,
  makeParquetViewer: () => makeParquetViewer,
  toMillis: () => toMillis
});
module.exports = __toCommonJS(parquet_exports);
var import_react2 = require("react");
var import_hyparquet = require("hyparquet");

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

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

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

// src/renderers/parquet.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var ROWS_PER_PAGE = 100;
var RG_CACHE_SIZE = 4;
function makeParquetViewer(opts = {}) {
  return function BoundParquetViewer(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParquetViewer, { ...props, ...opts });
  };
}
function ParquetViewer({ store, path, usePersistedState, renderCell, inferTimestamps = true }) {
  const [meta, setMeta] = (0, import_react2.useState)(null);
  const use = usePersistedState ?? defaultUseState;
  const [page, setPage] = use("page", 0);
  const [rows, setRows] = (0, import_react2.useState)(null);
  const [error, setError] = (0, import_react2.useState)(null);
  const [rgPage, setRgPage] = (0, import_react2.useState)(0);
  (0, import_react2.useEffect)(() => {
    setRgPage(0);
  }, [page]);
  const rgCache = (0, import_react2.useRef)(/* @__PURE__ */ new Map());
  (0, import_react2.useEffect)(() => {
    let cancelled = false;
    setMeta(null);
    setRows(null);
    setError(null);
    rgCache.current = /* @__PURE__ */ new Map();
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const md = await (0, import_hyparquet.parquetMetadataAsync)(file);
        if (cancelled) return;
        const schema2 = (0, import_hyparquet.parquetSchema)(md).children.map((c) => {
          const el = c.element;
          const lt = el.logical_type;
          return {
            name: el.name,
            ...el.type ? { physicalType: String(el.type) } : {},
            ...lt ? { logicalType: lt.type } : {},
            ...lt && "unit" in lt ? { timeUnit: lt.unit } : {},
            ...el.converted_type ? { convertedType: String(el.converted_type) } : {}
          };
        });
        const rowGroups2 = [];
        let cum = 0;
        md.row_groups.forEach((rg2, i) => {
          const numRows = Number(rg2.num_rows);
          rowGroups2.push({
            index: i,
            numRows,
            rowStart: cum,
            rowEnd: cum + numRows,
            uncompressedBytes: Number(rg2.total_byte_size),
            compressedBytes: rg2.total_compressed_size != null ? Number(rg2.total_compressed_size) : null
          });
          cum += numRows;
        });
        setMeta({ schema: schema2, totalRows: Number(md.num_rows), byteSize: file.byteLength, rowGroups: rowGroups2 });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  (0, import_react2.useEffect)(() => {
    if (meta && (page < 0 || page >= meta.rowGroups.length)) setPage(0);
  }, [meta, page, setPage]);
  (0, import_react2.useEffect)(() => {
    if (!meta || meta.rowGroups.length === 0) return;
    const rgIdx = Math.min(page, meta.rowGroups.length - 1);
    const rg2 = meta.rowGroups[rgIdx];
    const cached = rgCache.current.get(rgIdx);
    if (cached) {
      rgCache.current.delete(rgIdx);
      rgCache.current.set(rgIdx, cached);
      setRows(cached);
      return;
    }
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const out = [];
        await (0, import_hyparquet.parquetRead)({
          file,
          rowStart: rg2.rowStart,
          rowEnd: rg2.rowEnd,
          rowFormat: "object",
          onComplete: (data) => {
            if (Array.isArray(data)) for (const r of data) out.push(r);
          }
        });
        if (cancelled) return;
        rgCache.current.set(rgIdx, out);
        while (rgCache.current.size > RG_CACHE_SIZE) {
          const oldest = rgCache.current.keys().next().value;
          if (oldest === void 0) break;
          rgCache.current.delete(oldest);
        }
        setRows(out);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path, page, meta]);
  const temporal = (0, import_react2.useMemo)(
    () => meta ? inferColumnFormats(meta.schema, rows, { infer: inferTimestamps }) : /* @__PURE__ */ new Map(),
    [meta, rows, inferTimestamps]
  );
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!meta) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6 }, children: "reading parquet metadata\u2026" });
  const { schema, totalRows, byteSize, rowGroups } = meta;
  if (rowGroups.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.7 }, children: "parquet file has no row groups" });
  }
  const rgIndex = Math.min(Math.max(page, 0), rowGroups.length - 1);
  const rg = rowGroups[rgIndex];
  const rgPageCount = rows ? Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)) : 0;
  const clampedRgPage = Math.min(Math.max(rgPage, 0), Math.max(0, rgPageCount - 1));
  const pageRowStart = rg.rowStart + clampedRgPage * ROWS_PER_PAGE;
  const pageRowEnd = rows ? rg.rowStart + Math.min((clampedRgPage + 1) * ROWS_PER_PAGE, rows.length) : pageRowStart;
  const visibleRows = rows ? rows.slice(clampedRgPage * ROWS_PER_PAGE, (clampedRgPage + 1) * ROWS_PER_PAGE) : null;
  const goPrevPage = () => {
    if (clampedRgPage > 0) setRgPage(clampedRgPage - 1);
    else if (rgIndex > 0) setPage(rgIndex - 1);
  };
  const goNextPage = () => {
    if (clampedRgPage < rgPageCount - 1) setRgPage(clampedRgPage + 1);
    else if (rgIndex < rowGroups.length - 1) setPage(rgIndex + 1);
  };
  const canGoPrev = clampedRgPage > 0 || rgIndex > 0;
  const canGoNext = rows !== null && clampedRgPage < rgPageCount - 1 || rgIndex < rowGroups.length - 1;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: totalRows.toLocaleString() }),
      " rows \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: schema.length }),
      " columns \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: rowGroups.length }),
      " row group",
      rowGroups.length === 1 ? "" : "s",
      " \xB7 ",
      fmtSize(byteSize)
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: "schema" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: schema.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: c.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0", opacity: 0.7 }, children: typeLabel(c, temporal.get(c.name)) })
      ] }, c.name)) }) })
    ] }),
    rowGroups.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: [
        "row groups (",
        rowGroups.length,
        ")"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { padding: "0.1em 0.6em 0.1em 0", fontWeight: 400 }, children: "#" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "rows" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "compressed" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "uncompressed" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rowGroups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { style: { background: g.index === rgIndex ? "rgba(127,127,127,0.12)" : void 0, cursor: "pointer" }, onClick: () => setPage(g.index), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: g.index }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: g.numRows.toLocaleString() }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.8 }, children: g.compressedBytes != null ? fmtSize(g.compressedBytes) : "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6 }, children: fmtSize(g.uncompressedBytes) })
        ] }, g.index)) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pager, { rg, rgCount: rowGroups.length, setPage, totalRows }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
        rows
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { position: "sticky", top: 0, background: "rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { padding: "0.3em 0.6em", textAlign: "left", borderBottom: "1px solid rgba(127,127,127,0.4)", fontWeight: 500 }, children: c.name }, c.name)) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: visibleRows === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { colSpan: schema.length, style: { padding: "0.5em", opacity: 0.6 }, children: [
        "loading row group ",
        rgIndex,
        "\u2026"
      ] }) }) : visibleRows.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: schema.map((c) => {
        const value = r[c.name];
        const defaultNode = fmtCell(value, temporal.get(c.name));
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.2em 0.6em", whiteSpace: "nowrap", maxWidth: "30em", overflow: "hidden", textOverflow: "ellipsis" }, children: renderCell ? renderCell({ value, column: c, row: r, rowIndex: pageRowStart + i, defaultNode }) : defaultNode }, c.name);
      }) }, clampedRgPage * ROWS_PER_PAGE + i)) })
    ] }) })
  ] });
}
function RowPager({ canGoPrev, canGoNext, goPrev, goNext, rowStart, rowEnd, totalRows, pageIdx, pageCount, rows }) {
  if (rows === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.3em 0", fontSize: "0.85em", opacity: 0.5 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "rows \u2014" }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.3em 0", fontSize: "0.85em", opacity: 0.9 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: !canGoPrev, onClick: goPrev, children: "\u2039" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontVariantNumeric: "tabular-nums" }, children: [
      "rows ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: rowStart.toLocaleString() }),
      "\u2013",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: rowEnd.toLocaleString() }),
      " / ",
      totalRows.toLocaleString(),
      pageCount > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.6 }, children: [
        " \xB7 page ",
        pageIdx + 1,
        "/",
        pageCount,
        " of RG"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: !canGoNext, onClick: goNext, children: "\u203A" })
  ] });
}
function Pager({ rg, rgCount, setPage, totalRows }) {
  if (rgCount <= 1) return null;
  const sizeLabel = rg.compressedBytes != null ? fmtSize(rg.compressedBytes) : fmtSize(rg.uncompressedBytes);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: rg.index === 0, onClick: () => setPage(0), children: "\xAB" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: rg.index === 0, onClick: () => setPage(rg.index - 1), children: "\u2039" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.8 }, children: [
      "row group ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: rg.index + 1 }),
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rg.index + 1), children: "\u203A" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rgCount - 1), children: "\xBB" })
  ] });
}
function rawText(v) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function fmtCell(v, temporal) {
  if (v === null || v === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.3 }, children: "\xB7" });
  if (temporal) {
    const s = formatTemporal(v, temporal);
    if (s !== null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: rawText(v), style: { fontVariantNumeric: "tabular-nums" }, children: s });
  }
  return rawText(v);
}
function typeLabel(c, temporal) {
  const parts = [c.physicalType ?? "?"];
  const ann = c.logicalType ? c.timeUnit ? `${c.logicalType}(${c.timeUnit})` : c.logicalType : c.convertedType;
  if (ann) parts.push(ann);
  if (temporal?.source === "inferred") parts.push(`epoch ${temporal.unit.toLowerCase()} (inferred)`);
  return parts.join(" \xB7 ");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ParquetViewer,
  formatTemporal,
  inferColumnFormats,
  inferTemporalFormat,
  makeParquetViewer,
  toMillis
});
//# sourceMappingURL=parquet.cjs.map