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

// src/renderers/tableRuns.ts
var tableRuns_exports = {};
__export(tableRuns_exports, {
  TREE_FALLBACK_NOTE: () => TREE_FALLBACK_NOTE,
  computeRuns: () => computeRuns,
  isSortedBy: () => isSortedBy,
  normalizeDitto: () => normalizeDitto,
  normalizePaths: () => normalizePaths,
  pathModes: () => pathModes,
  runKey: () => runKey,
  schemeLength: () => schemeLength,
  sharedPathPrefix: () => sharedPathPrefix,
  splitParent: () => splitParent,
  tableLayout: () => tableLayout
});
module.exports = __toCommonJS(tableRuns_exports);

// src/renderers/tableSort.ts
var import_react2 = require("react");

// src/react/persistedState.ts
var import_react = require("react");

// src/renderers/tableSort.ts
var DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TREE_FALLBACK_NOTE,
  computeRuns,
  isSortedBy,
  normalizeDitto,
  normalizePaths,
  pathModes,
  runKey,
  schemeLength,
  sharedPathPrefix,
  splitParent,
  tableLayout
});
//# sourceMappingURL=tableRuns.cjs.map