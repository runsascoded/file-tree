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

// src/renderers/columnResize.tsx
var columnResize_exports = {};
__export(columnResize_exports, {
  ColumnResizeHandle: () => ColumnResizeHandle,
  parseWidths: () => parseWidths,
  serializeWidths: () => serializeWidths,
  useColumnWidths: () => useColumnWidths
});
module.exports = __toCommonJS(columnResize_exports);
var import_react2 = require("react");

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

// src/renderers/columnResize.tsx
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ColumnResizeHandle,
  parseWidths,
  serializeWidths,
  useColumnWidths
});
//# sourceMappingURL=columnResize.cjs.map