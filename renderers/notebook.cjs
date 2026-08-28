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

// src/renderers/notebook.tsx
var notebook_exports = {};
__export(notebook_exports, {
  NotebookViewer: () => NotebookViewer,
  default: () => notebook_default
});
module.exports = __toCommonJS(notebook_exports);
var import_react = require("react");

// src/renderers/markdown.tsx
var import_react_markdown = __toESM(require("react-markdown"), 1);
var import_remark_gfm = __toESM(require("remark-gfm"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
function renderMarkdown(source) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "markdown-body", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react_markdown.default, { remarkPlugins: [import_remark_gfm.default], children: source }) });
}

// src/renderers/notebook.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function asString(src) {
  return Array.isArray(src) ? src.join("") : src;
}
function NotebookViewer({ store, path }) {
  const [nb, setNb] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
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
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!nb) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { opacity: 0.6 }, children: "loading notebook\u2026" });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rdub-file-tree-notebook", children: [
    nb.metadata?.kernelspec?.display_name && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { fontSize: "0.85em", opacity: 0.65, margin: "0 0 0.8em" }, children: [
      "kernel: ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: nb.metadata.kernelspec.display_name })
    ] }),
    nb.cells.map((cell, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CellView, { cell }, i))
  ] });
}
function CellView({ cell }) {
  if (cell.cell_type === "markdown") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { margin: "0.8em 0" }, children: renderMarkdown(asString(cell.source)) });
  }
  if (cell.cell_type === "code") {
    const code = cell;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { margin: "0.8em 0" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "0.5em", alignItems: "flex-start" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("code", { style: { flexShrink: 0, opacity: 0.5, fontSize: "0.8em", paddingTop: "0.7em", minWidth: "3em", textAlign: "right" }, children: [
          "[",
          code.execution_count ?? " ",
          "]:"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: {
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
      code.outputs?.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OutputView, { output: o }, i))
    ] });
  }
  if (cell.cell_type === "raw") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: { margin: "0.8em 0", fontSize: "0.85em", opacity: 0.7 }, children: asString(cell.source) });
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
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: { ...baseStyle, color: s.name === "stderr" ? "salmon" : void 0 }, children: asString(s.text) });
  }
  if (output.output_type === "error") {
    const e = output;
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: { ...baseStyle, color: "salmon" }, children: e.traceback.map(stripAnsi).join("\n") });
  }
  if (output.output_type === "execute_result" || output.output_type === "display_data") {
    const d = output;
    if (d.data["image/png"]) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: `data:image/png;base64,${asString(d.data["image/png"]).trim()}`, alt: "output", style: { display: "block", margin: "0.4em 0 0.4em 3.5em", maxWidth: "100%" } });
    }
    if (d.data["image/jpeg"]) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: `data:image/jpeg;base64,${asString(d.data["image/jpeg"]).trim()}`, alt: "output", style: { display: "block", margin: "0.4em 0 0.4em 3.5em", maxWidth: "100%" } });
    }
    if (d.data["image/svg+xml"]) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          style: { margin: "0.4em 0 0.4em 3.5em" },
          dangerouslySetInnerHTML: { __html: asString(d.data["image/svg+xml"]) }
        }
      );
    }
    if (d.data["text/html"]) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          style: { margin: "0.4em 0 0.4em 3.5em", fontSize: "0.9em" },
          dangerouslySetInnerHTML: { __html: asString(d.data["text/html"]) }
        }
      );
    }
    if (d.data["text/plain"]) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: baseStyle, children: asString(d.data["text/plain"]) });
    }
  }
  return null;
}
var notebook_default = NotebookViewer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NotebookViewer
});
//# sourceMappingURL=notebook.cjs.map