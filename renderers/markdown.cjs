"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/renderers/markdown.tsx
var markdown_exports = {};
__export(markdown_exports, {
  renderMarkdown: () => renderMarkdown
});
module.exports = __toCommonJS(markdown_exports);
var import_react_markdown = __toESM(require("react-markdown"), 1);
var import_remark_gfm = __toESM(require("remark-gfm"), 1);

// src/react/markdownLinks.ts
function isPlainClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

// src/renderers/markdown.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function renderMarkdown(source, ctx) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "markdown-body", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_react_markdown.default,
    {
      remarkPlugins: [import_remark_gfm.default],
      ...ctx ? {
        components: {
          a: ({ node: _node, href, ...props }) => {
            if (href === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { ...props });
            const { href: to, internal } = ctx.resolveHref(href);
            const onClick = internal ? (e) => {
              if (isPlainClick(e)) {
                e.preventDefault();
                ctx.navigate(to);
              }
            } : void 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { ...props, href: to, ...onClick ? { onClick } : {} });
          },
          img: ({ node: _node, src, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { ...props, ...typeof src === "string" ? { src: ctx.resolveSrc(src) } : {} })
        }
      } : {},
      children: source
    }
  ) });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  renderMarkdown
});
//# sourceMappingURL=markdown.cjs.map