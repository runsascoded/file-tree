// src/renderers/parquet.tsx
import { useEffect as useEffect2, useMemo as useMemo2, useState as useState4 } from "react";

// src/renderers/parquetData.ts
import { useEffect, useRef, useState } from "react";
import { parquetMetadataAsync, parquetRead, parquetSchema } from "hyparquet";

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
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setError(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const md = await parquetMetadataAsync(file);
        if (cancelled) return;
        const schema = parquetSchema(md).children.map((c) => {
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
            stats
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
function useRowGroup(store, path, meta, index, cacheSize = RG_CACHE_SIZE) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const cache = useRef(/* @__PURE__ */ new Map());
  useEffect(() => {
    cache.current = /* @__PURE__ */ new Map();
    setRows(null);
    setError(null);
  }, [store, path]);
  useEffect(() => {
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
        const file = await asyncBufferFromStore(store, path);
        const out = [];
        await parquetRead({
          file,
          rowStart: rg.rowStart,
          rowEnd: rg.rowEnd,
          rowFormat: "object",
          onComplete: (data) => {
            if (Array.isArray(data)) for (const r of data) out.push(r);
          }
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
  }, [store, path, index, meta, cacheSize]);
  return { rows, error };
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
import { useState as useState2 } from "react";
var defaultUseState = (_key, defaultValue) => useState2(defaultValue);

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
import { useCallback, useMemo, useState as useState3 } from "react";
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
  const [open, setOpen] = useState3(false);
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

// src/renderers/parquet.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var ROWS_PER_PAGE = 100;
function makeParquetViewer(opts = {}) {
  return function BoundParquetViewer(props) {
    return /* @__PURE__ */ jsx2(ParquetViewer, { ...props, ...opts });
  };
}
function ParquetViewer({ store, path, usePersistedState, renderCell, renderHeader, cellProps, headerProps, inferTimestamps = true, alignNumeric = true, columnPicker = false, hiddenColumns }) {
  const { meta, error: metaError } = useParquetMeta(store, path);
  const use = usePersistedState ?? defaultUseState;
  const [page, setPage] = use("page", 0);
  const [rgPage, setRgPage] = useState4(0);
  useEffect2(() => {
    setRgPage(0);
  }, [page]);
  const { rows, error: rowsError } = useRowGroup(store, path, meta, page);
  const { visible, ...vis } = useColumnVisibility(meta?.schema ?? [], usePersistedState, hiddenColumns);
  const error = metaError ?? rowsError;
  useEffect2(() => {
    if (meta && (page < 0 || page >= meta.rowGroups.length)) setPage(0);
  }, [meta, page, setPage]);
  const temporal = useMemo2(
    () => meta ? inferColumnFormats(meta.schema, rows, { infer: inferTimestamps }) : /* @__PURE__ */ new Map(),
    [meta, rows, inferTimestamps]
  );
  const colStyles = useMemo2(
    // Numeric alignment keys off the *rendered* meaning, not the
    // physical type: a column read as temporal prints as text, so
    // right-aligning it would just detach it from its header.
    () => resolveColStyles(
      meta?.schema ?? [],
      path,
      { cellProps, headerProps },
      (c) => alignNumeric && !temporal.has(c.name) && c.physicalType !== void 0 && NUMERIC_TYPES.has(c.physicalType)
    ),
    [meta, temporal, alignNumeric, cellProps, headerProps, path]
  );
  if (error) return /* @__PURE__ */ jsxs2("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!meta) return /* @__PURE__ */ jsx2("div", { style: { opacity: 0.6 }, children: "reading parquet metadata\u2026" });
  const { schema: rawSchema, totalRows, byteSize, rowGroups } = meta;
  const allColumns = rawSchema.map((c) => temporal.has(c.name) ? { ...c, kind: "temporal" } : c);
  const schema = allColumns.filter((c) => visible.includes(c.name));
  if (rowGroups.length === 0) {
    return /* @__PURE__ */ jsx2("div", { style: { opacity: 0.7 }, children: "parquet file has no row groups" });
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
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsxs2("p", { style: { opacity: 0.7, fontSize: "0.95em", display: "flex", alignItems: "center", gap: "0.6em", flexWrap: "wrap", position: "relative", zIndex: 2 }, children: [
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx2("b", { children: totalRows.toLocaleString() }),
        " rows \xB7 ",
        /* @__PURE__ */ jsx2("b", { children: allColumns.length }),
        " columns \xB7 ",
        /* @__PURE__ */ jsx2("b", { children: rowGroups.length }),
        " row group",
        rowGroups.length === 1 ? "" : "s",
        " \xB7 ",
        fmtSize(byteSize)
      ] }),
      columnPicker && /* @__PURE__ */ jsx2(ColumnPicker, { columns: allColumns, vis: { visible, ...vis } })
    ] }),
    /* @__PURE__ */ jsxs2("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ jsx2("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: "schema" }),
      /* @__PURE__ */ jsx2("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: /* @__PURE__ */ jsx2("tbody", { children: allColumns.map((c) => /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: c.name }),
        /* @__PURE__ */ jsx2("td", { style: { padding: "0.1em 0", opacity: 0.7 }, children: typeLabel(c, temporal.get(c.name)) })
      ] }, c.name)) }) })
    ] }),
    rowGroups.length > 1 && /* @__PURE__ */ jsxs2("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ jsxs2("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: [
        "row groups (",
        rowGroups.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxs2("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
          /* @__PURE__ */ jsx2("th", { style: { padding: "0.1em 0.6em 0.1em 0", fontWeight: 400 }, children: "#" }),
          /* @__PURE__ */ jsx2("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "rows" }),
          /* @__PURE__ */ jsx2("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "compressed" }),
          /* @__PURE__ */ jsx2("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "uncompressed" })
        ] }) }),
        /* @__PURE__ */ jsx2("tbody", { children: rowGroups.map((g) => /* @__PURE__ */ jsxs2("tr", { style: { background: g.index === rgIndex ? "rgba(127,127,127,0.12)" : void 0, cursor: "pointer" }, onClick: () => setPage(g.index), children: [
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: g.index }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: g.numRows.toLocaleString() }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.8 }, children: g.compressedBytes != null ? fmtSize(g.compressedBytes) : "\u2014" }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6 }, children: fmtSize(g.uncompressedBytes) })
        ] }, g.index)) })
      ] })
    ] }),
    /* @__PURE__ */ jsx2(Pager, { rg, rgCount: rowGroups.length, setPage, totalRows }),
    /* @__PURE__ */ jsx2(
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
    /* @__PURE__ */ jsx2("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ jsxs2("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsx2("tr", { style: { position: "sticky", top: 0, zIndex: 1, background: "linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas" }, children: schema.map((c) => {
        const st = colStyles.get(c.name);
        const stats = rg.stats.get(c.name);
        const title = statsTitle(stats, temporal.get(c.name));
        const defaultNode = title ? /* @__PURE__ */ jsx2("span", { title, children: c.name }) : c.name;
        return /* @__PURE__ */ jsx2("th", { style: st?.header ?? TH_STYLE, className: st?.headerClass, children: renderHeader ? renderHeader({ column: c, ...stats ? { stats } : {}, path, defaultNode }) : defaultNode }, c.name);
      }) }) }),
      /* @__PURE__ */ jsx2("tbody", { children: visibleRows === null ? /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsxs2("td", { colSpan: schema.length, style: { padding: "0.5em", opacity: 0.6 }, children: [
        "loading row group ",
        rgIndex,
        "\u2026"
      ] }) }) : visibleRows.map((r, i) => /* @__PURE__ */ jsx2("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: schema.map((c) => {
        const value = r[c.name];
        const defaultNode = fmtCell(value, temporal.get(c.name));
        const st = colStyles.get(c.name);
        return /* @__PURE__ */ jsx2("td", { style: st?.cell ?? TD_STYLE, className: st?.cellClass, children: renderCell ? renderCell({ value, column: c, row: r, rowIndex: pageRowStart + i, path, defaultNode }) : defaultNode }, c.name);
      }) }, clampedRgPage * ROWS_PER_PAGE + i)) })
    ] }) })
  ] });
}
function RowPager({ canGoPrev, canGoNext, goPrev, goNext, rowStart, rowEnd, totalRows, pageIdx, pageCount, rows }) {
  if (rows === null) {
    return /* @__PURE__ */ jsx2("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.3em 0", fontSize: "0.85em", opacity: 0.5 }, children: /* @__PURE__ */ jsx2("span", { children: "rows \u2014" }) });
  }
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.3em 0", fontSize: "0.85em", opacity: 0.9 }, children: [
    /* @__PURE__ */ jsx2("button", { disabled: !canGoPrev, onClick: goPrev, children: "\u2039" }),
    /* @__PURE__ */ jsxs2("span", { style: { fontVariantNumeric: "tabular-nums" }, children: [
      "rows ",
      /* @__PURE__ */ jsx2("b", { children: rowStart.toLocaleString() }),
      "\u2013",
      /* @__PURE__ */ jsx2("b", { children: rowEnd.toLocaleString() }),
      " / ",
      totalRows.toLocaleString(),
      pageCount > 1 && /* @__PURE__ */ jsxs2("span", { style: { opacity: 0.6 }, children: [
        " \xB7 page ",
        pageIdx + 1,
        "/",
        pageCount,
        " of RG"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("button", { disabled: !canGoNext, onClick: goNext, children: "\u203A" })
  ] });
}
function Pager({ rg, rgCount, setPage, totalRows }) {
  if (rgCount <= 1) return null;
  const sizeLabel = rg.compressedBytes != null ? fmtSize(rg.compressedBytes) : fmtSize(rg.uncompressedBytes);
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ jsx2("button", { disabled: rg.index === 0, onClick: () => setPage(0), children: "\xAB" }),
    /* @__PURE__ */ jsx2("button", { disabled: rg.index === 0, onClick: () => setPage(rg.index - 1), children: "\u2039" }),
    /* @__PURE__ */ jsxs2("span", { style: { opacity: 0.8 }, children: [
      "row group ",
      /* @__PURE__ */ jsx2("b", { children: rg.index + 1 }),
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
    /* @__PURE__ */ jsx2("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rg.index + 1), children: "\u203A" }),
    /* @__PURE__ */ jsx2("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rgCount - 1), children: "\xBB" })
  ] });
}
function rawText(v) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function fmtCell(v, temporal) {
  if (v === null || v === void 0) return /* @__PURE__ */ jsx2("span", { style: { opacity: 0.3 }, children: "\xB7" });
  if (temporal) {
    const s = formatTemporal(v, temporal);
    if (s !== null) return /* @__PURE__ */ jsx2("span", { title: rawText(v), style: { fontVariantNumeric: "tabular-nums" }, children: s });
  }
  return rawText(v);
}
function statValue(v, temporal) {
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
  const min = statValue(stats.min, temporal);
  const max = statValue(stats.max, temporal);
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
export {
  NUMERIC_TYPES,
  ParquetViewer,
  RG_CACHE_SIZE,
  coarseKind,
  parquet_default as default,
  formatTemporal,
  inferColumnFormats,
  inferTemporalFormat,
  makeParquetViewer,
  toMillis,
  useParquetMeta,
  useRowGroup
};
//# sourceMappingURL=parquet.js.map