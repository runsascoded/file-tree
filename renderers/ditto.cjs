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
  dittoMark: () => dittoMark,
  dittoRenderer: () => dittoRenderer
});
module.exports = __toCommonJS(ditto_exports);

// src/renderers/table.ts
function repeatsAbove(ctx) {
  const above = ctx.at(-1);
  return above !== void 0 && Object.is(ctx.value, above[ctx.column.name]);
}
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

// src/renderers/ditto.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function dittoMark(value) {
  const title = cellTitle(value);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-label": "ditto", ...title != null ? { title } : {}, style: { opacity: 0.3, display: "block", textAlign: "center" }, children: "\u3003" });
}
function dittoRenderer(columns) {
  const cols = new Set(columns);
  return (ctx) => {
    const { value } = ctx;
    const empty = value == null || value === "";
    return !empty && cols.has(ctx.column.name) && repeatsAbove(ctx) ? dittoMark(value) : ctx.defaultNode;
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dittoMark,
  dittoRenderer
});
//# sourceMappingURL=ditto.cjs.map