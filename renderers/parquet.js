// src/renderers/parquet.tsx
import { useEffect, useState } from "react";
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

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/parquet.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var ROWS_PER_PAGE = 200;
function ParquetViewer({ store, path }) {
  const [schema, setSchema] = useState(null);
  const [totalRows, setTotalRows] = useState(null);
  const [byteSize, setByteSize] = useState(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
        const meta = await parquetMetadataAsync(file);
        if (cancelled) return;
        const sch = parquetSchema(meta).children.map((c) => ({
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
  useEffect(() => {
    if (totalRows === null) return;
    let cancelled = false;
    const rowStart2 = page * ROWS_PER_PAGE;
    const rowEnd2 = Math.min(totalRows, rowStart2 + ROWS_PER_PAGE);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const out = [];
        await parquetRead({
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
  if (error) return /* @__PURE__ */ jsxs("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!schema || totalRows === null) return /* @__PURE__ */ jsx("div", { style: { opacity: 0.6 }, children: "reading parquet metadata\u2026" });
  const pages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const rowStart = page * ROWS_PER_PAGE;
  const rowEnd = Math.min(totalRows, rowStart + ROWS_PER_PAGE);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("p", { style: { opacity: 0.7, fontSize: "0.95em" }, children: [
      /* @__PURE__ */ jsx("b", { children: totalRows.toLocaleString() }),
      " rows \xB7 ",
      /* @__PURE__ */ jsx("b", { children: schema.length }),
      " columns",
      byteSize ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " \xB7 ",
        fmtSize(byteSize)
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ jsx("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: "schema" }),
      /* @__PURE__ */ jsx("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: /* @__PURE__ */ jsx("tbody", { children: schema.map((c) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: c.name }),
        /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0", opacity: 0.7 }, children: c.type ?? "?" })
      ] }, c.name)) }) })
    ] }),
    /* @__PURE__ */ jsx(Pager, { page, pages, setPage, rowStart, rowEnd, totalRows }),
    /* @__PURE__ */ jsx("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ jsxs("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { style: { position: "sticky", top: 0, background: "rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ jsx("th", { style: { padding: "0.3em 0.6em", textAlign: "left", borderBottom: "1px solid rgba(127,127,127,0.4)", fontWeight: 500 }, children: c.name }, c.name)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows === null ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: schema.length, style: { padding: "0.5em", opacity: 0.6 }, children: "loading rows\u2026" }) }) : rows.map((r, i) => /* @__PURE__ */ jsx("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ jsx("td", { style: { padding: "0.2em 0.6em", whiteSpace: "nowrap", maxWidth: "30em", overflow: "hidden", textOverflow: "ellipsis" }, children: fmtCell(r[c.name]) }, c.name)) }, i)) })
    ] }) })
  ] });
}
function Pager({ page, pages, setPage, rowStart, rowEnd, totalRows }) {
  if (pages <= 1) return null;
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ jsx("button", { disabled: page === 0, onClick: () => setPage(0), children: "\xAB" }),
    /* @__PURE__ */ jsx("button", { disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039" }),
    /* @__PURE__ */ jsxs("span", { style: { opacity: 0.8 }, children: [
      "page ",
      /* @__PURE__ */ jsx("b", { children: page + 1 }),
      " / ",
      pages,
      " \xB7 rows ",
      rowStart.toLocaleString(),
      "\u2013",
      rowEnd.toLocaleString(),
      " / ",
      totalRows.toLocaleString()
    ] }),
    /* @__PURE__ */ jsx("button", { disabled: page === pages - 1, onClick: () => setPage(page + 1), children: "\u203A" }),
    /* @__PURE__ */ jsx("button", { disabled: page === pages - 1, onClick: () => setPage(pages - 1), children: "\xBB" })
  ] });
}
function fmtCell(v) {
  if (v === null || v === void 0) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
export {
  ParquetViewer
};
//# sourceMappingURL=parquet.js.map