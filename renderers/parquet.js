// src/renderers/parquet.tsx
import { useEffect, useState as useState2 } from "react";
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

// src/react/persistedState.ts
import { useState } from "react";
var defaultUseState = (_key, defaultValue) => useState(defaultValue);

// src/renderers/parquet.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function ParquetViewer({ store, path, usePersistedState }) {
  const [meta, setMeta] = useState2(null);
  const use = usePersistedState ?? defaultUseState;
  const [page, setPage] = use("page", 0);
  const [rows, setRows] = useState2(null);
  const [error, setError] = useState2(null);
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setRows(null);
    setError(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const md = await parquetMetadataAsync(file);
        if (cancelled) return;
        const schema2 = parquetSchema(md).children.map((c) => ({
          name: c.element.name,
          ...c.element.type ? { type: String(c.element.type) } : {}
        }));
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
  useEffect(() => {
    if (meta && (page < 0 || page >= meta.rowGroups.length)) setPage(0);
  }, [meta, page, setPage]);
  useEffect(() => {
    if (!meta || meta.rowGroups.length === 0) return;
    const rg2 = meta.rowGroups[Math.min(page, meta.rowGroups.length - 1)];
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const out = [];
        await parquetRead({
          file,
          rowStart: rg2.rowStart,
          rowEnd: rg2.rowEnd,
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
  }, [store, path, page, meta]);
  if (error) return /* @__PURE__ */ jsxs("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!meta) return /* @__PURE__ */ jsx("div", { style: { opacity: 0.6 }, children: "reading parquet metadata\u2026" });
  const { schema, totalRows, byteSize, rowGroups } = meta;
  if (rowGroups.length === 0) {
    return /* @__PURE__ */ jsx("div", { style: { opacity: 0.7 }, children: "parquet file has no row groups" });
  }
  const rgIndex = Math.min(Math.max(page, 0), rowGroups.length - 1);
  const rg = rowGroups[rgIndex];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("p", { style: { opacity: 0.7, fontSize: "0.95em" }, children: [
      /* @__PURE__ */ jsx("b", { children: totalRows.toLocaleString() }),
      " rows \xB7 ",
      /* @__PURE__ */ jsx("b", { children: schema.length }),
      " columns \xB7 ",
      /* @__PURE__ */ jsx("b", { children: rowGroups.length }),
      " row group",
      rowGroups.length === 1 ? "" : "s",
      " \xB7 ",
      fmtSize(byteSize)
    ] }),
    /* @__PURE__ */ jsxs("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ jsx("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: "schema" }),
      /* @__PURE__ */ jsx("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: /* @__PURE__ */ jsx("tbody", { children: schema.map((c) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: c.name }),
        /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0", opacity: 0.7 }, children: c.type ?? "?" })
      ] }, c.name)) }) })
    ] }),
    rowGroups.length > 1 && /* @__PURE__ */ jsxs("details", { style: { marginBottom: "0.5em" }, children: [
      /* @__PURE__ */ jsxs("summary", { style: { cursor: "pointer", fontSize: "0.9em", opacity: 0.8 }, children: [
        "row groups (",
        rowGroups.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxs("table", { style: { borderCollapse: "collapse", marginTop: "0.3em", fontSize: "0.85em" }, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
          /* @__PURE__ */ jsx("th", { style: { padding: "0.1em 0.6em 0.1em 0", fontWeight: 400 }, children: "#" }),
          /* @__PURE__ */ jsx("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "rows" }),
          /* @__PURE__ */ jsx("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "compressed" }),
          /* @__PURE__ */ jsx("th", { style: { padding: "0.1em 0.6em", fontWeight: 400, textAlign: "right" }, children: "uncompressed" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: rowGroups.map((g) => /* @__PURE__ */ jsxs("tr", { style: { background: g.index === rgIndex ? "rgba(127,127,127,0.12)" : void 0, cursor: "pointer" }, onClick: () => setPage(g.index), children: [
          /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0.6em 0.1em 0", fontFamily: "ui-monospace, monospace" }, children: g.index }),
          /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: g.numRows.toLocaleString() }),
          /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.8 }, children: g.compressedBytes != null ? fmtSize(g.compressedBytes) : "\u2014" }),
          /* @__PURE__ */ jsx("td", { style: { padding: "0.1em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6 }, children: fmtSize(g.uncompressedBytes) })
        ] }, g.index)) })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Pager, { rg, rgCount: rowGroups.length, setPage, totalRows }),
    /* @__PURE__ */ jsx("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ jsxs("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { style: { position: "sticky", top: 0, background: "rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ jsx("th", { style: { padding: "0.3em 0.6em", textAlign: "left", borderBottom: "1px solid rgba(127,127,127,0.4)", fontWeight: 500 }, children: c.name }, c.name)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows === null ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsxs("td", { colSpan: schema.length, style: { padding: "0.5em", opacity: 0.6 }, children: [
        "loading row group ",
        rgIndex,
        "\u2026"
      ] }) }) : rows.map((r, i) => /* @__PURE__ */ jsx("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: schema.map((c) => /* @__PURE__ */ jsx("td", { style: { padding: "0.2em 0.6em", whiteSpace: "nowrap", maxWidth: "30em", overflow: "hidden", textOverflow: "ellipsis" }, children: fmtCell(r[c.name]) }, c.name)) }, i)) })
    ] }) })
  ] });
}
function Pager({ rg, rgCount, setPage, totalRows }) {
  if (rgCount <= 1) return null;
  const sizeLabel = rg.compressedBytes != null ? fmtSize(rg.compressedBytes) : fmtSize(rg.uncompressedBytes);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ jsx("button", { disabled: rg.index === 0, onClick: () => setPage(0), children: "\xAB" }),
    /* @__PURE__ */ jsx("button", { disabled: rg.index === 0, onClick: () => setPage(rg.index - 1), children: "\u2039" }),
    /* @__PURE__ */ jsxs("span", { style: { opacity: 0.8 }, children: [
      "row group ",
      /* @__PURE__ */ jsx("b", { children: rg.index + 1 }),
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
    /* @__PURE__ */ jsx("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rg.index + 1), children: "\u203A" }),
    /* @__PURE__ */ jsx("button", { disabled: rg.index === rgCount - 1, onClick: () => setPage(rgCount - 1), children: "\xBB" })
  ] });
}
function fmtCell(v) {
  if (v === null || v === void 0) return /* @__PURE__ */ jsx("span", { style: { opacity: 0.3 }, children: "\xB7" });
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
export {
  ParquetViewer
};
//# sourceMappingURL=parquet.js.map