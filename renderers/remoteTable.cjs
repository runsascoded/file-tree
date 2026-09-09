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

// src/renderers/remoteTable.tsx
var remoteTable_exports = {};
__export(remoteTable_exports, {
  RemoteTableViewer: () => RemoteTableViewer,
  default: () => remoteTable_default
});
module.exports = __toCommonJS(remoteTable_exports);
var import_react6 = require("react");

// src/renderers/httpTableSource.ts
var ALL = {
  sort: true,
  filter: true,
  total: true,
  randomAccess: true
};
async function getJson(doFetch, url) {
  const res = await doFetch(url);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
    }
    throw new Error(detail);
  }
  return await res.json();
}
function httpTableCatalog(opts) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const capabilities = opts.capabilities ?? ALL;
  let objectsPromise = null;
  const identity = () => {
    const params = new URLSearchParams({ path: opts.path });
    if (opts.version) params.set("version", opts.version);
    return params;
  };
  return {
    objects() {
      objectsPromise ??= getJson(
        doFetch,
        `${base}/objects?${identity()}`
      ).then((r) => r.objects);
      return objectsPromise;
    },
    source(table) {
      let columnsPromise = null;
      const page = async (req) => {
        const params = identity();
        params.set("table", table);
        params.set("offset", String(req.offset));
        params.set("limit", String(req.limit));
        if (req.filter?.trim()) params.set("filter", req.filter);
        if (req.sort) {
          params.set("sort", req.sort.column);
          params.set("dir", req.sort.dir);
        }
        return getJson(doFetch, `${base}/page?${params}`);
      };
      return {
        page,
        columns() {
          columnsPromise ??= page({ offset: 0, limit: 0 }).then((r) => r.columns);
          return columnsPromise;
        },
        capabilities
      };
    }
  };
}

// src/renderers/tableBrowser.tsx
var import_react5 = require("react");

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

// src/renderers/table.ts
var ELIDE_DEFAULTS = {
  maxWidth: "30em",
  tooltip: "native",
  content: cellTitle
};
function resolveElide(elide) {
  if (elide === false) return { ...ELIDE_DEFAULTS, maxWidth: false, tooltip: false };
  if (elide === true || elide === void 0) return ELIDE_DEFAULTS;
  return { ...ELIDE_DEFAULTS, ...elide };
}
function elideCellStyle(el) {
  return { maxWidth: el.maxWidth === false ? "none" : el.maxWidth };
}
function applyElide(el, args) {
  const { value, node, hasCustomRender, column, row, path } = args;
  if (el.tooltip === false) return { node };
  const text = el.content(value);
  if (typeof el.tooltip === "function") {
    return { node: el.tooltip({ value, text, node, column, row, path }) };
  }
  if (hasCustomRender || !text) return { node };
  return { title: text, node };
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
  fontWeight: 500,
  borderBottom: "1px solid rgba(127,127,127,0.4)"
};
var NUMERIC_ALIGN = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
function resolveColStyles(columns, path, opts, isNumeric, el = ELIDE_DEFAULTS) {
  const out = /* @__PURE__ */ new Map();
  const es = elideCellStyle(el);
  for (const c of columns) {
    const align = isNumeric(c) ? NUMERIC_ALIGN : {};
    const cp = opts.cellProps?.(c, path) || {};
    const hp = opts.headerProps?.(c, path) || {};
    out.set(c.name, {
      // `es` overrides `TD_STYLE`'s default cap; `cp.style` still wins last,
      // so a consumer's per-column width beats the elide default.
      cell: { ...TD_STYLE, ...align, ...es, ...cp.style },
      header: { ...TH_STYLE, ...align, ...hp.style },
      ...cp.className ? { cellClass: cp.className } : {},
      ...hp.className ? { headerClass: hp.className } : {}
    });
  }
  return out;
}

// src/renderers/columnResize.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
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
function useColumnWidths(usePersistedState, key = "cw") {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use(key, "");
  const persisted = (0, import_react2.useMemo)(() => parseWidths(raw), [raw]);
  const persistedRef = (0, import_react2.useRef)(persisted);
  persistedRef.current = persisted;
  const [drag, setDrag] = (0, import_react2.useState)(null);
  const commit = (0, import_react2.useCallback)((col, w) => {
    const m = new Map(persistedRef.current);
    m.set(col, Math.max(MIN_WIDTH, w));
    setRaw(serializeWidths(m));
  }, [setRaw]);
  const startResize = (0, import_react2.useCallback)((col, e) => {
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
  }, [commit]);
  const autoFit = (0, import_react2.useCallback)((col, e) => {
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
  }, [commit]);
  const styleFor = (0, import_react2.useCallback)((col) => {
    const w = drag && drag.col === col ? drag.w : persisted.get(col);
    return w == null ? NO_STYLE : { width: w, minWidth: w, maxWidth: w };
  }, [drag, persisted]);
  return (0, import_react2.useMemo)(() => ({ styleFor, startResize, autoFit }), [styleFor, startResize, autoFit]);
}
function ColumnResizeHandle({ col, widths }) {
  const [hot, setHot] = (0, import_react2.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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

// src/renderers/tableControls.tsx
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { position: "relative", display: "inline-block" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
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
      open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
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
            columns.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { display: "block", cursor: "pointer", fontSize: "0.9em" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
            hidden.size > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: showAll, style: { ...BTN, marginTop: "0.4em" }, children: "show all" })
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
function FilterInput({ value, onChange, count, placeholder = "filter" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.4em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
    value.trim() !== "" && count && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { opacity: 0.7 }, children: [
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
function sortGlyph(column, sort) {
  if (sort.column !== column) return "\u2195";
  return sort.dir === "asc" ? "\u25B2" : "\u25BC";
}

// src/renderers/tableBrowser.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var DEFAULT_PAGE_SIZE = 100;
var BTN2 = {
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
var NUMERIC_KINDS = /* @__PURE__ */ new Set(["number"]);
var plural = (n, noun) => `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
function defaultTableCell(value) {
  if (value === null || value === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { opacity: 0.4 }, children: "null" });
  }
  if (value instanceof Uint8Array) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { opacity: 0.6 }, children: `<${value.byteLength} bytes>` });
  }
  return String(value);
}
function TableBrowser({
  catalog,
  objects,
  path,
  usePersistedState,
  pageSize = DEFAULT_PAGE_SIZE,
  status,
  renderCell,
  renderHeader,
  cellProps,
  headerProps,
  columnPicker = false,
  hiddenColumns,
  onPage,
  onCellHover,
  elide,
  resizableColumns = false
}) {
  const use = usePersistedState ?? defaultUseState;
  const [table, setTable] = use("table", "");
  const [page, setPage] = use("page", 0);
  const [filter, setFilter] = useFilter(usePersistedState);
  const sort = useSort(usePersistedState);
  const [result, setResult] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)(null);
  const [loading, setLoading] = (0, import_react5.useState)(false);
  const active = (0, import_react5.useMemo)(
    () => objects.find((o) => o.name === table) ?? objects[0] ?? null,
    [objects, table]
  );
  const source = (0, import_react5.useMemo)(
    () => active ? catalog.source(active.name) : null,
    [catalog, active]
  );
  const can = source?.capabilities;
  const columns = result?.columns ?? [];
  const { visible, ...vis } = useColumnVisibility(columns, usePersistedState, hiddenColumns);
  (0, import_react5.useEffect)(() => {
    if (!source) return;
    let live = true;
    setLoading(true);
    source.page({
      offset: page * pageSize,
      limit: pageSize,
      ...can?.filter ? { filter } : {},
      ...can?.sort && sort.column ? { sort: { column: sort.column, dir: sort.dir } } : {}
    }).then((r) => {
      if (live) {
        setResult(r);
        setError(null);
      }
    }).catch((e) => {
      if (live) setError(e instanceof Error ? e : new Error(String(e)));
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [source, page, pageSize, filter, sort.column, sort.dir, can?.filter, can?.sort]);
  const queryKey = `${active?.name ?? ""}\0${filter}\0${sort.column ?? ""}${sort.dir}`;
  const lastQueryKey = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    if (lastQueryKey.current !== null && lastQueryKey.current !== queryKey) setPage(0);
    lastQueryKey.current = queryKey;
  }, [queryKey, setPage]);
  const rows = result?.rows ?? [];
  const total = result?.total ?? null;
  const pageStart = result?.offset ?? 0;
  const unfilteredTotals = (0, import_react5.useRef)(/* @__PURE__ */ new Map());
  if (active && !filter.trim() && total !== null) unfilteredTotals.current.set(active.name, total);
  const unfilteredTotal = active ? unfilteredTotals.current.get(active.name) : void 0;
  const el = (0, import_react5.useMemo)(() => resolveElide(elide), [elide]);
  const cw = useColumnWidths(usePersistedState);
  const colStyles = (0, import_react5.useMemo)(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, (c) => NUMERIC_KINDS.has(c.kind), el),
    [columns, path, cellProps, headerProps, el]
  );
  const pageCtxRef = (0, import_react5.useRef)({ rows: [], columns: [], path, pageStart: 0, totalRows: null });
  pageCtxRef.current = {
    rows,
    columns: columns.filter((c) => visible.includes(c.name)),
    path,
    pageStart,
    totalRows: total
  };
  usePageNotify(onPage, pageCtxRef, [rows, visible, path, pageStart, total]);
  const notifyHover = useStableCallback(onCellHover);
  const hoverHandlers = (0, import_react5.useCallback)((ctx) => onCellHover ? { onMouseEnter: () => notifyHover(ctx), onMouseLeave: () => notifyHover(null) } : {}, [onCellHover, notifyHover]);
  if (!objects.length) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { opacity: 0.6 }, children: "no tables or views in this file" });
  const lastPage = total === null ? null : Math.max(0, Math.ceil(total / pageSize) - 1);
  const shown = columns.filter((c) => visible.includes(c.name));
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: {
      opacity: 0.85,
      fontSize: "0.95em",
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      flexWrap: "wrap",
      position: "relative",
      zIndex: 2
    }, children: [
      objects.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "select",
        {
          value: active?.name ?? "",
          onChange: (e) => setTable(e.target.value),
          "aria-label": "Table",
          style: { ...BTN2, cursor: "pointer" },
          children: objects.map((o) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: o.name, children: [
            o.name,
            o.type === "view" ? " (view)" : ""
          ] }, o.name))
        }
      ),
      result && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { opacity: 0.7 }, children: [
        plural(total ?? rows.length, "row"),
        total !== null && total > 0 && ` \xB7 ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}`
      ] }),
      can?.filter && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        FilterInput,
        {
          value: filter,
          onChange: setFilter,
          placeholder: "filter",
          ...total !== null && unfilteredTotal !== void 0 ? { count: { shown: total, total: unfilteredTotal } } : {}
        }
      ),
      columnPicker && columns.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ColumnPicker, { columns, vis: { visible, ...vis } }),
      loading && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { opacity: 0.5 }, children: "\u2026" }),
      status
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { color: "crimson", fontSize: "0.9em" }, children: error.message }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { style: {
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas"
      }, children: shown.map((c) => {
        const styles = colStyles.get(c.name);
        const label = can?.sort ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "span",
          {
            onClick: () => sort.toggle(c.name),
            style: { cursor: "pointer", userSelect: "none" },
            title: `Sort by ${c.name}`,
            children: [
              c.name,
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { opacity: sort.column === c.name ? 0.9 : 0.3 }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: c.name });
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "th",
          {
            style: { ...styles?.header ?? TH_STYLE, ...resizableColumns ? { position: "relative" } : {}, ...cw.styleFor(c.name) },
            ...styles?.headerClass ? { className: styles.headerClass } : {},
            children: [
              renderHeader ? renderHeader({ column: c, path, defaultNode: label }) : label,
              resizableColumns && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ColumnResizeHandle, { col: c.name, widths: cw })
            ]
          },
          c.name
        );
      }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tbody", { children: [
        rows.map((row, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { children: shown.map((c) => {
          const styles = colStyles.get(c.name);
          const ctx = {
            value: row[c.name],
            column: c,
            row,
            rowIndex: pageStart + i,
            path,
            defaultNode: defaultTableCell(row[c.name])
          };
          const rendered = renderCell ? renderCell(ctx) : ctx.defaultNode;
          const { title, node } = applyElide(el, { value: ctx.value, node: rendered, hasCustomRender: !!renderCell, column: c, row, path });
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "td",
            {
              style: { ...styles?.cell ?? TD_STYLE, ...cw.styleFor(c.name) },
              ...styles?.cellClass ? { className: styles.cellClass } : {},
              ...title != null ? { title } : {},
              ...hoverHandlers(ctx),
              children: node
            },
            c.name
          );
        }) }, pageStart + i)),
        rows.length === 0 && !loading && !error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { colSpan: Math.max(1, shown.length), style: { ...TD_STYLE, opacity: 0.6 }, children: filter.trim() ? "no rows match" : "no rows" }) })
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginTop: "0.6em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: BTN2, disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039 prev" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { opacity: 0.7, fontSize: "0.85em" }, children: can?.randomAccess === false ? `rows ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}` : `page ${(page + 1).toLocaleString()}${lastPage !== null ? ` / ${(lastPage + 1).toLocaleString()}` : ""}` }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          style: BTN2,
          disabled: lastPage !== null ? page >= lastPage : rows.length < pageSize,
          onClick: () => setPage(page + 1),
          children: "next \u203A"
        }
      )
    ] })
  ] });
}

// src/renderers/remoteTable.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function RemoteTableViewer({
  path,
  usePersistedState,
  baseUrl,
  version,
  fetch: doFetch,
  capabilities,
  ...browser
}) {
  const [objects, setObjects] = (0, import_react6.useState)(null);
  const [error, setError] = (0, import_react6.useState)(null);
  const catalog = (0, import_react6.useMemo)(
    () => httpTableCatalog({
      baseUrl,
      path,
      ...version ? { version } : {},
      ...doFetch ? { fetch: doFetch } : {},
      ...capabilities ? { capabilities } : {}
    }),
    // `capabilities` is a literal a consumer may recreate each render;
    // rebuilding the catalog on its identity would discard every
    // memoised source and refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl, path, version, doFetch]
  );
  (0, import_react6.useEffect)(() => {
    let live = true;
    setObjects(null);
    setError(null);
    catalog.objects().then((o) => {
      if (live) setObjects(o);
    }).catch((e) => {
      if (live) setError(e instanceof Error ? e : new Error(String(e)));
    });
    return () => {
      live = false;
    };
  }, [catalog]);
  if (error) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { color: "crimson", fontSize: "0.9em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: "Tables:" }),
      " ",
      error.message
    ] });
  }
  if (!objects) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { opacity: 0.6 }, children: "loading tables\u2026" });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    TableBrowser,
    {
      ...browser,
      catalog,
      objects,
      path,
      ...usePersistedState ? { usePersistedState } : {}
    }
  );
}
var remoteTable_default = RemoteTableViewer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RemoteTableViewer
});
//# sourceMappingURL=remoteTable.cjs.map