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
import { jsx } from "react/jsx-runtime";
function dittoMark(value) {
  const title = cellTitle(value);
  return /* @__PURE__ */ jsx("span", { "aria-label": "ditto", ...title != null ? { title } : {}, style: { opacity: 0.3, display: "block", textAlign: "center" }, children: "\u3003" });
}
function dittoRenderer(columns) {
  const cols = new Set(columns);
  return (ctx) => {
    const { value } = ctx;
    const empty = value == null || value === "";
    return !empty && cols.has(ctx.column.name) && repeatsAbove(ctx) ? dittoMark(value) : ctx.defaultNode;
  };
}
export {
  dittoMark,
  dittoRenderer
};
//# sourceMappingURL=ditto.js.map