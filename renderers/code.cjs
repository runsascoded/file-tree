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

// src/renderers/code.tsx
var code_exports = {};
__export(code_exports, {
  renderCode: () => renderCode
});
module.exports = __toCommonJS(code_exports);
var import_core = __toESM(require("highlight.js/lib/core"), 1);
var import_bash = __toESM(require("highlight.js/lib/languages/bash"), 1);
var import_c = __toESM(require("highlight.js/lib/languages/c"), 1);
var import_cpp = __toESM(require("highlight.js/lib/languages/cpp"), 1);
var import_css = __toESM(require("highlight.js/lib/languages/css"), 1);
var import_go = __toESM(require("highlight.js/lib/languages/go"), 1);
var import_ini = __toESM(require("highlight.js/lib/languages/ini"), 1);
var import_java = __toESM(require("highlight.js/lib/languages/java"), 1);
var import_javascript = __toESM(require("highlight.js/lib/languages/javascript"), 1);
var import_python = __toESM(require("highlight.js/lib/languages/python"), 1);
var import_ruby = __toESM(require("highlight.js/lib/languages/ruby"), 1);
var import_rust = __toESM(require("highlight.js/lib/languages/rust"), 1);
var import_scss = __toESM(require("highlight.js/lib/languages/scss"), 1);
var import_sql = __toESM(require("highlight.js/lib/languages/sql"), 1);
var import_typescript = __toESM(require("highlight.js/lib/languages/typescript"), 1);
var import_xml = __toESM(require("highlight.js/lib/languages/xml"), 1);
var import_yaml = __toESM(require("highlight.js/lib/languages/yaml"), 1);
var import_github_dark = require("highlight.js/styles/github-dark.css");
var import_jsx_runtime = require("react/jsx-runtime");
import_core.default.registerLanguage("bash", import_bash.default);
import_core.default.registerLanguage("c", import_c.default);
import_core.default.registerLanguage("cpp", import_cpp.default);
import_core.default.registerLanguage("css", import_css.default);
import_core.default.registerLanguage("go", import_go.default);
import_core.default.registerLanguage("html", import_xml.default);
import_core.default.registerLanguage("ini", import_ini.default);
import_core.default.registerLanguage("java", import_java.default);
import_core.default.registerLanguage("javascript", import_javascript.default);
import_core.default.registerLanguage("jsx", import_javascript.default);
import_core.default.registerLanguage("python", import_python.default);
import_core.default.registerLanguage("ruby", import_ruby.default);
import_core.default.registerLanguage("rust", import_rust.default);
import_core.default.registerLanguage("scss", import_scss.default);
import_core.default.registerLanguage("sql", import_sql.default);
import_core.default.registerLanguage("toml", import_ini.default);
import_core.default.registerLanguage("typescript", import_typescript.default);
import_core.default.registerLanguage("tsx", import_typescript.default);
import_core.default.registerLanguage("yaml", import_yaml.default);
function renderCode(source, lang) {
  const html = import_core.default.getLanguage(lang) ? import_core.default.highlight(source, { language: lang, ignoreIllegals: true }).value : import_core.default.highlightAuto(source).value;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: {
    background: "rgba(127,127,127,0.08)",
    padding: "0.6em 0.8em",
    borderRadius: 4,
    overflow: "auto",
    maxHeight: "80vh",
    fontSize: "0.85em",
    fontFamily: "ui-monospace, monospace",
    margin: 0
  }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: `hljs language-${lang}`, dangerouslySetInnerHTML: { __html: html } }) });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  renderCode
});
//# sourceMappingURL=code.cjs.map