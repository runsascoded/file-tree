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

// src/renderers/csv.tsx
var csv_exports = {};
__export(csv_exports, {
  CsvViewer: () => CsvViewer,
  default: () => csv_default,
  makeCsvViewer: () => makeCsvViewer
});
module.exports = __toCommonJS(csv_exports);
var import_react = require("react");

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
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

// src/renderers/csv.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var PAGE_BYTES = 256 * 1024;
var HEADER_PROBE_BYTES = 32 * 1024;
function makeCsvViewer(opts = {}) {
  return function BoundCsvViewer(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CsvViewer, { ...props, ...opts });
  };
}
function CsvViewer({ store, path, delimiter, renderCell, renderHeader, cellProps, headerProps }) {
  const [total, setTotal] = (0, import_react.useState)(null);
  const [header, setHeader] = (0, import_react.useState)(null);
  const [page, setPage] = (0, import_react.useState)(0);
  const [rows, setRows] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
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
  (0, import_react.useEffect)(() => {
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
  const columns = (0, import_react.useMemo)(() => (header ?? []).map((name) => ({ name })), [header]);
  const colStyles = (0, import_react.useMemo)(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, () => false),
    [columns, path, cellProps, headerProps]
  );
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (total === null || header === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6 }, children: "reading CSV header\u2026" });
  const pages = Math.max(1, Math.ceil(total / PAGE_BYTES));
  const offsetStart = page * PAGE_BYTES;
  const offsetEnd = Math.min(total, offsetStart + PAGE_BYTES);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: header.length }),
      " columns \xB7 ",
      fmtSize(total)
    ] }),
    pages > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === 0, onClick: () => setPage(0), children: "\xAB" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.8 }, children: [
        "page ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: page + 1 }),
        " / ",
        pages.toLocaleString(),
        " \xB7 bytes ",
        offsetStart.toLocaleString(),
        "\u2013",
        offsetEnd.toLocaleString(),
        " / ",
        total.toLocaleString()
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === pages - 1, onClick: () => setPage(page + 1), children: "\u203A" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: page === pages - 1, onClick: () => setPage(pages - 1), children: "\xBB" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { position: "sticky", top: 0, zIndex: 1, background: "Canvas" }, children: columns.map((c) => {
        const st = colStyles.get(c.name);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { ...st?.header ?? TH_STYLE, whiteSpace: "nowrap" }, className: st?.headerClass, children: renderHeader ? renderHeader({ column: c, path, defaultNode: c.name }) : c.name }, c.name);
      }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: header.length, style: { padding: "0.5em", opacity: 0.6 }, children: "loading\u2026" }) }) : rows.map((r, i) => {
        let asRow = null;
        const row = () => asRow ??= Object.fromEntries(columns.map((c, j) => [c.name, r[j] ?? ""]));
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: columns.map((c, j) => {
          const st = colStyles.get(c.name);
          const value = r[j] ?? "";
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: st?.cell ?? TD_STYLE, className: st?.cellClass, children: renderCell ? renderCell({ value, column: c, row: row(), rowIndex: i, path, defaultNode: value }) : value }, c.name);
        }) }, i);
      }) })
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
var csv_default = CsvViewer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CsvViewer,
  makeCsvViewer
});
//# sourceMappingURL=csv.cjs.map