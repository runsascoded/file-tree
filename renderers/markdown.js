// src/renderers/markdown.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { jsx } from "react/jsx-runtime";
function renderMarkdown(source) {
  return /* @__PURE__ */ jsx("div", { className: "markdown-body", children: /* @__PURE__ */ jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: source }) });
}
export {
  renderMarkdown
};
//# sourceMappingURL=markdown.js.map