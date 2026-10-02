// src/renderers/rowsTable.tsx
import { useMemo as useMemo6 } from "react";

// src/renderers/tableBrowser.tsx
import {
  useEffect as useEffect3,
  useMemo as useMemo5,
  useRef as useRef4,
  useState as useState5
} from "react";

// src/react/persistedState.ts
import { useState } from "react";
var defaultUseState = (_key, defaultValue) => useState(defaultValue);

// src/renderers/table.ts
function tableCellCtx(ctx) {
  return Object.defineProperty(ctx, "prevRow", { get: () => ctx.at(-1), enumerable: true });
}
function chainCellRenderers(...renderers) {
  const rs = renderers.filter((r) => r !== void 0);
  if (rs.length <= 1) return rs[0];
  return (ctx) => rs.reduce((node, r) => {
    const next = Object.defineProperties({}, Object.getOwnPropertyDescriptors(ctx));
    next.defaultNode = node;
    return r(next);
  }, ctx.defaultNode);
}
var MIDDLE_TAIL = 12;
var ELLIPSIS_END = () => "end";
function normalizeEllipsis(e) {
  if (e === void 0) return ELLIPSIS_END;
  if (typeof e === "string") return () => e;
  if (typeof e === "function") return (c) => e(c) ?? "end";
  return (c) => e[c.name] ?? "end";
}
var ELIDE_DEFAULTS = {
  maxWidth: "30em",
  tooltip: "native",
  content: cellTitle,
  onlyWhenClipped: true,
  ellipsis: ELLIPSIS_END
};
function resolveElide(elide) {
  if (elide === false) return { ...ELIDE_DEFAULTS, maxWidth: false, tooltip: false };
  if (elide === true || elide === void 0) return ELIDE_DEFAULTS;
  const { ellipsis, ...rest } = elide;
  return { ...ELIDE_DEFAULTS, ...rest, ellipsis: normalizeEllipsis(ellipsis) };
}
function elideCellStyle(el) {
  return { maxWidth: el.maxWidth === false ? "none" : el.maxWidth };
}
function cellClipped(el) {
  return el.scrollWidth > el.clientWidth + 1;
}
function applyElide(el, args) {
  const { value, node, hasCustomRender, column, row, path, raw, ellipsis } = args;
  if (el.tooltip === false) return { node };
  const text = el.content(value);
  if (typeof el.tooltip === "function") {
    return { node: el.tooltip({ value, text, raw, node, column, row, path }) };
  }
  if (hasCustomRender) return { node };
  const shown = raw ?? text;
  if (!shown) return { node };
  if (raw != null || ellipsis === "middle") return { title: shown, node };
  if (!el.onlyWhenClipped) return { title: shown, node };
  return { onMouseEnter: (e) => {
    e.currentTarget.title = cellClipped(e.currentTarget) ? shown : "";
  }, node };
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
  fontWeight: 650,
  borderBottom: "2px solid rgba(127,127,127,0.55)",
  backgroundColor: "rgba(127,127,127,0.06)"
};
var NUMERIC_ALIGN = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
function resolveColStyles(columns, path, opts, isNumeric, el = ELIDE_DEFAULTS) {
  const out = /* @__PURE__ */ new Map();
  const es = elideCellStyle(el);
  for (const c of columns) {
    const align = isNumeric(c) ? NUMERIC_ALIGN : {};
    const cp = opts.cellProps?.(c, path) || {};
    const hp = opts.headerProps?.(c, path) || {};
    const ellipsis = el.ellipsis(c);
    const startDir = ellipsis === "start" ? { direction: "rtl", textAlign: "left" } : {};
    out.set(c.name, {
      // `es` overrides `TD_STYLE`'s default cap; `cp.style` still wins last,
      // so a consumer's per-column width beats the elide default.
      cell: { ...TD_STYLE, ...align, ...es, ...startDir, ...cp.style },
      header: { ...TH_STYLE, ...align, ...hp.style },
      ellipsis,
      ...cp.className ? { cellClass: cp.className } : {},
      ...hp.className ? { headerClass: hp.className } : {}
    });
  }
  return out;
}

// src/renderers/tableBody.tsx
import {
  useLayoutEffect,
  useMemo as useMemo3,
  useRef as useRef2,
  useState as useState3
} from "react";

// src/renderers/elideNode.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function splitMiddle(text, tail = MIDDLE_TAIL) {
  if (text === void 0 || text.length <= tail + 1) return null;
  return [text.slice(0, text.length - tail), text.slice(text.length - tail)];
}
function ellipsisWrap(mode, node, text, tail = MIDDLE_TAIL) {
  if (mode === "start") return /* @__PURE__ */ jsx("bdi", { children: node });
  if (mode === "middle") {
    const split = splitMiddle(text, tail);
    if (split) {
      const [head, end] = split;
      return /* @__PURE__ */ jsxs("span", { style: { display: "flex", minWidth: 0, maxWidth: "100%" }, children: [
        /* @__PURE__ */ jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }, children: head }),
        /* @__PURE__ */ jsx("span", { style: { whiteSpace: "nowrap", flexShrink: 0 }, children: end })
      ] });
    }
  }
  return node;
}

// src/renderers/tableSort.ts
import { useCallback, useMemo } from "react";
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = useCallback((name) => {
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
function sortGlyph(column, sort) {
  if (sort.column !== column) return "\u2195";
  return sort.dir === "asc" ? "\u25B2" : "\u25BC";
}

// src/renderers/tableRuns.ts
function normalizeDitto(ditto) {
  const out = /* @__PURE__ */ new Map();
  if (!ditto) return out;
  if (isList(ditto)) {
    for (const c of ditto) out.set(c, { mode: "mark", min: 2 });
    return out;
  }
  for (const [c, s] of Object.entries(ditto)) {
    const spec = typeof s === "string" ? { mode: s } : s;
    out.set(c, { mode: spec.mode, min: spec.min ?? 2, ...spec.key ? { key: spec.key } : {} });
  }
  return out;
}
function normalizePaths(paths) {
  if (!paths) return /* @__PURE__ */ new Map();
  if (isList(paths)) return new Map(paths.map((c) => [c, "dim"]));
  return new Map(Object.entries(paths));
}
function isList(o) {
  return Array.isArray(o);
}
var isEmpty = (v) => v === null || v === void 0 || v === "";
function runKey(spec, value, row) {
  if (isEmpty(value)) return void 0;
  const k = spec.key ? spec.key(value, row) : value;
  return k === null ? void 0 : k;
}
function computeRuns(rows, column, spec) {
  const keys = rows.map((r) => runKey(spec, r[column], r));
  const out = new Array(rows.length).fill(void 0);
  const min = Math.max(2, spec.min ?? 2);
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    if (keys[i] !== void 0) while (j < rows.length && Object.is(keys[j], keys[i])) j++;
    const length = j - i;
    if (keys[i] !== void 0 && length >= min) {
      for (let k = i; k < j; k++) out[k] = { start: k === i, end: k === j - 1, length, index: k - i };
    }
    i = j;
  }
  return out;
}
var SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
function schemeLength(p) {
  return SCHEME.exec(p)?.[0].length ?? 0;
}
function sharedPathPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  let l = 0;
  while (l < n && a[l] === b[l]) l++;
  if (l === 0) return 0;
  const cut = a.lastIndexOf("/", l - 1);
  return cut >= schemeLength(a) ? cut + 1 : 0;
}
function splitParent(p) {
  const body = p.endsWith("/") ? p.slice(0, -1) : p;
  const cut = body.lastIndexOf("/");
  if (cut < schemeLength(p)) return ["", p];
  return [p.slice(0, cut + 1), p.slice(cut + 1)];
}
function isSortedBy(rows, column) {
  let asc = true;
  let desc = true;
  for (let i = 1; i < rows.length && (asc || desc); i++) {
    const c = compareValues(rows[i - 1][column], rows[i][column]);
    if (c > 0) asc = false;
    if (c < 0) desc = false;
  }
  return asc || desc;
}
var TREE_FALLBACK_NOTE = "Paths group into a tree only when sorted by this column; showing shared prefixes dimmed.";
function pathModes(rows, columns, paths) {
  const shown = new Set(columns.map((c) => c.name));
  const modes = /* @__PURE__ */ new Map();
  const notes = /* @__PURE__ */ new Map();
  let tree;
  for (const [c, mode] of normalizePaths(paths)) {
    if (!shown.has(c)) continue;
    if (mode === "tree" && tree === void 0 && isSortedBy(rows, c)) {
      tree = c;
      modes.set(c, "tree");
    } else {
      modes.set(c, "dim");
      if (mode === "tree") notes.set(c, TREE_FALLBACK_NOTE);
    }
  }
  return { paths: modes, ...tree !== void 0 ? { tree } : {}, notes };
}
function tableLayout(rows, columns, opts) {
  const shown = new Set(columns.map((c) => c.name));
  const specs = new Map([...normalizeDitto(opts.ditto)].filter(([c]) => shown.has(c)));
  const runs = new Map([...specs].map(([c, s]) => [c, computeRuns(rows, c, s)]));
  const pm = pathModes(rows, columns, opts.paths);
  const items = pm.tree === void 0 ? rows.map((_, i) => ({ kind: "row", i })) : treeItems(rows, pm.tree);
  return { items, runs, specs, ...pm };
}
function treeItems(rows, column) {
  const parents = rows.map((r) => {
    const v = r[column];
    return typeof v === "string" ? splitParent(v)[0] : "";
  });
  const items = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && parents[j] === parents[i]) j++;
    if (parents[i] !== "" && j - i >= 2) {
      items.push({ kind: "parent", column, prefix: parents[i], first: i });
      for (let k = i; k < j; k++) items.push({ kind: "row", i: k, tree: { last: k === j - 1 } });
    } else {
      for (let k = i; k < j; k++) items.push({ kind: "row", i: k });
    }
    i = j;
  }
  return items;
}

// src/renderers/ditto.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function dittoMark(value) {
  const title = cellTitle(value);
  return /* @__PURE__ */ jsx2("span", { "aria-label": "ditto", ...title != null ? { title } : {}, style: { opacity: 0.3, display: "block", textAlign: "center" }, children: "\u3003" });
}
var RULE = "1px solid currentColor";
function runLine(value, end, head = "tick") {
  const title = cellTitle(value);
  const rule = !end ? { top: "-0.2em", bottom: "-0.2em", borderLeft: RULE } : head === "tick" ? { top: "-0.2em", height: "calc(0.2em + 0.5lh)", width: "0.6em", borderLeft: RULE, borderBottom: RULE } : { top: "-0.2em", height: "calc(0.2em + 0.4lh)", borderLeft: RULE };
  return /* @__PURE__ */ jsxs2(
    "span",
    {
      "aria-label": end ? "run end" : "run",
      ...title != null ? { title } : {},
      style: { display: "block", position: "relative" },
      children: [
        "\xA0",
        /* @__PURE__ */ jsx2("span", { style: { position: "absolute", left: "0.3em", opacity: 0.35, ...rule } }),
        end && head === "arrow" && // A CSS triangle centered on the rule, picking up where it ends.
        /* @__PURE__ */ jsx2("span", { style: {
          position: "absolute",
          left: "0.5px",
          top: "0.4lh",
          opacity: 0.5,
          borderLeft: "0.3em solid transparent",
          borderRight: "0.3em solid transparent",
          borderTop: "0.45em solid currentColor"
        } })
      ]
    }
  );
}
function runOf(ctx, spec) {
  if (ctx.run) return ctx.run;
  const k = runKey(spec, ctx.value, ctx.row);
  if (k === void 0) return void 0;
  const same = (r) => r !== void 0 && Object.is(runKey(spec, r[ctx.column.name], r), k);
  const above = same(ctx.at(-1));
  const below = same(ctx.at(1));
  return above || below ? { start: !above, end: !below } : void 0;
}
var DRAWN = /* @__PURE__ */ new Set(["mark", "line", "arrow"]);
function dittoRenderer(ditto) {
  const specs = normalizeDitto(ditto);
  return (ctx) => {
    const spec = specs.get(ctx.column.name);
    if (!spec || !DRAWN.has(spec.mode)) return ctx.defaultNode;
    const run = runOf(ctx, spec);
    if (!run || run.start) return ctx.defaultNode;
    return spec.mode === "mark" ? dittoMark(ctx.value) : runLine(ctx.value, run.end, spec.mode === "arrow" ? "arrow" : "tick");
  };
}
var DIM = 0.4;
function dimmedPath(path, shared) {
  if (shared <= 0) return path;
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsx2("span", { style: { opacity: DIM }, children: path.slice(0, shared) }),
    path.slice(shared)
  ] });
}
function dimPathNode(path, above) {
  return dimmedPath(path, typeof above === "string" ? sharedPathPrefix(path, above) : 0);
}
function treeChildNode(parent, tail, last) {
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsx2("span", { "aria-hidden": true, style: { opacity: DIM, whiteSpace: "pre" }, children: last ? "\u2514 " : "\u251C " }),
    /* @__PURE__ */ jsx2("span", { style: { fontSize: 0 }, children: parent }),
    tail
  ] });
}

// src/renderers/tableControls.tsx
import { useCallback as useCallback2, useEffect, useMemo as useMemo2, useRef, useState as useState2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
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
  const hidden = useMemo2(
    () => new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)),
    [raw]
  );
  const toggle = useCallback2((name) => {
    const next = new Set(hidden);
    next.delete(name) || next.add(name);
    setRaw([...next].join(","));
  }, [hidden, setRaw]);
  const showAll = useCallback2(() => setRaw(""), [setRaw]);
  const visible = useMemo2(
    () => columns.map((c) => c.name).filter((n) => !hidden.has(n)),
    [columns, hidden]
  );
  return { visible, toggle, showAll, hidden };
}
function ColumnPicker({ columns, vis }) {
  const [open, setOpen] = useState2(false);
  const { visible, toggle, showAll, hidden } = vis;
  return (
    // Note the *host* has to be positioned with a z-index for the panel
    // to paint over the table — see the summary line in `parquet.tsx` /
    // `csv.tsx`. A z-index here can't do it alone: this span is a flex
    // item of that line, so it paints in the line's place in the root
    // stacking order, which is before the table.
    /* @__PURE__ */ jsxs3("span", { style: { position: "relative", display: "inline-block" }, children: [
      /* @__PURE__ */ jsxs3(
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
      open && /* @__PURE__ */ jsxs3(
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
            columns.map((c) => /* @__PURE__ */ jsxs3("label", { style: { display: "block", cursor: "pointer", fontSize: "0.9em" }, children: [
              /* @__PURE__ */ jsx3(
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
            hidden.size > 0 && /* @__PURE__ */ jsx3("button", { type: "button", onClick: showAll, style: { ...BTN, marginTop: "0.4em" }, children: "show all" })
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
  return /* @__PURE__ */ jsxs3("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.4em" }, children: [
    /* @__PURE__ */ jsx3(
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
    value.trim() !== "" && count && /* @__PURE__ */ jsxs3("span", { style: { opacity: 0.7 }, children: [
      count.shown.toLocaleString(),
      " / ",
      count.total.toLocaleString()
    ] })
  ] });
}
function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback2((...args) => ref.current?.(...args), []);
}
function usePageNotify(onPage, ctxRef, deps) {
  const notify = useStableCallback(onPage);
  useEffect(() => {
    notify(ctxRef.current);
  }, deps);
}

// src/renderers/tableBody.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function useHeadHeight(tbody, on) {
  const [h, setH] = useState3(0);
  useLayoutEffect(() => {
    const head = tbody.current?.parentElement?.querySelector(":scope > thead");
    if (!on || !head) return;
    const update = () => setH(head.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(head);
    return () => ro.disconnect();
  }, [tbody, on]);
  return h;
}
function TableRows({
  rows,
  columns,
  path,
  colStyles,
  widthStyle,
  el,
  ditto,
  paths,
  renderCell,
  defaultNode,
  raw,
  rowIndex,
  rowKey = (i) => i,
  rowStyle,
  onCellHover,
  children
}) {
  const layout = useMemo3(() => tableLayout(rows, columns, { ditto, paths }), [rows, columns, ditto, paths]);
  const cellRenderer = useMemo3(
    () => chainCellRenderers(ditto ? dittoRenderer(ditto) : void 0, renderCell),
    [ditto, renderCell]
  );
  const notifyHover = useStableCallback(onCellHover);
  const tbody = useRef2(null);
  const anySticky = [...layout.specs.values()].some((s) => s.mode === "sticky");
  const headH = useHeadHeight(tbody, anySticky);
  const displayOf = [];
  layout.items.forEach((it, d) => {
    if (it.kind === "row") displayOf[it.i] = d;
  });
  const coveredTo = /* @__PURE__ */ new Map();
  const covered = (c, d) => (coveredTo.get(c) ?? -1) >= d;
  const width = (c) => widthStyle?.(c) ?? {};
  const trs = layout.items.map((it, d) => {
    if (it.kind === "parent") {
      const next = rows[it.first];
      const prev = rows[it.first - 1];
      return /* @__PURE__ */ jsx4("tr", { "data-parent": "", style: rowStyle, children: columns.map((c) => {
        if (covered(c.name, d)) return null;
        const st = colStyles.get(c.name);
        const style = { ...st?.cell ?? TD_STYLE, ...width(c.name) };
        let node = null;
        let title;
        if (c.name === it.column) {
          node = ellipsisWrap(st?.ellipsis ?? "end", dimPathNode(it.prefix, prev?.[c.name]), void 0);
          title = it.prefix;
        } else {
          const run = layout.runs.get(c.name)?.[it.first];
          const mode = layout.specs.get(c.name)?.mode;
          if ((mode === "line" || mode === "arrow") && run && !run.start) node = runLine(next[c.name], false);
        }
        return /* @__PURE__ */ jsx4("td", { style, className: st?.cellClass, ...title ? { title } : {}, children: node }, c.name);
      }) }, `parent:${rowKey(it.first)}`);
    }
    const { i } = it;
    const row = rows[i];
    return /* @__PURE__ */ jsx4("tr", { style: rowStyle, children: columns.map((c) => {
      if (covered(c.name, d)) return null;
      const st = colStyles.get(c.name);
      const ellipsis = st?.ellipsis ?? "end";
      const value = row[c.name];
      const run = layout.runs.get(c.name)?.[i];
      const base = defaultNode(value, c);
      let start = base;
      const pathMode = layout.paths.get(c.name);
      const isPath = pathMode !== void 0 && typeof value === "string";
      if (isPath) {
        if (pathMode === "tree" && it.tree) {
          const [parent, tail] = splitParent(value);
          start = treeChildNode(parent, tail, it.tree.last);
        } else {
          start = dimPathNode(value, rows[i - 1]?.[c.name]);
        }
      }
      const ctx = tableCellCtx({
        value,
        column: c,
        row,
        at: (dr) => rows[i + dr],
        rowIndex: rowIndex(i),
        path,
        defaultNode: start,
        ...run ? { run } : {}
      });
      const rendered = cellRenderer ? cellRenderer(ctx) : start;
      const custom = rendered !== base;
      const wrapped = ellipsisWrap(ellipsis, rendered, !custom && typeof value === "string" ? value : void 0);
      const elided = applyElide(el, { value, node: wrapped, hasCustomRender: custom, column: c, row, path, raw: raw?.(value, c), ellipsis });
      const { node } = elided;
      let { title, onMouseEnter: measure } = elided;
      if (isPath && rendered === start && el.tooltip === "native") {
        title = value;
        measure = void 0;
      }
      const hoverEnter = onCellHover ? () => notifyHover(ctx) : void 0;
      const handlers = {
        ...measure || hoverEnter ? { onMouseEnter: (e) => {
          measure?.(e);
          hoverEnter?.();
        } } : {},
        ...onCellHover ? { onMouseLeave: () => notifyHover(null) } : {}
      };
      const tips = title != null ? { title } : {};
      const style = { ...st?.cell ?? TD_STYLE, ...width(c.name) };
      if (run?.start && layout.specs.get(c.name)?.mode === "sticky") {
        const rowSpan = displayOf[i + run.length - 1] - d + 1;
        coveredTo.set(c.name, d + rowSpan - 1);
        return /* @__PURE__ */ jsx4("td", { rowSpan, "data-run": run.length, className: st?.cellClass, style: { ...style, overflow: "visible", verticalAlign: "top" }, children: /* @__PURE__ */ jsx4(
          "div",
          {
            ...tips,
            ...handlers,
            style: { position: "sticky", top: headH, maxWidth: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
            children: node
          }
        ) }, c.name);
      }
      return /* @__PURE__ */ jsx4("td", { style, className: st?.cellClass, ...tips, ...handlers, children: node }, c.name);
    }) }, rowKey(i));
  });
  return /* @__PURE__ */ jsxs4("tbody", { ref: tbody, children: [
    trs,
    children
  ] });
}
function PathNote({ note, onSort }) {
  if (!note) return null;
  const style = {
    marginLeft: "0.5em",
    fontSize: "0.8em",
    fontWeight: 400,
    opacity: 0.75,
    padding: "0 0.4em",
    border: "1px dashed currentColor",
    borderRadius: 3,
    background: "transparent",
    color: "inherit",
    font: "inherit"
  };
  return onSort ? /* @__PURE__ */ jsx4("button", { type: "button", title: note, onClick: (e) => {
    e.stopPropagation();
    onSort();
  }, style: { ...style, cursor: "pointer" }, children: "sort for tree" }) : /* @__PURE__ */ jsx4("span", { title: note, style, children: "tree needs sort" });
}

// src/renderers/columnResize.tsx
import { useCallback as useCallback3, useEffect as useEffect2, useMemo as useMemo4, useRef as useRef3, useState as useState4 } from "react";
import { jsx as jsx5 } from "react/jsx-runtime";
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
function columnFingerprint(columns) {
  const s = columns.map((c) => c.name).sort().join("");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 33) + s.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}
function scopeKey(scope, columns, path) {
  if (typeof scope === "function") return `f:${scope(columns, path)}`;
  if (scope === "schema") return `s:${columnFingerprint(columns)}`;
  if (scope === "column") return "c";
  return `p:${path}`;
}
function readLS(key) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key, value) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
  }
}
function useLocalStorageString(key, initial) {
  const [value, setValue] = useState4(() => readLS(key) ?? initial);
  useEffect2(() => {
    setValue(readLS(key) ?? initial);
  }, [key, initial]);
  useEffect2(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e) => {
      if (e.key === key) setValue(e.newValue ?? initial);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initial]);
  const set = useCallback3((v) => {
    writeLS(key, v);
    setValue(v);
  }, [key]);
  return [value, set];
}
function useColumnWidths({ on, scope, columns, path, usePersistedState }) {
  const use = usePersistedState ?? defaultUseState;
  const [urlRaw, setUrlRaw] = use("cw", "");
  const lsKey = useMemo4(() => `ft-colw:${scopeKey(scope, columns, path)}`, [scope, columns, path]);
  const [lsRaw, setLsRaw] = useLocalStorageString(lsKey, "");
  const onPath = scope === "path";
  const raw = onPath ? urlRaw : lsRaw;
  const setRaw = onPath ? setUrlRaw : setLsRaw;
  const persisted = useMemo4(() => parseWidths(raw), [raw]);
  const persistedRef = useRef3(persisted);
  persistedRef.current = persisted;
  const [drag, setDrag] = useState4(null);
  const commit = useCallback3((col, w) => {
    const m = new Map(persistedRef.current);
    m.set(col, Math.max(MIN_WIDTH, w));
    setRaw(serializeWidths(m));
  }, [setRaw]);
  const startResize = useCallback3((col, e) => {
    if (!on) return;
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
  }, [on, commit]);
  const autoFit = useCallback3((col, e) => {
    if (!on) return;
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
  }, [on, commit]);
  const styleFor = useCallback3((col) => {
    if (!on) return NO_STYLE;
    const w = drag && drag.col === col ? drag.w : persisted.get(col);
    return w == null ? NO_STYLE : { width: w, minWidth: w, maxWidth: w };
  }, [on, drag, persisted]);
  return useMemo4(() => ({ styleFor, startResize, autoFit }), [styleFor, startResize, autoFit]);
}
function ColumnResizeHandle({ col, widths }) {
  const [hot, setHot] = useState4(false);
  return /* @__PURE__ */ jsx5(
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

// src/renderers/tableBrowser.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
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
var ROW_STYLE = { borderTop: "1px solid rgba(127,127,127,0.15)" };
var NUMERIC_KINDS = /* @__PURE__ */ new Set(["number"]);
var plural = (n, noun) => `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
function defaultTableCell(value) {
  if (value === null || value === void 0) {
    return /* @__PURE__ */ jsx6("span", { style: { opacity: 0.4 }, children: "null" });
  }
  if (value instanceof Uint8Array) {
    return /* @__PURE__ */ jsx6("span", { style: { opacity: 0.6 }, children: `<${value.byteLength} bytes>` });
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
  ditto,
  paths,
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
  const [result, setResult] = useState5(null);
  const [error, setError] = useState5(null);
  const [loading, setLoading] = useState5(false);
  const active = useMemo5(
    () => objects.find((o) => o.name === table) ?? objects[0] ?? null,
    [objects, table]
  );
  const source = useMemo5(
    () => active ? catalog.source(active.name) : null,
    [catalog, active]
  );
  const can = source?.capabilities;
  const columns = result?.columns ?? [];
  const { visible, ...vis } = useColumnVisibility(columns, usePersistedState, hiddenColumns);
  useEffect3(() => {
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
  const lastQueryKey = useRef4(null);
  useEffect3(() => {
    if (lastQueryKey.current !== null && lastQueryKey.current !== queryKey) setPage(0);
    lastQueryKey.current = queryKey;
  }, [queryKey, setPage]);
  const rows = result?.rows ?? [];
  const total = result?.total ?? null;
  const pageStart = result?.offset ?? 0;
  const unfilteredTotals = useRef4(/* @__PURE__ */ new Map());
  if (active && !filter.trim() && total !== null) unfilteredTotals.current.set(active.name, total);
  const unfilteredTotal = active ? unfilteredTotals.current.get(active.name) : void 0;
  const el = useMemo5(() => resolveElide(elide), [elide]);
  const cw = useColumnWidths({
    on: !!resizableColumns,
    scope: typeof resizableColumns === "object" ? resizableColumns.scope ?? "path" : "path",
    columns,
    path,
    usePersistedState
  });
  const colStyles = useMemo5(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, (c) => NUMERIC_KINDS.has(c.kind), el),
    [columns, path, cellProps, headerProps, el]
  );
  const pageCtxRef = useRef4({ rows: [], columns: [], path, pageStart: 0, totalRows: null });
  pageCtxRef.current = {
    rows,
    columns: columns.filter((c) => visible.includes(c.name)),
    path,
    pageStart,
    totalRows: total
  };
  usePageNotify(onPage, pageCtxRef, [rows, visible, path, pageStart, total]);
  if (!objects.length) return /* @__PURE__ */ jsx6("div", { style: { opacity: 0.6 }, children: "no tables or views in this file" });
  const lastPage = total === null ? null : Math.max(0, Math.ceil(total / pageSize) - 1);
  const shown = columns.filter((c) => visible.includes(c.name));
  const pathNotes = paths ? pathModes(rows, shown, paths).notes : void 0;
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("p", { style: {
      opacity: 0.85,
      fontSize: "0.95em",
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      flexWrap: "wrap",
      position: "relative",
      zIndex: 2
    }, children: [
      objects.length > 1 && /* @__PURE__ */ jsx6(
        "select",
        {
          value: active?.name ?? "",
          onChange: (e) => setTable(e.target.value),
          "aria-label": "Table",
          style: { ...BTN2, cursor: "pointer" },
          children: objects.map((o) => /* @__PURE__ */ jsxs5("option", { value: o.name, children: [
            o.name,
            o.type === "view" ? " (view)" : ""
          ] }, o.name))
        }
      ),
      result && /* @__PURE__ */ jsxs5("span", { style: { opacity: 0.7 }, children: [
        plural(total ?? rows.length, "row"),
        total !== null && total > 0 && ` \xB7 ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}`
      ] }),
      can?.filter && /* @__PURE__ */ jsx6(
        FilterInput,
        {
          value: filter,
          onChange: setFilter,
          placeholder: "filter",
          ...total !== null && unfilteredTotal !== void 0 ? { count: { shown: total, total: unfilteredTotal } } : {}
        }
      ),
      columnPicker && columns.length > 0 && /* @__PURE__ */ jsx6(ColumnPicker, { columns, vis: { visible, ...vis } }),
      loading && /* @__PURE__ */ jsx6("span", { style: { opacity: 0.5 }, children: "\u2026" }),
      status
    ] }),
    error && /* @__PURE__ */ jsx6("p", { style: { color: "crimson", fontSize: "0.9em" }, children: error.message }),
    /* @__PURE__ */ jsx6("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }, children: /* @__PURE__ */ jsxs5("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsx6("tr", { style: {
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas"
      }, children: shown.map((c) => {
        const styles = colStyles.get(c.name);
        const label = can?.sort ? /* @__PURE__ */ jsxs5(
          "span",
          {
            onClick: () => sort.toggle(c.name),
            style: { cursor: "pointer", userSelect: "none" },
            title: `Sort by ${c.name}`,
            children: [
              c.name,
              " ",
              /* @__PURE__ */ jsx6("span", { style: { opacity: sort.column === c.name ? 0.9 : 0.3 }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : /* @__PURE__ */ jsx6("span", { children: c.name });
        return /* @__PURE__ */ jsxs5(
          "th",
          {
            style: { ...styles?.header ?? TH_STYLE, ...resizableColumns ? { position: "relative" } : {}, ...cw.styleFor(c.name) },
            ...styles?.headerClass ? { className: styles.headerClass } : {},
            children: [
              renderHeader ? renderHeader({ column: c, path, defaultNode: label }) : label,
              /* @__PURE__ */ jsx6(PathNote, { note: pathNotes?.get(c.name), onSort: can?.sort ? () => sort.toggle(c.name) : void 0 }),
              resizableColumns && /* @__PURE__ */ jsx6(ColumnResizeHandle, { col: c.name, widths: cw })
            ]
          },
          c.name
        );
      }) }) }),
      /* @__PURE__ */ jsx6(
        TableRows,
        {
          rows,
          columns: shown,
          path,
          colStyles,
          widthStyle: cw.styleFor,
          el,
          ...ditto ? { ditto } : {},
          ...paths ? { paths } : {},
          ...renderCell ? { renderCell } : {},
          defaultNode: defaultTableCell,
          rowIndex: (i) => pageStart + i,
          rowKey: (i) => pageStart + i,
          rowStyle: ROW_STYLE,
          ...onCellHover ? { onCellHover } : {},
          children: result && rows.length === 0 && !loading && !error && /* @__PURE__ */ jsx6("tr", { children: /* @__PURE__ */ jsx6("td", { colSpan: Math.max(1, shown.length), style: { ...TD_STYLE, opacity: 0.6 }, children: filter.trim() ? "no rows match" : "no rows" }) })
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs5("p", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginTop: "0.6em" }, children: [
      /* @__PURE__ */ jsx6("button", { type: "button", style: BTN2, disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039 prev" }),
      /* @__PURE__ */ jsx6("span", { style: { opacity: 0.7, fontSize: "0.85em" }, children: can?.randomAccess === false ? `rows ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}` : `page ${(page + 1).toLocaleString()}${lastPage !== null ? ` / ${(lastPage + 1).toLocaleString()}` : ""}` }),
      /* @__PURE__ */ jsx6(
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

// src/renderers/memoryTableSource.ts
var CAPABILITIES = { sort: true, filter: true, total: true, randomAccess: true };
function inferKind(value) {
  switch (typeof value) {
    case "number":
    case "bigint":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      if (value instanceof Date) return "temporal";
      if (value instanceof Uint8Array) return "binary";
      return void 0;
    default:
      return "string";
  }
}
function inferColumns(rows) {
  const kinds = /* @__PURE__ */ new Map();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (kinds.get(k) !== void 0) continue;
      kinds.set(k, v === null || v === void 0 || v === "" ? void 0 : inferKind(v));
    }
  }
  return [...kinds].map(([name, kind]) => kind ? { name, kind } : { name });
}
function memoryTableSource(rows, opts = {}) {
  const columns = opts.columns ?? inferColumns(rows);
  const names = columns.map((c) => c.name);
  return {
    capabilities: CAPABILITIES,
    columns: async () => columns,
    async page(req) {
      let out = filterRows([...rows], req.filter ?? "", names) ?? [];
      if (req.sort) {
        const { column, dir } = req.sort;
        const col = columns.find((c) => c.name === column);
        const cmp = (col && opts.sortComparators?.(col)) ?? compareValues;
        const sign = dir === "desc" ? -1 : 1;
        out = out.sort((x, y) => sign * cmp(x[column], y[column]));
      }
      return { rows: out.slice(req.offset, req.offset + req.limit), columns, total: out.length, offset: req.offset };
    }
  };
}
function singleTableCatalog(name, source) {
  return {
    objects: async () => [{ name, type: "table" }],
    source: () => source
  };
}

// src/renderers/rowsTable.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
var OBJECTS = [{ name: "rows", type: "table" }];
function RowsTable({
  rows,
  columns,
  sortComparators,
  path = "rows",
  usePersistedState,
  ...browser
}) {
  const catalog = useMemo6(
    () => singleTableCatalog("rows", memoryTableSource(rows, {
      ...columns ? { columns } : {},
      ...sortComparators ? { sortComparators } : {}
    })),
    [rows, columns, sortComparators]
  );
  return /* @__PURE__ */ jsx7(
    TableBrowser,
    {
      ...browser,
      catalog,
      objects: OBJECTS,
      path,
      ...usePersistedState ? { usePersistedState } : {}
    }
  );
}
var rowsTable_default = RowsTable;
export {
  RowsTable,
  rowsTable_default as default,
  inferColumns,
  inferKind,
  memoryTableSource,
  singleTableCatalog
};
//# sourceMappingURL=rowsTable.js.map