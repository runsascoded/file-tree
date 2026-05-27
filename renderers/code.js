// src/renderers/code.tsx
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import "highlight.js/styles/github-dark.css";
import { jsx } from "react/jsx-runtime";
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("yaml", yaml);
function renderCode(source, lang) {
  const html = hljs.getLanguage(lang) ? hljs.highlight(source, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(source).value;
  return /* @__PURE__ */ jsx("pre", { style: {
    background: "rgba(127,127,127,0.08)",
    padding: "0.6em 0.8em",
    borderRadius: 4,
    overflow: "auto",
    maxHeight: "80vh",
    fontSize: "0.85em",
    fontFamily: "ui-monospace, monospace",
    margin: 0
  }, children: /* @__PURE__ */ jsx("code", { className: `hljs language-${lang}`, dangerouslySetInnerHTML: { __html: html } }) });
}
export {
  renderCode
};
//# sourceMappingURL=code.js.map