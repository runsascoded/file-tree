// src/renderers/notebook.tsx
import { useEffect, useState } from "react";

// src/renderers/markdown.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { jsx } from "react/jsx-runtime";
function renderMarkdown(source) {
  return /* @__PURE__ */ jsx("div", { className: "markdown-body", children: /* @__PURE__ */ jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: source }) });
}

// src/renderers/notebook.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function asString(src) {
  return Array.isArray(src) ? src.join("") : src;
}
function NotebookViewer({ store, path }) {
  const [nb, setNb] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setNb(null);
    setError(null);
    store.get(path).then((r) => {
      if (cancelled) return;
      const text = new TextDecoder().decode(r.bytes);
      try {
        setNb(JSON.parse(text));
      } catch (e) {
        setError(String(e));
      }
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  if (error) return /* @__PURE__ */ jsxs("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!nb) return /* @__PURE__ */ jsx2("div", { style: { opacity: 0.6 }, children: "loading notebook\u2026" });
  return /* @__PURE__ */ jsxs("div", { className: "rdub-file-tree-notebook", children: [
    nb.metadata?.kernelspec?.display_name && /* @__PURE__ */ jsxs("p", { style: { fontSize: "0.85em", opacity: 0.65, margin: "0 0 0.8em" }, children: [
      "kernel: ",
      /* @__PURE__ */ jsx2("code", { children: nb.metadata.kernelspec.display_name })
    ] }),
    nb.cells.map((cell, i) => /* @__PURE__ */ jsx2(CellView, { cell }, i))
  ] });
}
function CellView({ cell }) {
  if (cell.cell_type === "markdown") {
    return /* @__PURE__ */ jsx2("div", { style: { margin: "0.8em 0" }, children: renderMarkdown(asString(cell.source)) });
  }
  if (cell.cell_type === "code") {
    const code = cell;
    return /* @__PURE__ */ jsxs("div", { style: { margin: "0.8em 0" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "0.5em", alignItems: "flex-start" }, children: [
        /* @__PURE__ */ jsxs("code", { style: { flexShrink: 0, opacity: 0.5, fontSize: "0.8em", paddingTop: "0.7em", minWidth: "3em", textAlign: "right" }, children: [
          "[",
          code.execution_count ?? " ",
          "]:"
        ] }),
        /* @__PURE__ */ jsx2("pre", { style: {
          flex: 1,
          background: "rgba(64, 96, 160, 0.08)",
          padding: "0.6em 0.8em",
          borderRadius: 4,
          overflow: "auto",
          fontSize: "0.85em",
          fontFamily: "ui-monospace, monospace",
          margin: 0,
          whiteSpace: "pre-wrap"
        }, children: asString(code.source) })
      ] }),
      code.outputs?.map((o, i) => /* @__PURE__ */ jsx2(OutputView, { output: o }, i))
    ] });
  }
  if (cell.cell_type === "raw") {
    return /* @__PURE__ */ jsx2("pre", { style: { margin: "0.8em 0", fontSize: "0.85em", opacity: 0.7 }, children: asString(cell.source) });
  }
  return null;
}
function OutputView({ output }) {
  const baseStyle = {
    background: "rgba(127,127,127,0.05)",
    padding: "0.4em 0.8em",
    margin: "0.2em 0 0.2em 3.5em",
    borderRadius: 4,
    fontSize: "0.82em",
    fontFamily: "ui-monospace, monospace",
    whiteSpace: "pre-wrap",
    overflow: "auto"
  };
  if (output.output_type === "stream") {
    const s = output;
    return /* @__PURE__ */ jsx2("pre", { style: { ...baseStyle, color: s.name === "stderr" ? "salmon" : void 0 }, children: asString(s.text) });
  }
  if (output.output_type === "error") {
    const e = output;
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
    return /* @__PURE__ */ jsx2("pre", { style: { ...baseStyle, color: "salmon" }, children: e.traceback.map(stripAnsi).join("\n") });
  }
  if (output.output_type === "execute_result" || output.output_type === "display_data") {
    const d = output;
    if (d.data["image/png"]) {
      return /* @__PURE__ */ jsx2("img", { src: `data:image/png;base64,${asString(d.data["image/png"]).trim()}`, alt: "output", style: { display: "block", margin: "0.4em 0 0.4em 3.5em", maxWidth: "100%" } });
    }
    if (d.data["image/jpeg"]) {
      return /* @__PURE__ */ jsx2("img", { src: `data:image/jpeg;base64,${asString(d.data["image/jpeg"]).trim()}`, alt: "output", style: { display: "block", margin: "0.4em 0 0.4em 3.5em", maxWidth: "100%" } });
    }
    if (d.data["image/svg+xml"]) {
      return /* @__PURE__ */ jsx2(
        "div",
        {
          style: { margin: "0.4em 0 0.4em 3.5em" },
          dangerouslySetInnerHTML: { __html: asString(d.data["image/svg+xml"]) }
        }
      );
    }
    if (d.data["text/html"]) {
      return /* @__PURE__ */ jsx2(
        "div",
        {
          style: { margin: "0.4em 0 0.4em 3.5em", fontSize: "0.9em" },
          dangerouslySetInnerHTML: { __html: asString(d.data["text/html"]) }
        }
      );
    }
    if (d.data["text/plain"]) {
      return /* @__PURE__ */ jsx2("pre", { style: baseStyle, children: asString(d.data["text/plain"]) });
    }
  }
  return null;
}
var notebook_default = NotebookViewer;
export {
  NotebookViewer,
  notebook_default as default
};
//# sourceMappingURL=notebook.js.map