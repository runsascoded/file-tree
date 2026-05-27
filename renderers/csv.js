// src/renderers/csv.tsx
import { useEffect, useState } from "react";

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/csv.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PAGE_BYTES = 256 * 1024;
var HEADER_PROBE_BYTES = 32 * 1024;
function CsvViewer({ store, path, delimiter }) {
  const [total, setTotal] = useState(null);
  const [header, setHeader] = useState(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setTotal(null);
    setHeader(null);
    setRows(null);
    setError(null);
    setPage(0);
    store.get(path, { offset: 0, length: HEADER_PROBE_BYTES }).then((r) => {
      if (cancelled) return;
      const text = new TextDecoder().decode(r.bytes);
      const nl = text.indexOf("\n");
      if (nl < 0) {
        setError(`no newline in first ${HEADER_PROBE_BYTES} bytes \u2014 not a CSV?`);
        return;
      }
      setHeader(parseLine(text.slice(0, nl).replace(/\r$/, ""), delimiter));
      const ts = r.totalSize;
      if (ts == null) {
        setError("CSV viewer needs total file size; store did not report it");
        return;
      }
      setTotal(ts);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, delimiter]);
  useEffect(() => {
    if (total === null || header === null) return;
    let cancelled = false;
    setRows(null);
    const offset = page * PAGE_BYTES;
    const length = Math.min(PAGE_BYTES, total - offset);
    if (length <= 0) {
      setRows([]);
      return;
    }
    store.get(path, { offset, length }).then((r) => {
      if (cancelled) return;
      const text = new TextDecoder().decode(r.bytes);
      let lines = text.split("\n");
      lines = lines.slice(1);
      const atEof = offset + length >= total;
      if (!atEof && lines.length > 0) lines = lines.slice(0, -1);
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      setRows(lines.map((line) => parseLine(line.replace(/\r$/, ""), delimiter)));
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, delimiter, page, total, header]);
  if (error) return /* @__PURE__ */ jsxs("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (total === null || header === null) return /* @__PURE__ */ jsx("div", { style: { opacity: 0.6 }, children: "reading CSV header\u2026" });
  const pages = Math.max(1, Math.ceil(total / PAGE_BYTES));
  const offsetStart = page * PAGE_BYTES;
  const offsetEnd = Math.min(total, offsetStart + PAGE_BYTES);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em" }, children: [
      /* @__PURE__ */ jsx("b", { children: header.length }),
      " columns \xB7 ",
      fmtSize(total)
    ] }),
    pages > 1 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("button", { disabled: page === 0, onClick: () => setPage(0), children: "\xAB" }),
      /* @__PURE__ */ jsx("button", { disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039" }),
      /* @__PURE__ */ jsxs("span", { style: { opacity: 0.8 }, children: [
        "page ",
        /* @__PURE__ */ jsx("b", { children: page + 1 }),
        " / ",
        pages.toLocaleString(),
        " \xB7 bytes ",
        offsetStart.toLocaleString(),
        "\u2013",
        offsetEnd.toLocaleString(),
        " / ",
        total.toLocaleString()
      ] }),
      /* @__PURE__ */ jsx("button", { disabled: page === pages - 1, onClick: () => setPage(page + 1), children: "\u203A" }),
      /* @__PURE__ */ jsx("button", { disabled: page === pages - 1, onClick: () => setPage(pages - 1), children: "\xBB" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ jsxs("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { style: { position: "sticky", top: 0, background: "var(--bg, #181818)" }, children: header.map((c, i) => /* @__PURE__ */ jsx("th", { style: { padding: "0.3em 0.6em", textAlign: "left", borderBottom: "1px solid rgba(127,127,127,0.4)", fontWeight: 500, whiteSpace: "nowrap" }, children: c }, i)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows === null ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: header.length, style: { padding: "0.5em", opacity: 0.6 }, children: "loading\u2026" }) }) : rows.map((r, i) => /* @__PURE__ */ jsx("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: header.map((_, j) => /* @__PURE__ */ jsx("td", { style: { padding: "0.2em 0.6em", whiteSpace: "nowrap", maxWidth: "30em", overflow: "hidden", textOverflow: "ellipsis" }, children: r[j] ?? "" }, j)) }, i)) })
    ] }) })
  ] });
}
function parseLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
      } else {
        cur += c;
        i++;
      }
    } else {
      if (c === delimiter) {
        out.push(cur);
        cur = "";
        i++;
      } else if (c === '"' && cur === "") {
        inQuotes = true;
        i++;
      } else {
        cur += c;
        i++;
      }
    }
  }
  out.push(cur);
  return out;
}
export {
  CsvViewer
};
//# sourceMappingURL=csv.js.map