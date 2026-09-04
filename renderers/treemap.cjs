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

// src/renderers/treemap.tsx
var treemap_exports = {};
__export(treemap_exports, {
  TreeMapView: () => TreeMapView,
  brushBold: () => brushBold,
  brushRing: () => brushRing,
  brushSpotlight: () => brushSpotlight
});
module.exports = __toCommonJS(treemap_exports);
var import_react = require("react");
var import_treemap = require("@rdub/treemap");

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/treemap.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var RING = "#ffffff";
var OUTSET = false;
var SELECTED_ACCENT = "#4a9eff";
function tintFill(s, accent, pct) {
  return s.bg ? `color-mix(in oklch, ${s.bg}, ${accent} ${pct}%)` : accent;
}
var brushRing = (s, { role }) => role === "selected" ? { ...s, bg: tintFill(s, SELECTED_ACCENT, 30), ink: RING, ring: { color: RING, width: 5, inset: OUTSET }, opacity: 1 } : role === "hovered" ? { ...s, bg: tintFill(s, RING, 14), ink: RING, ring: { color: RING, width: 3, inset: OUTSET }, opacity: 1 } : null;
var brushSpotlight = (s, { role }) => role === "selected" ? { ...s, ring: { color: RING, width: 5, inset: OUTSET }, opacity: 1 } : role === "hovered" ? { ...s, ring: { color: RING, width: 3, inset: OUTSET }, opacity: 1 } : { ...s, opacity: 0.22 };
var brushBold = (s, { role }) => role === "selected" ? { ...s, ring: { color: RING, width: 7, inset: OUTSET } } : role === "hovered" ? { ...s, ring: { color: RING, width: 4, inset: OUTSET } } : null;
function TreeMapView({ source, path = "", rootLabel = "root", height = "70vh", highlightedPath, selectedPath, onSelectPath, onHoverPath, brushStyle = brushRing, className, style }) {
  const norm = path.replace(/^\/+|\/+$/g, "");
  const [root, setRoot] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const kids = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    setRoot(null);
    setError(null);
    kids.current = /* @__PURE__ */ new Map();
    source.children({ path: norm }).then(
      (level) => {
        if (cancelled) return;
        kids.current.set(level.node.path, level.children);
        setRoot(level.node);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [source, norm]);
  const accessors = (0, import_react.useMemo)(() => ({
    getSize: (n) => n.size ?? 0,
    getChildren: (n) => kids.current.get(n.path),
    hasChildren: (n) => n.kind === "dir" && (n.nChildren ?? 1) > 0,
    loadChildren: async (n) => {
      const level = await source.children({ path: n.path });
      kids.current.set(n.path, level.children);
      return level.children;
    },
    getId: (n) => n.path,
    getLabel: (n) => n.name || rootLabel
  }), [source, rootLabel]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { opacity: 0.7 }, children: [
    "Treemap unavailable: ",
    error.message
  ] });
  if (!root) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.7 }, children: "Loading treemap\u2026" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className, style: { height, ...style }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_treemap.Treemap,
    {
      root,
      formatSize: fmtSize,
      lens: selectedPath == null && highlightedPath == null ? void 0 : (n, _path, _depth, _ctx, s) => {
        const role = selectedPath != null && n.path === selectedPath ? "selected" : highlightedPath != null && n.path === highlightedPath ? "hovered" : "other";
        return brushStyle(s, { role, node: n });
      },
      onCellClick: onSelectPath == null ? void 0 : (n) => {
        if (n.kind === "dir") return;
        onSelectPath(n.path === selectedPath ? null : n.path);
        return true;
      },
      onCellHover: onHoverPath == null ? void 0 : (n) => onHoverPath(n ? n.path : null),
      remainderTail: 0.2,
      minCellSide: 24,
      ...accessors
    }
  ) });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TreeMapView,
  brushBold,
  brushRing,
  brushSpotlight
});
//# sourceMappingURL=treemap.cjs.map