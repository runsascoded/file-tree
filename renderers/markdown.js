// src/renderers/markdown.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// src/react/markdownLinks.ts
function isPlainClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

// src/renderers/markdown.tsx
import { jsx } from "react/jsx-runtime";
function renderMarkdown(source, ctx) {
  return /* @__PURE__ */ jsx("div", { className: "markdown-body", children: /* @__PURE__ */ jsx(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm],
      ...ctx ? {
        components: {
          a: ({ node: _node, href, ...props }) => {
            if (href === void 0) return /* @__PURE__ */ jsx("a", { ...props });
            const { href: to, internal } = ctx.resolveHref(href);
            const onClick = internal ? (e) => {
              if (isPlainClick(e)) {
                e.preventDefault();
                ctx.navigate(to);
              }
            } : void 0;
            return /* @__PURE__ */ jsx("a", { ...props, href: to, ...onClick ? { onClick } : {} });
          },
          img: ({ node: _node, src, ...props }) => /* @__PURE__ */ jsx("img", { ...props, ...typeof src === "string" ? { src: ctx.resolveSrc(src) } : {} })
        }
      } : {},
      children: source
    }
  ) });
}
export {
  renderMarkdown
};
//# sourceMappingURL=markdown.js.map