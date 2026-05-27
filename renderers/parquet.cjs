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
  ParquetViewer: () => ParquetViewer
});
module.exports = __toCommonJS(parquet_exports);
var import_react = require("react");
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

// src/renderers/parquet.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var ROWS_PER_PAGE = 200;
function ParquetViewer({ store, path }) {
  const [schema, setSchema] = (0, import_react.useState)(null);
  const [totalRows, setTotalRows] = (0, import_react.useState)(null);
  const [byteSize, setByteSize] = (0, import_react.useState)(null);
  const [page, setPage] = (0, import_react.useState)(0);
  const [rows, setRows] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    setSchema(null);
    setTotalRows(null);
    setByteSize(null);
    setPage(0);
    setRows(null);
    setError(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const meta = await (0, import_hyparquet.parquetMetadataAsync)(file);
        if (cancelled) return;
        const sch = (0, import_hyparquet.parquetSchema)(meta).children.map((c) => ({
          name: c.element.name,
          ...c.element.type ? { type: String(c.element.type) } : {}
        }));
        setSchema(sch);
        setTotalRows(Number(meta.num_rows));
        setByteSize(file.byteLength);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  (0, import_react.useEffect)(() => {
    if (totalRows === null) return;
    let cancelled = false;
    const rowStart2 = page * ROWS_PER_PAGE;
    const rowEnd2 = Math.min(totalRows, rowStart2 + ROWS_PER_PAGE);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const out = [];
        await (0, import_hyparquet.parquetRead)({
          file,
          rowStart: rowStart2,
          rowEnd: rowEnd2,
          rowFormat: "object",
          onComplete: (data) => {
            if (Array.isArray(data)) for (const r of data) out.push(r);
          }
        });
        if (!cancelled) setRows(out);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path, page, totalRows]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!schema || totalRows === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6 }, children: "reading parquet metadata\u2026" });
  const pages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const rowStart = page * ROWS_PER_PAGE;
  const rowEnd = Math.min(totalRows, rowStart + ROWS_PER_PAGE);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: totalRows.toLocaleString() }),
      " rows \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: schema.length }),
      " columns",
      byteSize ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        " \xB7 ",
        fmtSize(byteSize)
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: "schema" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: schema.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: c.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.1em 0", opacity: 0.7 }, children: c.type ?? "?" })
      ] }, c.name)) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pager, { page, pages, setPage, rowStart, rowEnd, totalRows }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { position: "sticky", top: 0, background: "rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { padding: "0.3em 0.6em", textAlign: "left", borderBottom: "1px solid rgba(127,127,127,0.4)", fontWeight: 500 }, children: c.name }, c.name)) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: schema.length, style: { padding: "0.5em", opacity: 0.6 }, children: "loading rows\u2026" }) }) : rows.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { padding: "0.2em 0.6em", whiteSpace: "nowrap", maxWidth: "30em", overflow: "hidden", textOverflow: "ellipsis" }, children: fmtCell(r[c.name]) }, c.name)) }, i)) })
    ] }) })
  ] });
}
function Pager({ page, pages, setPage, rowStart, rowEnd, totalRows }) {
  if (pages <= 1) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === 0, onClick: () => setPage(0), children: "\xAB" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.8 }, children: [
      "page ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: page + 1 }),
      " / ",
      pages,
      " \xB7 rows ",
      rowStart.toLocaleString(),
      "\u2013",
      rowEnd.toLocaleString(),
      " / ",
      totalRows.toLocaleString()
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === pages - 1, onClick: () => setPage(page + 1), children: "\u203A" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === pages - 1, onClick: () => setPage(pages - 1), children: "\xBB" })
  ] });
}
function fmtCell(v) {
  if (v === null || v === void 0) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ParquetViewer
});
//# sourceMappingURL=parquet.cjs.map