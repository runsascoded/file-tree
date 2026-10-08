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

// src/renderers/jsonl.tsx
var jsonl_exports = {};
__export(jsonl_exports, {
  JSONL_MAX_BYTES: () => JSONL_MAX_BYTES,
  JSONL_MAX_ROWS: () => JSONL_MAX_ROWS,
  JsonlViewer: () => JsonlViewer,
  default: () => jsonl_default,
  makeJsonlViewer: () => makeJsonlViewer,
  parseJsonl: () => parseJsonl
});
module.exports = __toCommonJS(jsonl_exports);
var import_react8 = require("react");

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/rowsTable.tsx
var import_react7 = require("react");

// src/renderers/tableBrowser.tsx
var import_react6 = require("react");

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

// src/renderers/table.ts
function tableCellCtx(ctx) {
  return Object.defineProperty(ctx, "prevRow", { get: () => ctx.at(-1), enumerable: true });
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
var import_react_dom = require("react-dom");
var import_react4 = require("react");

// src/renderers/elideNode.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function splitMiddle(text, tail = MIDDLE_TAIL) {
  if (text === void 0 || text.length <= tail + 1) return null;
  return [text.slice(0, text.length - tail), text.slice(text.length - tail)];
}
function ellipsisWrap(mode, node, text, tail = MIDDLE_TAIL) {
  if (mode === "start") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("bdi", { children: node });
  if (mode === "middle") {
    const split = splitMiddle(text, tail);
    if (split) {
      const [head, end] = split;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "flex", minWidth: 0, maxWidth: "100%" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }, children: head }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { whiteSpace: "nowrap", flexShrink: 0 }, children: end })
      ] });
    }
  }
  return node;
}

// src/renderers/tableSort.ts
var import_react2 = require("react");
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
function useSort(usePersistedState) {
  const use = usePersistedState ?? defaultUseState;
  const [raw, setRaw] = use("sort", "");
  const column = raw ? raw.replace(/^-/, "") : null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const toggle = (0, import_react2.useCallback)((name) => {
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
    for (const c of ditto) out.set(c, { mode: "mark", min: 2, float: true, every: 5 });
    return out;
  }
  for (const [c, s] of Object.entries(ditto)) {
    const spec = typeof s === "string" ? { mode: s } : s;
    out.set(c, {
      mode: spec.mode ?? "sticky",
      min: spec.min ?? 2,
      float: spec.float ?? true,
      every: spec.every ?? 5,
      ...spec.key ? { key: spec.key } : {},
      ...spec.render ? { render: spec.render } : {}
    });
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
function nextSegment(value, base) {
  const rem = value.slice(base.length);
  const from = base === "" ? schemeLength(rem) : 0;
  const cut = rem.indexOf("/", from);
  return cut === -1 || cut === rem.length - 1 ? null : rem.slice(0, cut + 1);
}
function pathGroups(column, opts = {}) {
  const min = Math.max(2, opts.min ?? 2);
  return (rows) => {
    if (!isSortedBy(rows, column)) return [];
    const vals = rows.map((r) => typeof r[column] === "string" ? r[column] : "");
    const build = (lo, hi, base) => {
      const out = [];
      let i = lo;
      while (i < hi) {
        const seg = vals[i].startsWith(base) ? nextSegment(vals[i], base) : null;
        if (seg === null) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < hi && vals[j].startsWith(base + seg) && nextSegment(vals[j], base) === seg) j++;
        if (j - i >= min) {
          let prefix = base + seg;
          for (; ; ) {
            const next = nextSegment(vals[i], prefix);
            if (next === null) break;
            let all = true;
            for (let k = i + 1; k < j && all; k++) all = nextSegment(vals[k], prefix) === next;
            if (!all) break;
            prefix += next;
          }
          out.push({
            key: `${column}:${prefix}`,
            start: i,
            end: j,
            column,
            label: prefix.slice(base.length),
            title: prefix,
            prefix,
            children: build(i, j, prefix)
          });
        }
        i = j;
      }
      return out;
    };
    return build(0, rows.length, "");
  };
}
function groupHash(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 36 ** 4).toString(36).padStart(4, "0");
}
function parseFolds(raw) {
  const out = /* @__PURE__ */ new Set();
  for (let i = 0; i + 4 <= raw.length; i += 4) out.add(raw.slice(i, i + 4));
  return out;
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
  const pm = pathModes(rows, columns, opts.paths);
  const groupFn = opts.groups ?? (pm.tree !== void 0 ? pathGroups(pm.tree) : void 0);
  const groups = groupFn ? groupFn(rows) : [];
  const folded = opts.folded ?? /* @__PURE__ */ new Set();
  const items = [];
  const walk = (gs, lo, hi, ancestors) => {
    const depth = ancestors.length;
    const parent = ancestors[depth - 1];
    const row = (i2) => ({ kind: "row", i: i2, depth, ...parent ? { group: parent } : {}, ancestors });
    let i = lo;
    for (const g of gs) {
      for (; i < g.start; i++) items.push(row(i));
      const collapsed = folded.has(groupHash(g.key));
      items.push({ kind: "group", group: g, depth, collapsed, size: g.end - g.start, ancestors });
      if (!collapsed) walk(g.children ?? [], g.start, g.end, [...ancestors, g]);
      i = g.end;
    }
    for (; i < hi; i++) items.push(row(i));
  };
  walk(groups, 0, rows.length, []);
  const runs = new Map([...specs].map(([c, spec]) => {
    const out = new Array(rows.length).fill(void 0);
    let seg = [];
    const flush = () => {
      const vr = computeRuns(seg.map((i) => rows[i]), c, spec);
      seg.forEach((i, k) => {
        out[i] = vr[k];
      });
      seg = [];
    };
    for (const it of items) {
      if (it.kind === "row") {
        if (it.ancestors.some((g) => g.uniform && g.column === c)) flush();
        else seg.push(it.i);
      } else if (it.group.column === c) flush();
    }
    flush();
    return [c, out];
  }));
  return { items, runs, specs, ...pm };
}

// src/renderers/ditto.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var RULE = "1px solid currentColor";
var DIM = 0.4;
function dimmedPath(path, shared) {
  if (shared <= 0) return path;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { opacity: DIM }, children: path.slice(0, shared) }),
    path.slice(shared)
  ] });
}
function dimPathNode(path, above) {
  return dimmedPath(path, typeof above === "string" ? sharedPathPrefix(path, above) : 0);
}
function treeChildNode(parent, tail, last) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": true, style: { opacity: DIM, whiteSpace: "pre" }, children: last ? "\u2514 " : "\u251C " }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 0 }, children: parent }),
    tail
  ] });
}
var RULE_X = "0.9em";
var pct = (x, span) => `${x / span * 100}%`;
function arrowhead(top, key) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "span",
    {
      style: {
        position: "absolute",
        top,
        left: `calc(${RULE_X} - 0.3em + 0.5px)`,
        opacity: 0.5,
        borderLeft: "0.3em solid transparent",
        borderRight: "0.3em solid transparent",
        borderTop: "0.45em solid currentColor"
      }
    },
    key
  );
}
function runRenderer(mode, opts = {}) {
  const { float = true, every = 5 } = opts;
  return ({ span, offsets, defaultNode, stickyTop }) => {
    const last = offsets[offsets.length - 1];
    const deco = [];
    if (mode === "mark") {
      for (const o of offsets.slice(1)) {
        deco.push(
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-label": "ditto", style: {
            position: "absolute",
            left: 0,
            right: 0,
            top: pct(o, span),
            height: pct(1, span),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.3
          }, children: "\u3003" }, o)
        );
      }
    } else if ((mode === "line" || mode === "arrow") && offsets.length > 1) {
      const top = pct(offsets[0] + 1, span);
      const bottom = pct(span - last - 0.5, span);
      deco.push(
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-label": mode === "line" ? "run line" : "run arrow", style: {
          position: "absolute",
          left: RULE_X,
          top,
          bottom,
          opacity: 0.35,
          borderLeft: RULE,
          ...mode === "line" ? { width: "0.6em", borderBottom: RULE } : {}
        } }, "rule")
      );
      if (mode === "arrow") {
        offsets.forEach((o, k) => {
          if (k > 0 && k < offsets.length - 1 && every > 0 && k % every === 0) deco.push(arrowhead(`calc(${pct(o + 0.5, span)} - 0.3em)`, k));
        });
        deco.push(arrowhead(`calc(${pct(last + 0.5, span)} - 0.2em)`, "end"));
      }
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": true, style: { position: "absolute", inset: 0, pointerEvents: "none" }, children: deco }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: {
        position: float ? "sticky" : "relative",
        ...float ? { top: stickyTop } : {},
        background: "var(--ft-run-bg, Canvas)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }, children: defaultNode })
    ] });
  };
}

// src/renderers/tableControls.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
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
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { position: "relative", display: "inline-block" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
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
      open && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
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
            columns.map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { display: "block", cursor: "pointer", fontSize: "0.9em" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
            hidden.size > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: showAll, style: { ...BTN, marginTop: "0.4em" }, children: "show all" })
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.4em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
    value.trim() !== "" && count && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { opacity: 0.7 }, children: [
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

// src/renderers/tableBody.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function useHeadHeight(tbody, on) {
  const [h, setH] = (0, import_react4.useState)(0);
  (0, import_react4.useLayoutEffect)(() => {
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
var INDENT_EM = 1.1;
var FOLD_BTN = {
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  padding: "0 0.3em 0 0",
  opacity: 0.6
};
var ROW_LINE = "rgba(127,127,127,0.24)";
var ROW_STYLE = { borderTop: `1px solid ${ROW_LINE}` };
var ROW_HOVER = "rgba(127,127,127,0.12)";
function scroller(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return window;
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
  groups,
  renderCell,
  defaultNode,
  raw,
  rowIndex,
  rowKey = (i) => i,
  rowStyle,
  onCellHover,
  usePersistedState,
  children
}) {
  const use = usePersistedState ?? defaultUseState;
  const [foldRaw, setFoldRaw] = use("fold", "");
  const folded = (0, import_react4.useMemo)(() => parseFolds(foldRaw), [foldRaw]);
  const toggleFold = (key) => {
    const h = groupHash(key);
    const next = new Set(folded);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    setFoldRaw([...next].join(""));
  };
  const layout = (0, import_react4.useMemo)(
    () => tableLayout(rows, columns, { ditto, paths, ...groups ? { groups } : {}, folded }),
    [rows, columns, ditto, paths, groups, folded]
  );
  const notifyHover = useStableCallback(onCellHover);
  const tbody = (0, import_react4.useRef)(null);
  const anyMerged = [...layout.specs.values()].some((s) => s.mode !== "none");
  const anyGroups = layout.items.some((it) => it.kind === "group");
  const headH = useHeadHeight(tbody, anyMerged || anyGroups);
  const renderers = (0, import_react4.useMemo)(() => new Map([...layout.specs].map(([c, s]) => [
    c,
    s.mode === "none" ? void 0 : s.render ?? runRenderer(s.mode, { float: s.float, every: s.every })
  ])), [layout.specs]);
  const displayOf = [];
  const order = [];
  layout.items.forEach((it, d) => {
    if (it.kind === "row") {
      displayOf[it.i] = d;
      order.push(it.i);
    }
  });
  const posOf = [];
  order.forEach((i, k) => {
    posOf[i] = k;
  });
  const merges = /* @__PURE__ */ new Map();
  for (const c of columns) {
    if (!renderers.get(c.name)) continue;
    const runs = layout.runs.get(c.name);
    for (const i of order) {
      const run = runs[i];
      if (!run?.start) continue;
      const runRows = order.slice(posOf[i], posOf[i] + run.length);
      let d0 = displayOf[i];
      for (; ; ) {
        const above = layout.items[d0 - 1];
        if (above?.kind !== "group" || above.group.column === c.name) break;
        d0--;
      }
      if (!merges.has(d0)) merges.set(d0, /* @__PURE__ */ new Map());
      merges.get(d0).set(c.name, { i, d0, end: displayOf[runRows[runRows.length - 1]], runRows });
    }
  }
  const id = (0, import_react4.useId)().replace(/[^a-zA-Z0-9_-]/g, "");
  const hoverStyle = (0, import_react4.useRef)(null);
  (0, import_react4.useLayoutEffect)(() => {
    if (typeof document === "undefined") return;
    const st = document.createElement("style");
    document.head.appendChild(st);
    hoverStyle.current = st;
    return () => {
      st.remove();
      hoverStyle.current = null;
    };
  }, []);
  const setHover = (d) => {
    tbody.current?.style.setProperty("--ft-hover", String(d ?? -1e4));
    if (hoverStyle.current) {
      hoverStyle.current.textContent = d === null ? "" : `tbody[data-ft="${id}"] > tr[data-d="${d}"] > td:not([rowspan]) { background: ${ROW_HOVER}; }`;
    }
  };
  const onMouseMove = (e) => {
    const td = e.target.closest("td");
    const tr = td?.parentElement;
    if (!td || !tr?.dataset.d) return setHover(null);
    let d = Number(tr.dataset.d);
    if (td.rowSpan > 1) {
      const r = td.getBoundingClientRect();
      d += Math.min(td.rowSpan - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * td.rowSpan)));
    }
    setHover(d);
  };
  const [crumbs, setCrumbs] = (0, import_react4.useState)([]);
  const [crumbHost, setCrumbHost] = (0, import_react4.useState)(null);
  const crumbCol = layout.items.find((it) => it.kind === "group")?.group.column;
  (0, import_react4.useLayoutEffect)(() => {
    const tb = tbody.current;
    const table = tb?.parentElement;
    const ci = crumbCol === void 0 ? -1 : columns.findIndex((c) => c.name === crumbCol);
    const th = ci < 0 ? null : table?.querySelector(`:scope > thead > tr > th:nth-child(${ci + 1})`) ?? null;
    if (!tb || !th) {
      setCrumbHost(null);
      setCrumbs([]);
      return;
    }
    if (getComputedStyle(th).position === "static") th.style.position = "relative";
    setCrumbHost(th);
    const sc = scroller(tb);
    const update = () => {
      const top = th.getBoundingClientRect().bottom;
      const trs2 = tb.querySelectorAll(":scope > tr[data-d]");
      const rowH = trs2[0]?.getBoundingClientRect().height ?? 20;
      const firstBelow = (y) => {
        for (const tr of trs2) if (tr.getBoundingClientRect().bottom > y + 1) return Number(tr.dataset.d);
        return -1;
      };
      const chainAt = (d) => {
        const it = layout.items[d];
        return it ? it.ancestors : [];
      };
      let chain = chainAt(firstBelow(top));
      chain = chainAt(firstBelow(top + chain.length * rowH));
      chain = chain.filter((g) => {
        const tr = tb.querySelector(`:scope > tr[data-group="${CSS.escape(g.key)}"]`);
        return !tr || tr.getBoundingClientRect().top < top - 1;
      });
      setCrumbs((prev) => prev.length === chain.length && prev.every((g, k) => g.key === chain[k].key) ? prev : chain);
    };
    update();
    sc.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      sc.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [layout, crumbCol, columns]);
  const scrollToGroup = (g) => {
    const tb = tbody.current;
    const tr = tb?.querySelector(`:scope > tr[data-group="${CSS.escape(g.key)}"]`);
    const th = crumbHost;
    if (!tb || !tr || !th) return;
    const sc = scroller(tb);
    const delta = tr.getBoundingClientRect().top - th.getBoundingClientRect().bottom;
    if (sc === window) window.scrollBy(0, delta);
    else sc.scrollTop += delta;
  };
  const width = (c) => widthStyle?.(c) ?? {};
  const coveredTo = /* @__PURE__ */ new Map();
  const covered = (c, d) => (coveredTo.get(c) ?? -1) >= d;
  const cellBase = (c) => ({ ...colStyles.get(c.name)?.cell ?? TD_STYLE, ...width(c.name) });
  const indentStyle = (c, depth) => depth ? { paddingLeft: `calc(${cellBase(c).paddingLeft ?? "0.6em"} + ${depth * INDENT_EM}em)` } : {};
  const groupLabel = (g, collapsed, size, onToggle) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", "aria-expanded": !collapsed, "aria-label": collapsed ? "expand" : "collapse", onClick: onToggle ?? (() => toggleFold(g.key)), style: FOLD_BTN, children: collapsed ? "\u25B8" : "\u25BE" }),
    typeof g.label === "string" && g.prefix ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 0 }, children: g.prefix.slice(0, g.prefix.length - g.label.length) }),
      g.label
    ] }) : g.label,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { opacity: 0.45 }, children: ` \xB7 ${size.toLocaleString()}${collapsed ? ` row${size === 1 ? "" : "s"}` : ""}` })
  ] });
  const dataCell = (it, c) => {
    const { i, depth, group } = it;
    const row = rows[i];
    const st = colStyles.get(c.name);
    const ellipsis = st?.ellipsis ?? "end";
    const value = row[c.name];
    const run = layout.runs.get(c.name)?.[i];
    const base = defaultNode(value, c);
    let start = base;
    let indent = 0;
    const pathMode = layout.paths.get(c.name);
    const isPath = pathMode !== void 0 && typeof value === "string";
    if (isPath) {
      if (group?.prefix !== void 0 && group.column === c.name && value.startsWith(group.prefix)) {
        start = treeChildNode(group.prefix, value.slice(group.prefix.length), i === group.end - 1);
        indent = depth;
      } else {
        const above = order[posOf[i] - 1];
        start = dimPathNode(value, above === void 0 ? void 0 : rows[above][c.name]);
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
    const stated = it.ancestors.some((g) => g.uniform && g.column === c.name);
    const rendered = stated ? null : renderCell ? renderCell(ctx) : start;
    const custom = rendered !== base;
    const wrapped = ellipsisWrap(ellipsis, rendered, !custom && typeof value === "string" ? value : void 0);
    const elided = applyElide(el, { value, node: wrapped, hasCustomRender: custom, column: c, row, path, raw: raw?.(value, c), ellipsis });
    const { node } = elided;
    let { title, onMouseEnter: measure } = elided;
    if (!stated && (isPath && rendered === start && el.tooltip === "native" || run?.start && renderers.get(c.name) && el.tooltip === "native" && !custom)) {
      const t = cellTitle(value);
      if (t !== void 0) {
        title = t;
        measure = void 0;
      }
    }
    const hoverEnter = onCellHover ? () => notifyHover(ctx) : void 0;
    const props = {
      ...title != null ? { title } : {},
      ...measure || hoverEnter ? { onMouseEnter: (e) => {
        measure?.(e);
        hoverEnter?.();
      } } : {},
      ...onCellHover ? { onMouseLeave: () => notifyHover(null) } : {}
    };
    return { node, props, value, style: { ...cellBase(c), ...indentStyle(c, indent) } };
  };
  const mergedCell = (m, c, d) => {
    const it = layout.items[displayOf[m.i]];
    const { node, props, value, style } = dataCell(it, c);
    const span = m.end - d + 1;
    coveredTo.set(c.name, m.end);
    const content = renderers.get(c.name)({
      value,
      column: c,
      rows: m.runRows.map((k) => rows[k]),
      span,
      offsets: m.runRows.map((k) => displayOf[k] - d),
      defaultNode: node,
      stickyTop: headH,
      path
    });
    const slot = `calc(100% / ${span})`;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "td",
      {
        rowSpan: span,
        "data-run": m.runRows.length,
        className: colStyles.get(c.name)?.cellClass,
        style: { ...style, overflow: "visible", verticalAlign: "top", position: "relative" },
        ...props,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": true, style: {
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${slot} - 1px), ${ROW_LINE} calc(${slot} - 1px), ${ROW_LINE} ${slot})`
          }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: {
            position: "absolute",
            left: 0,
            right: 0,
            height: slot,
            background: ROW_HOVER,
            top: `calc((var(--ft-hover, -10000) - ${d}) * 100% / ${span})`
          } }) }),
          content
        ]
      },
      c.name
    );
  };
  const trs = layout.items.map((it, d) => {
    const starts = merges.get(d);
    const cells = columns.map((c) => {
      const m = starts?.get(c.name);
      if (m) return mergedCell(m, c, d);
      if (covered(c.name, d)) return null;
      const st = colStyles.get(c.name);
      if (it.kind === "group") {
        const { group: g, depth, collapsed, size } = it;
        if (c.name !== g.column) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { style: cellBase(c), className: st?.cellClass }, c.name);
        return (
          // `ltr`: a header is toggle + label, not a value to clip from the start.
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { style: { ...cellBase(c), direction: "ltr", ...indentStyle(c, depth) }, className: st?.cellClass, ...g.title ? { title: g.title } : {}, children: groupLabel(g, collapsed, size) }, c.name)
        );
      }
      const { node, props, style } = dataCell(it, c);
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { style, className: st?.cellClass, ...props, children: node }, c.name);
    });
    return it.kind === "group" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tr", { "data-d": d, "data-group": it.group.key, "data-depth": it.depth, style: rowStyle, children: cells }, `group:${it.group.key}`) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tr", { "data-d": d, style: rowStyle, children: cells }, rowKey(it.i));
  });
  const crumbBar = crumbHost && crumbs.length > 0 && (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { "data-crumbs": "", style: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      zIndex: 2,
      fontWeight: 400,
      textAlign: "left",
      background: "var(--ft-run-bg, Canvas)",
      boxShadow: "0 3px 6px -3px rgba(0,0,0,0.5)"
    }, children: crumbs.map((g, k) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "div",
      {
        onClick: () => scrollToGroup(g),
        title: g.title ?? (typeof g.label === "string" ? g.label : void 0),
        style: {
          ...TD_STYLE,
          maxWidth: "none",
          cursor: "pointer",
          direction: "ltr",
          paddingLeft: `calc(0.6em + ${k * INDENT_EM}em)`,
          borderBottom: `1px solid ${ROW_LINE}`
        },
        children: groupLabel(g, false, g.end - g.start, () => toggleFold(g.key))
      },
      g.key
    )) }),
    crumbHost
  );
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tbody", { ref: tbody, "data-ft": id, onMouseMove, onMouseLeave: () => setHover(null), children: [
    trs,
    children,
    crumbBar
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
  return onSort ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", title: note, onClick: (e) => {
    e.stopPropagation();
    onSort();
  }, style: { ...style, cursor: "pointer" }, children: "sort for tree" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { title: note, style, children: "tree needs sort" });
}

// src/renderers/columnResize.tsx
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
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
  const [value, setValue] = (0, import_react5.useState)(() => readLS(key) ?? initial);
  (0, import_react5.useEffect)(() => {
    setValue(readLS(key) ?? initial);
  }, [key, initial]);
  (0, import_react5.useEffect)(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e) => {
      if (e.key === key) setValue(e.newValue ?? initial);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initial]);
  const set = (0, import_react5.useCallback)((v) => {
    writeLS(key, v);
    setValue(v);
  }, [key]);
  return [value, set];
}
function useColumnWidths({ on, scope, columns, path, usePersistedState }) {
  const use = usePersistedState ?? defaultUseState;
  const [urlRaw, setUrlRaw] = use("cw", "");
  const lsKey = (0, import_react5.useMemo)(() => `ft-colw:${scopeKey(scope, columns, path)}`, [scope, columns, path]);
  const [lsRaw, setLsRaw] = useLocalStorageString(lsKey, "");
  const onPath = scope === "path";
  const raw = onPath ? urlRaw : lsRaw;
  const setRaw = onPath ? setUrlRaw : setLsRaw;
  const persisted = (0, import_react5.useMemo)(() => parseWidths(raw), [raw]);
  const persistedRef = (0, import_react5.useRef)(persisted);
  persistedRef.current = persisted;
  const [drag, setDrag] = (0, import_react5.useState)(null);
  const commit = (0, import_react5.useCallback)((col, w) => {
    const m = new Map(persistedRef.current);
    m.set(col, Math.max(MIN_WIDTH, w));
    setRaw(serializeWidths(m));
  }, [setRaw]);
  const startResize = (0, import_react5.useCallback)((col, e) => {
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
  const autoFit = (0, import_react5.useCallback)((col, e) => {
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
  const styleFor = (0, import_react5.useCallback)((col) => {
    if (!on) return NO_STYLE;
    const w = drag && drag.col === col ? drag.w : persisted.get(col);
    return w == null ? NO_STYLE : { width: w, minWidth: w, maxWidth: w };
  }, [on, drag, persisted]);
  return (0, import_react5.useMemo)(() => ({ styleFor, startResize, autoFit }), [styleFor, startResize, autoFit]);
}
function ColumnResizeHandle({ col, widths }) {
  const [hot, setHot] = (0, import_react5.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
var import_jsx_runtime6 = require("react/jsx-runtime");
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
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: 0.4 }, children: "null" });
  }
  if (value instanceof Uint8Array) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: 0.6 }, children: `<${value.byteLength} bytes>` });
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
  groups,
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
  const [result, setResult] = (0, import_react6.useState)(null);
  const [error, setError] = (0, import_react6.useState)(null);
  const [loading, setLoading] = (0, import_react6.useState)(false);
  const active = (0, import_react6.useMemo)(
    () => objects.find((o) => o.name === table) ?? objects[0] ?? null,
    [objects, table]
  );
  const source = (0, import_react6.useMemo)(
    () => active ? catalog.source(active.name) : null,
    [catalog, active]
  );
  const can = source?.capabilities;
  const columns = result?.columns ?? [];
  const { visible, ...vis } = useColumnVisibility(columns, usePersistedState, hiddenColumns);
  (0, import_react6.useEffect)(() => {
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
  const lastQueryKey = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    if (lastQueryKey.current !== null && lastQueryKey.current !== queryKey) setPage(0);
    lastQueryKey.current = queryKey;
  }, [queryKey, setPage]);
  const rows = result?.rows ?? [];
  const total = result?.total ?? null;
  const pageStart = result?.offset ?? 0;
  const unfilteredTotals = (0, import_react6.useRef)(/* @__PURE__ */ new Map());
  if (active && !filter.trim() && total !== null) unfilteredTotals.current.set(active.name, total);
  const unfilteredTotal = active ? unfilteredTotals.current.get(active.name) : void 0;
  const el = (0, import_react6.useMemo)(() => resolveElide(elide), [elide]);
  const cw = useColumnWidths({
    on: !!resizableColumns,
    scope: typeof resizableColumns === "object" ? resizableColumns.scope ?? "path" : "path",
    columns,
    path,
    usePersistedState
  });
  const colStyles = (0, import_react6.useMemo)(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, (c) => NUMERIC_KINDS.has(c.kind), el),
    [columns, path, cellProps, headerProps, el]
  );
  const pageCtxRef = (0, import_react6.useRef)({ rows: [], columns: [], path, pageStart: 0, totalRows: null });
  pageCtxRef.current = {
    rows,
    columns: columns.filter((c) => visible.includes(c.name)),
    path,
    pageStart,
    totalRows: total
  };
  usePageNotify(onPage, pageCtxRef, [rows, visible, path, pageStart, total]);
  if (!objects.length) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { opacity: 0.6 }, children: "no tables or views in this file" });
  const lastPage = total === null ? null : Math.max(0, Math.ceil(total / pageSize) - 1);
  const shown = columns.filter((c) => visible.includes(c.name));
  const pathNotes = paths ? pathModes(rows, shown, paths).notes : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: {
      opacity: 0.85,
      fontSize: "0.95em",
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      flexWrap: "wrap",
      position: "relative",
      zIndex: 2
    }, children: [
      objects.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "select",
        {
          value: active?.name ?? "",
          onChange: (e) => setTable(e.target.value),
          "aria-label": "Table",
          style: { ...BTN2, cursor: "pointer" },
          children: objects.map((o) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: o.name, children: [
            o.name,
            o.type === "view" ? " (view)" : ""
          ] }, o.name))
        }
      ),
      result && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { opacity: 0.7 }, children: [
        plural(total ?? rows.length, "row"),
        total !== null && total > 0 && ` \xB7 ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}`
      ] }),
      can?.filter && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        FilterInput,
        {
          value: filter,
          onChange: setFilter,
          placeholder: "filter",
          ...total !== null && unfilteredTotal !== void 0 ? { count: { shown: total, total: unfilteredTotal } } : {}
        }
      ),
      columnPicker && columns.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColumnPicker, { columns, vis: { visible, ...vis } }),
      loading && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: 0.5 }, children: "\u2026" }),
      status
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: { color: "crimson", fontSize: "0.9em" }, children: error.message }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: "0.82em", fontFamily: "ui-monospace, monospace" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { style: {
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas"
      }, children: shown.map((c) => {
        const styles = colStyles.get(c.name);
        const label = can?.sort ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "span",
          {
            onClick: () => sort.toggle(c.name),
            style: { cursor: "pointer", userSelect: "none" },
            title: `Sort by ${c.name}`,
            children: [
              c.name,
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: sort.column === c.name ? 0.9 : 0.3 }, children: sortGlyph(c.name, sort) })
            ]
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: c.name });
        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "th",
          {
            style: { ...styles?.header ?? TH_STYLE, ...resizableColumns ? { position: "relative" } : {}, ...cw.styleFor(c.name) },
            ...styles?.headerClass ? { className: styles.headerClass } : {},
            children: [
              renderHeader ? renderHeader({ column: c, path, defaultNode: label }) : label,
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(PathNote, { note: pathNotes?.get(c.name), onSort: can?.sort ? () => sort.toggle(c.name) : void 0 }),
              resizableColumns && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColumnResizeHandle, { col: c.name, widths: cw })
            ]
          },
          c.name
        );
      }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
          ...groups ? { groups } : {},
          ...usePersistedState ? { usePersistedState } : {},
          ...renderCell ? { renderCell } : {},
          defaultNode: defaultTableCell,
          rowIndex: (i) => pageStart + i,
          rowKey: (i) => pageStart + i,
          rowStyle: ROW_STYLE,
          ...onCellHover ? { onCellHover } : {},
          children: result && rows.length === 0 && !loading && !error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { colSpan: Math.max(1, shown.length), style: { ...TD_STYLE, opacity: 0.6 }, children: filter.trim() ? "no rows match" : "no rows" }) })
        }
      )
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginTop: "0.6em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: BTN2, disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039 prev" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { opacity: 0.7, fontSize: "0.85em" }, children: can?.randomAccess === false ? `rows ${(pageStart + 1).toLocaleString()}\u2013${(pageStart + rows.length).toLocaleString()}` : `page ${(page + 1).toLocaleString()}${lastPage !== null ? ` / ${(lastPage + 1).toLocaleString()}` : ""}` }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
var import_jsx_runtime7 = require("react/jsx-runtime");
var OBJECTS = [{ name: "rows", type: "table" }];
function RowsTable({
  rows,
  columns,
  sortComparators,
  path = "rows",
  usePersistedState,
  ...browser
}) {
  const catalog = (0, import_react7.useMemo)(
    () => singleTableCatalog("rows", memoryTableSource(rows, {
      ...columns ? { columns } : {},
      ...sortComparators ? { sortComparators } : {}
    })),
    [rows, columns, sortComparators]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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

// src/renderers/jsonl.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var JSONL_MAX_BYTES = 16 * 1024 * 1024;
var JSONL_MAX_ROWS = 1e4;
var TEXT_SHOW_BYTES = 1024 * 1024;
function cell(v) {
  return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
}
function parseJsonl(text, opts = {}) {
  const maxRows = opts.maxRows ?? JSONL_MAX_ROWS;
  const rows = [];
  const errors = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (rows.length >= maxRows) return { rows, errors, truncated: true };
    let v;
    try {
      v = JSON.parse(line);
    } catch (e) {
      errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    rows.push(v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cell(x)])) : { value: cell(v) });
  }
  return { rows, errors, truncated: false };
}
async function load(store, path, maxBytes) {
  const r = await store.get(path, store.capabilities?.range ? { offset: 0, length: maxBytes } : void 0);
  const total = r.totalSize ?? r.bytes.byteLength;
  if (total <= maxBytes && r.bytes.byteLength <= maxBytes) return { text: new TextDecoder().decode(r.bytes), bytes: r.bytes.byteLength };
  const head = r.bytes.subarray(0, Math.min(r.bytes.byteLength, maxBytes));
  const nl = head.lastIndexOf(10);
  const kept = nl >= 0 ? head.subarray(0, nl + 1) : head;
  return { text: new TextDecoder().decode(kept), bytes: kept.byteLength, total };
}
function makeJsonlViewer(opts = {}) {
  return function BoundJsonlViewer(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(JsonlViewer, { ...props, ...opts });
  };
}
function JsonlViewer({ store, path, usePersistedState, maxBytes = JSONL_MAX_BYTES, maxRows = JSONL_MAX_ROWS, elide = true, ...table }) {
  const [loaded, setLoaded] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)(null);
  const [mode, setMode] = (0, import_react8.useState)("table");
  (0, import_react8.useEffect)(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    load(store, path, maxBytes).then((l) => {
      if (!cancelled) setLoaded(l);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, maxBytes]);
  const parsed = (0, import_react8.useMemo)(() => loaded ? parseJsonl(loaded.text, { maxRows }) : null, [loaded, maxRows]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!loaded || !parsed) return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  const notes = [];
  if (loaded.total != null) notes.push(`read the first ${fmtSize(loaded.bytes)} of ${fmtSize(loaded.total)}`);
  if (parsed.truncated) notes.push(`kept the first ${maxRows.toLocaleString()} records`);
  if (parsed.errors.length) {
    const first = parsed.errors[0];
    notes.push(`${parsed.errors.length.toLocaleString()} line${parsed.errors.length === 1 ? "" : "s"} didn't parse (line ${first.line}: ${first.message})`);
  }
  const shownText = loaded.text.length > TEXT_SHOW_BYTES ? loaded.text.slice(0, TEXT_SHOW_BYTES) : loaded.text;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "rdub-file-tree-jsonl", "data-path": path, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", margin: "0 0 0.5em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { role: "group", "aria-label": "JSONL view", style: { display: "inline-flex", gap: "0.25em" }, children: ["table", "text"].map((m) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          "aria-pressed": mode === m,
          onClick: () => setMode(m),
          style: { ...BTN2, ...mode === m ? { background: "rgba(74,158,255,0.25)" } : {} },
          children: m === "table" ? "Table" : "Text"
        },
        m
      )) }),
      notes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { "data-testid": "jsonl-notes", style: { fontSize: "0.85em", opacity: 0.75 }, children: notes.join(" \xB7 ") })
    ] }),
    mode === "table" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(RowsTable, { rows: parsed.rows, path, elide, ...usePersistedState ? { usePersistedState } : {}, ...table }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("pre", { style: {
      background: "rgba(127,127,127,0.08)",
      padding: "0.6em 0.8em",
      borderRadius: 4,
      overflow: "auto",
      maxHeight: "80vh",
      fontSize: "0.85em",
      fontFamily: "ui-monospace, monospace",
      margin: 0
    }, children: [
      shownText,
      shownText.length < loaded.text.length ? "\n\u2026" : ""
    ] })
  ] });
}
var jsonl_default = JsonlViewer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  JSONL_MAX_BYTES,
  JSONL_MAX_ROWS,
  JsonlViewer,
  makeJsonlViewer,
  parseJsonl
});
//# sourceMappingURL=jsonl.cjs.map