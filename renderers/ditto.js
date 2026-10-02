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
import { useCallback, useMemo } from "react";

// src/react/persistedState.ts
import { useState } from "react";

// src/renderers/tableSort.ts
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;

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
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function dittoMark(value) {
  const title = cellTitle(value);
  return /* @__PURE__ */ jsx("span", { "aria-label": "ditto", ...title != null ? { title } : {}, style: { opacity: 0.3, display: "block", textAlign: "center" }, children: "\u3003" });
}
var RULE = "1px solid currentColor";
function runLine(value, end, head = "tick") {
  const title = cellTitle(value);
  const rule = !end ? { top: "-0.2em", bottom: "-0.2em", borderLeft: RULE } : head === "tick" ? { top: "-0.2em", height: "calc(0.2em + 0.5lh)", width: "0.6em", borderLeft: RULE, borderBottom: RULE } : { top: "-0.2em", height: "calc(0.2em + 0.4lh)", borderLeft: RULE };
  return /* @__PURE__ */ jsxs(
    "span",
    {
      "aria-label": end ? "run end" : "run",
      ...title != null ? { title } : {},
      style: { display: "block", position: "relative" },
      children: [
        "\xA0",
        /* @__PURE__ */ jsx("span", { style: { position: "absolute", left: "0.3em", opacity: 0.35, ...rule } }),
        end && head === "arrow" && // A CSS triangle centered on the rule, picking up where it ends.
        /* @__PURE__ */ jsx("span", { style: {
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
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("span", { style: { opacity: DIM }, children: path.slice(0, shared) }),
    path.slice(shared)
  ] });
}
function dimPathNode(path, above) {
  return dimmedPath(path, typeof above === "string" ? sharedPathPrefix(path, above) : 0);
}
function treeChildNode(parent, tail, last) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("span", { "aria-hidden": true, style: { opacity: DIM, whiteSpace: "pre" }, children: last ? "\u2514 " : "\u251C " }),
    /* @__PURE__ */ jsx("span", { style: { fontSize: 0 }, children: parent }),
    tail
  ] });
}
export {
  dimPathNode,
  dimmedPath,
  dittoMark,
  dittoRenderer,
  runLine,
  treeChildNode
};
//# sourceMappingURL=ditto.js.map