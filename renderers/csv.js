// src/renderers/csv.tsx
import { useMemo as useMemo3, useState as useState4 } from "react";

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/csvData.ts
import { useEffect, useState } from "react";
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
  const [header, setHeader] = useState(null);
  const [total, setTotal] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
import { useCallback, useMemo, useState as useState3 } from "react";

// src/react/persistedState.ts
import { useState as useState2 } from "react";
var defaultUseState = (_key, defaultValue) => useState2(defaultValue);

// src/renderers/tableControls.tsx
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

// src/renderers/tableSort.ts
import { useCallback as useCallback2, useMemo as useMemo2 } from "react";
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = useCallback2((name) => {
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
  return useMemo2(() => {
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
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function makeCsvViewer(opts = {}) {
  return function BoundCsvViewer(props) {
    return /* @__PURE__ */ jsx2(CsvViewer, { ...props, ...opts });
  };
}
function CsvViewer({ store, path, delimiter, usePersistedState, renderCell, renderHeader, cellProps, headerProps, columnPicker = false, hiddenColumns, fullLoadMaxBytes = DEFAULT_FULL_LOAD_MAX_BYTES, sortComparators }) {
  const { header, total, error: headerError } = useCsvHeader(store, path, delimiter);
  const [page, setPage] = useState4(0);
  const smallTable = total !== null && total <= fullLoadMaxBytes;
  const { rows: pageRows, error: pageError } = useCsvPage(store, path, delimiter, page, smallTable ? null : total);
  const { rows: allRaw, error: allError } = useAllCsvRows(store, path, delimiter, smallTable);
  const sort = useSort(usePersistedState);
  const error = headerError ?? (smallTable ? allError : pageError);
  const allColumns = useMemo3(() => (header ?? []).map((name) => ({ name })), [header]);
  const { visible, ...vis } = useColumnVisibility(allColumns, usePersistedState, hiddenColumns);
  const columns = useMemo3(() => allColumns.filter((c) => visible.includes(c.name)), [allColumns, visible]);
  const colIndex = useMemo3(
    () => new Map(allColumns.map((c, i) => [c.name, i])),
    [allColumns]
  );
  const keyed = useMemo3(
    () => allRaw?.map((r) => Object.fromEntries(allColumns.map((c, i) => [c.name, r[i] ?? ""]))) ?? null,
    [allRaw, allColumns]
  );
  const sortedKeyed = useSortedRows(keyed, sort, sortComparators, allColumns);
  const allSorted = useMemo3(
    () => sortedKeyed?.map((o) => allColumns.map((c) => String(o[c.name] ?? ""))) ?? null,
    [sortedKeyed, allColumns]
  );
  const colStyles = useMemo3(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, () => false),
    [columns, path, cellProps, headerProps]
  );
  if (error) return /* @__PURE__ */ jsxs2("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (total === null || header === null) return /* @__PURE__ */ jsx2("div", { style: { opacity: 0.6 }, children: "reading CSV header\u2026" });
  const rows = smallTable ? allSorted : pageRows;
  const pages = smallTable ? 1 : Math.max(1, Math.ceil(total / PAGE_BYTES));
  const offsetStart = page * PAGE_BYTES;
  const offsetEnd = Math.min(total, offsetStart + PAGE_BYTES);
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsxs2("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em", position: "relative", zIndex: 2 }, children: [
      /* @__PURE__ */ jsx2("b", { children: allColumns.length }),
      " columns",
      smallTable && rows ? /* @__PURE__ */ jsxs2(Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsx2("b", { children: rows.length.toLocaleString() }),
        " rows"
      ] }) : null,
      " ",
      "\xB7 ",
      fmtSize(total),
      columnPicker && /* @__PURE__ */ jsxs2(Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsx2(ColumnPicker, { columns: allColumns, vis: { visible, ...vis } })
      ] })
    ] }),
    !smallTable && /* @__PURE__ */ jsxs2("p", { style: { opacity: 0.6, fontSize: "0.85em", margin: "0 0 0.4em" }, children: [
      fmtSize(total),
      " \u2014 streaming byte ranges; sorting needs the whole file."
    ] }),
    pages > 1 && /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0.4em 0", fontSize: "0.9em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx2("button", { disabled: page === 0, onClick: () => setPage(0), children: "\xAB" }),
      /* @__PURE__ */ jsx2("button", { disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039" }),
      /* @__PURE__ */ jsxs2("span", { style: { opacity: 0.8 }, children: [
        "page ",
        /* @__PURE__ */ jsx2("b", { children: page + 1 }),
        " / ",
        pages.toLocaleString(),
        " \xB7 bytes ",
        offsetStart.toLocaleString(),
        "\u2013",
        offsetEnd.toLocaleString(),
        " / ",
        total.toLocaleString()
      ] }),
      /* @__PURE__ */ jsx2("button", { disabled: page === pages - 1, onClick: () => setPage(page + 1), children: "\u203A" }),
      /* @__PURE__ */ jsx2("button", { disabled: page === pages - 1, onClick: () => setPage(pages - 1), children: "\xBB" })
    ] }),
    /* @__PURE__ */ jsx2("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(127,127,127,0.3)", borderRadius: 4 }, children: /* @__PURE__ */ jsxs2("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsx2("tr", { style: { position: "sticky", top: 0, zIndex: 1, background: "Canvas" }, children: columns.map((c) => {
        const st = colStyles.get(c.name);
        const defaultNode = smallTable ? /* @__PURE__ */ jsxs2(
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
              /* @__PURE__ */ jsx2("span", { style: { opacity: sort.column === c.name ? 0.8 : 0.3, marginLeft: "0.3em", fontSize: "0.85em" }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : c.name;
        return /* @__PURE__ */ jsx2("th", { style: { ...st?.header ?? TH_STYLE, whiteSpace: "nowrap" }, className: st?.headerClass, children: renderHeader ? renderHeader({ column: c, path, defaultNode }) : defaultNode }, c.name);
      }) }) }),
      /* @__PURE__ */ jsx2("tbody", { children: rows === null ? /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsx2("td", { colSpan: columns.length, style: { padding: "0.5em", opacity: 0.6 }, children: "loading\u2026" }) }) : rows.map((r, i) => {
        let asRow = null;
        const row = () => asRow ??= Object.fromEntries(allColumns.map((c, j) => [c.name, r[j] ?? ""]));
        return /* @__PURE__ */ jsx2("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.15)" }, children: columns.map((c) => {
          const st = colStyles.get(c.name);
          const j = colIndex.get(c.name);
          const value = r[j] ?? "";
          return /* @__PURE__ */ jsx2("td", { style: st?.cell ?? TD_STYLE, className: st?.cellClass, children: renderCell ? renderCell({ value, column: c, row: row(), rowIndex: i, path, defaultNode: value }) : value }, c.name);
        }) }, i);
      }) })
    ] }) })
  ] });
}
var csv_default = CsvViewer;
export {
  CsvViewer,
  HEADER_PROBE_BYTES,
  PAGE_BYTES,
  csv_default as default,
  makeCsvViewer,
  parseLine,
  useCsvHeader,
  useCsvPage
};
//# sourceMappingURL=csv.js.map