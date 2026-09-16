// src/renderers/table.ts
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
function isDitto(dittoCols, column, value, prevValue, rowInPage) {
  return dittoCols !== void 0 && rowInPage > 0 && dittoCols.has(column) && Object.is(value, prevValue);
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
export {
  ELIDE_DEFAULTS,
  MIDDLE_TAIL,
  NUMERIC_ALIGN,
  TD_STYLE,
  TH_STYLE,
  applyElide,
  cellClipped,
  cellTitle,
  elideCellStyle,
  isDitto,
  resolveColStyles,
  resolveElide
};
//# sourceMappingURL=table.js.map