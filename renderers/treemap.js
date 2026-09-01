// src/renderers/treemap.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Treemap } from "@disk-tree/react";

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/renderers/treemap.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function TreeMapView({ source, path = "", rootLabel = "root", height = "70vh", className, style }) {
  const norm = path.replace(/^\/+|\/+$/g, "");
  const [root, setRoot] = useState(null);
  const [error, setError] = useState(null);
  const kids = useRef(/* @__PURE__ */ new Map());
  useEffect(() => {
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
  const accessors = useMemo(() => ({
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
  if (error) return /* @__PURE__ */ jsxs("div", { style: { opacity: 0.7 }, children: [
    "Treemap unavailable: ",
    error.message
  ] });
  if (!root) return /* @__PURE__ */ jsx("div", { style: { opacity: 0.7 }, children: "Loading treemap\u2026" });
  return /* @__PURE__ */ jsx("div", { className, style: { height, ...style }, children: /* @__PURE__ */ jsx(
    Treemap,
    {
      root,
      formatSize: fmtSize,
      remainderTail: 0.2,
      minCellSide: 24,
      ...accessors
    }
  ) });
}
export {
  TreeMapView
};
//# sourceMappingURL=treemap.js.map