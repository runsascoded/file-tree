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

// src/renderers/ditto.tsx
var ditto_exports = {};
__export(ditto_exports, {
  dimPathNode: () => dimPathNode,
  dimmedPath: () => dimmedPath,
  dittoMark: () => dittoMark,
  dittoRenderer: () => dittoRenderer,
  runLine: () => runLine,
  runRenderer: () => runRenderer,
  treeChildNode: () => treeChildNode
});
module.exports = __toCommonJS(ditto_exports);

// src/renderers/table.ts
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

// src/renderers/tableSort.ts
var import_react2 = require("react");

// src/react/persistedState.ts
var import_react = require("react");

// src/renderers/tableSort.ts
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;

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
function isList(o) {
  return Array.isArray(o);
}
var isEmpty = (v) => v === null || v === void 0 || v === "";
function runKey(spec, value, row) {
  if (isEmpty(value)) return void 0;
  const k = spec.key ? spec.key(value, row) : value;
  return k === null ? void 0 : k;
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

// src/renderers/ditto.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function dittoMark(value) {
  const title = cellTitle(value);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-label": "ditto", ...title != null ? { title } : {}, style: { opacity: 0.3, display: "block", textAlign: "center" }, children: "\u3003" });
}
var RULE = "1px solid currentColor";
function runLine(value, end, head = "tick") {
  const title = cellTitle(value);
  const rule = !end ? { top: "-0.2em", bottom: "-0.2em", borderLeft: RULE } : head === "tick" ? { top: "-0.2em", height: "calc(0.2em + 0.5lh)", width: "0.6em", borderLeft: RULE, borderBottom: RULE } : { top: "-0.2em", height: "calc(0.2em + 0.4lh)", borderLeft: RULE };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      "aria-label": end ? "run end" : "run",
      ...title != null ? { title } : {},
      style: { display: "block", position: "relative" },
      children: [
        "\xA0",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { position: "absolute", left: "0.3em", opacity: 0.35, ...rule } }),
        end && head === "arrow" && // A CSS triangle centered on the rule, picking up where it ends.
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: DIM }, children: path.slice(0, shared) }),
    path.slice(shared)
  ] });
}
function dimPathNode(path, above) {
  return dimmedPath(path, typeof above === "string" ? sharedPathPrefix(path, above) : 0);
}
function treeChildNode(parent, tail, last) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": true, style: { opacity: DIM, whiteSpace: "pre" }, children: last ? "\u2514 " : "\u251C " }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 0 }, children: parent }),
    tail
  ] });
}
var RULE_X = "0.9em";
var pct = (x, span) => `${x / span * 100}%`;
function arrowhead(top, key) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-label": "ditto", style: {
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-label": mode === "line" ? "run line" : "run arrow", style: {
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
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": true, style: { position: "absolute", inset: 0, pointerEvents: "none" }, children: deco }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dimPathNode,
  dimmedPath,
  dittoMark,
  dittoRenderer,
  runLine,
  runRenderer,
  treeChildNode
});
//# sourceMappingURL=ditto.cjs.map