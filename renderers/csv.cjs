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
  HEADER_PROBE_BYTES: () => HEADER_PROBE_BYTES,
  PAGE_BYTES: () => PAGE_BYTES,
  default: () => csv_default,
  makeCsvViewer: () => makeCsvViewer,
  parseLine: () => parseLine,
  useCsvHeader: () => useCsvHeader,
  useCsvPage: () => useCsvPage
});
module.exports = __toCommonJS(csv_exports);
var import_react5 = require("react");

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/csvData.ts
var import_react = require("react");
var PAGE_BYTES = 256 * 1024;
var HEADER_PROBE_BYTES = 32 * 1024;
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
function useCsvHeader(store, path, delimiter) {
  const [header, setHeader] = (0, import_react.useState)(null);
  const [total, setTotal] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    setHeader(null);
    setTotal(null);
    setError(null);
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
  return { header, total, error };
}
function useCsvPage(store, path, delimiter, page, total) {
  const [rows, setRows] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (total === null) return;
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
  }, [store, path, delimiter, page, total]);
  return { rows, error };
}
function useAllCsvRows(store, path, delimiter, enabled) {
  const [rows, setRows] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (!enabled) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    setError(null);
    store.get(path).then((r) => {
      if (cancelled) return;
      const lines = new TextDecoder().decode(r.bytes).split("\n");
      lines.shift();
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      setRows(lines.map((line) => parseLine(line.replace(/\r$/, ""), delimiter)));
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, delimiter, enabled]);
  return { rows, error };
}

// src/renderers/tableControls.tsx
var import_react3 = require("react");

// src/react/persistedState.ts
var import_react2 = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react2.useState)(defaultValue);

// src/renderers/tableControls.tsx
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

// src/renderers/tableSort.ts
var import_react4 = require("react");
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = (0, import_react4.useCallback)((name) => {
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
  return (0, import_react4.useMemo)(() => {
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
var import_jsx_runtime2 = require("react/jsx-runtime");
function makeCsvViewer(opts = {}) {
  return function BoundCsvViewer(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CsvViewer, { ...props, ...opts });
  };
}
function CsvViewer({ store, path, delimiter, usePersistedState, renderCell, renderHeader, cellProps, headerProps, columnPicker = false, hiddenColumns, fullLoadMaxBytes = DEFAULT_FULL_LOAD_MAX_BYTES, sortComparators, onPage, onCellHover }) {
  const { header, total, error: headerError } = useCsvHeader(store, path, delimiter);
  const [page, setPage] = (0, import_react5.useState)(0);
  const smallTable = total !== null && total <= fullLoadMaxBytes;
  const { rows: pageRows, error: pageError } = useCsvPage(store, path, delimiter, page, smallTable ? null : total);
  const { rows: allRaw, error: allError } = useAllCsvRows(store, path, delimiter, smallTable);
  const sort = useSort(usePersistedState);
  const [filter, setFilter] = useFilter(usePersistedState);
  const error = headerError ?? (smallTable ? allError : pageError);
  const allColumns = (0, import_react5.useMemo)(() => (header ?? []).map((name) => ({ name })), [header]);
  const { visible, ...vis } = useColumnVisibility(allColumns, usePersistedState, hiddenColumns);
  const columns = (0, import_react5.useMemo)(() => allColumns.filter((c) => visible.includes(c.name)), [allColumns, visible]);
  const colIndex = (0, import_react5.useMemo)(
    () => new Map(allColumns.map((c, i) => [c.name, i])),
    [allColumns]
  );
  const keyed = (0, import_react5.useMemo)(
    () => allRaw?.map((r) => Object.fromEntries(allColumns.map((c, i) => [c.name, r[i] ?? ""]))) ?? null,
    [allRaw, allColumns]
  );
  const sortedKeyed = useSortedRows(keyed, sort, sortComparators, allColumns);
  const filteredKeyed = (0, import_react5.useMemo)(
    () => filterRows(sortedKeyed, filter, visible),
    [sortedKeyed, filter, visible]
  );
  const allSorted = (0, import_react5.useMemo)(
    () => filteredKeyed?.map((o) => allColumns.map((c) => String(o[c.name] ?? ""))) ?? null,
    [filteredKeyed, allColumns]
  );
  const colStyles = (0, import_react5.useMemo)(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, () => false),
    [columns, path, cellProps, headerProps]
  );
  const pageCtxRef = (0, import_react5.useRef)({ rows: [], columns: [], path, pageStart: 0, totalRows: null });
  usePageNotify(onPage, pageCtxRef, [pageRows, allSorted, columns.length, path, smallTable]);
  const notifyHover = useStableCallback(onCellHover);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (total === null || header === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { opacity: 0.6 }, children: "reading CSV header\u2026" });
  const rows = smallTable ? allSorted : pageRows;
  const pages = smallTable ? 1 : Math.max(1, Math.ceil(total / PAGE_BYTES));
  pageCtxRef.current = {
    rows: (rows ?? []).map((r) => Object.fromEntries(allColumns.map((c, i) => [c.name, r[i] ?? ""]))),
    columns,
    path,
    pageStart: 0,
    totalRows: smallTable ? rows?.length ?? null : null
  };
  const offsetStart = page * PAGE_BYTES;
  const offsetEnd = Math.min(total, offsetStart + PAGE_BYTES);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em", position: "relative", zIndex: 2 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: allColumns.length }),
      " columns",
      smallTable && rows ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: rows.length.toLocaleString() }),
        " rows"
      ] }) : null,
      " ",
      "\xB7 ",
      fmtSize(total),
      columnPicker && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ColumnPicker, { columns: allColumns, vis: { visible, ...vis } })
      ] })
    ] }),
    smallTable && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { opacity: 0.8, fontSize: "0.9em", margin: "0 0 0.5em" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      FilterInput,
      {
        value: filter,
        onChange: setFilter,
        placeholder: "filter rows",
        ...sortedKeyed ? { count: { shown: rows?.length ?? 0, total: sortedKeyed.length } } : {}
      }
    ) }),
    !smallTable && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { opacity: 0.6, fontSize: "0.85em", margin: "0 0 0.4em" }, children: [
      fmtSize(total),
      " \u2014 streaming byte ranges; sorting needs the whole file."
    ] }),
    pages > 1 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { disabled: page === 0, onClick: () => setPage(0), children: "\xAB" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { opacity: 0.8 }, children: [
        "page ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: page + 1 }),
        " / ",
        pages.toLocaleString(),
        " \xB7 bytes ",
        offsetStart.toLocaleString(),
        "\u2013",
        offsetEnd.toLocaleString(),
        " / ",
        total.toLocaleString()
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { disabled: page === pages - 1, onClick: () => setPage(page + 1), children: "\u203A" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { disabled: page === pages - 1, onClick: () => setPage(pages - 1), children: "\xBB" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tr", { style: { position: "sticky", top: 0, zIndex: 1, background: "Canvas" }, children: columns.map((c) => {
        const st = colStyles.get(c.name);
        const defaultNode = smallTable ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "span",
          {
            role: "button",
            tabIndex: 0,
            onClick: () => sort.toggle(c.name),
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                sort.toggle(c.name);
              }
            },
            title: `Sort by ${c.name}`,
            style: { cursor: "pointer", userSelect: "none" },
            children: [
              c.name,
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { opacity: sort.column === c.name ? 0.8 : 0.3, marginLeft: "0.3em", fontSize: "0.85em" }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : c.name;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: { ...st?.header ?? TH_STYLE, whiteSpace: "nowrap" }, className: st?.headerClass, children: renderHeader ? renderHeader({ column: c, path, defaultNode }) : defaultNode }, c.name);
      }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: rows === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { colSpan: columns.length, style: { padding: "0.5em", opacity: 0.6 }, children: "loading\u2026" }) }) : rows.map((r, i) => {
        let asRow = null;
        const row = () => asRow ??= Object.fromEntries(allColumns.map((c, j) => [c.name, r[j] ?? ""]));
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: columns.map((c) => {
          const st = colStyles.get(c.name);
          const j = colIndex.get(c.name);
          const value = r[j] ?? "";
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "td",
            {
              style: st?.cell ?? TD_STYLE,
              className: st?.cellClass,
              ...onCellHover ? {
                onMouseEnter: () => notifyHover({ value, column: c, row: row(), rowIndex: i, path, defaultNode: value }),
                onMouseLeave: () => notifyHover(null)
              } : {},
              children: renderCell ? renderCell({ value, column: c, row: row(), rowIndex: i, path, defaultNode: value }) : value
            },
            c.name
          );
        }) }, i);
      }) })
    ] }) })
  ] });
}
var csv_default = CsvViewer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CsvViewer,
  HEADER_PROBE_BYTES,
  PAGE_BYTES,
  makeCsvViewer,
  parseLine,
  useCsvHeader,
  useCsvPage
});
//# sourceMappingURL=csv.cjs.map