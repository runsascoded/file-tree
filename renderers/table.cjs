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

// src/renderers/table.ts
var table_exports = {};
__export(table_exports, {
  ELIDE_DEFAULTS: () => ELIDE_DEFAULTS,
  NUMERIC_ALIGN: () => NUMERIC_ALIGN,
  TD_STYLE: () => TD_STYLE,
  TH_STYLE: () => TH_STYLE,
  applyElide: () => applyElide,
  cellTitle: () => cellTitle,
  elideCellStyle: () => elideCellStyle,
  resolveColStyles: () => resolveColStyles,
  resolveElide: () => resolveElide
});
module.exports = __toCommonJS(table_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ELIDE_DEFAULTS,
  NUMERIC_ALIGN,
  TD_STYLE,
  TH_STYLE,
  applyElide,
  cellTitle,
  elideCellStyle,
  resolveColStyles,
  resolveElide
});
//# sourceMappingURL=table.cjs.map