// src/renderers/json.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var COLORS = {
  key: "rgb(180, 200, 240)",
  string: "rgb(220, 180, 130)",
  number: "rgb(150, 220, 180)",
  bool: "rgb(220, 150, 200)",
  null: "rgb(200, 200, 200)",
  punct: "rgba(180, 180, 180, 0.8)",
  caret: "rgba(200, 200, 200, 0.8)"
};
var FONT = "ui-monospace, monospace";
var INDENT = "1.4em";
function renderJsonTree(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (e) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { style: { color: "salmon", fontSize: "0.85em", marginBottom: "0.4em" }, children: [
        String(e),
        " \u2014 showing raw text:"
      ] }),
      /* @__PURE__ */ jsx("pre", { style: {
        background: "rgba(127,127,127,0.08)",
        padding: "0.6em 0.8em",
        borderRadius: 4,
        overflow: "auto",
        maxHeight: "80vh",
        fontSize: "0.85em",
        fontFamily: FONT,
        whiteSpace: "pre-wrap"
      }, children: source })
    ] });
  }
  return /* @__PURE__ */ jsx("div", { style: { fontFamily: FONT, fontSize: "0.85em", overflowX: "auto", maxHeight: "80vh" }, children: /* @__PURE__ */ jsx(Node, { value, initialOpen: true }) });
}
function Node({ value, initialOpen = false }) {
  if (value === null) return /* @__PURE__ */ jsx("span", { style: { color: COLORS.null }, children: "null" });
  if (typeof value === "string") return /* @__PURE__ */ jsxs("span", { style: { color: COLORS.string }, children: [
    '"',
    value,
    '"'
  ] });
  if (typeof value === "number") return /* @__PURE__ */ jsx("span", { style: { color: COLORS.number }, children: value });
  if (typeof value === "boolean") return /* @__PURE__ */ jsx("span", { style: { color: COLORS.bool }, children: String(value) });
  if (Array.isArray(value)) return /* @__PURE__ */ jsx(ArrayNode, { value, initialOpen });
  if (typeof value === "object") return /* @__PURE__ */ jsx(ObjectNode, { value, initialOpen });
  return /* @__PURE__ */ jsx("span", { children: String(value) });
}
function ArrayNode({ value, initialOpen }) {
  const [open, setOpen] = useState(initialOpen);
  if (value.length === 0) return /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "[]" });
  return /* @__PURE__ */ jsxs("span", { children: [
    /* @__PURE__ */ jsx(Toggle, { open, onClick: () => setOpen((o) => !o) }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "[" }),
    open ? /* @__PURE__ */ jsx("div", { style: { marginLeft: INDENT }, children: value.map((v, i) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(Node, { value: v }),
      i < value.length - 1 && /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "," })
    ] }, i)) }) : /* @__PURE__ */ jsxs("span", { style: { color: COLORS.punct, opacity: 0.7 }, children: [
      " ",
      value.length,
      " items "
    ] }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "]" })
  ] });
}
function ObjectNode({ value, initialOpen }) {
  const [open, setOpen] = useState(initialOpen);
  const keys = Object.keys(value);
  if (keys.length === 0) return /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "{}" });
  return /* @__PURE__ */ jsxs("span", { children: [
    /* @__PURE__ */ jsx(Toggle, { open, onClick: () => setOpen((o) => !o) }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "{" }),
    open ? /* @__PURE__ */ jsx("div", { style: { marginLeft: INDENT }, children: keys.map((k, i) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("span", { style: { color: COLORS.key }, children: [
        '"',
        k,
        '"'
      ] }),
      /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: ": " }),
      /* @__PURE__ */ jsx(Node, { value: value[k] }),
      i < keys.length - 1 && /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "," })
    ] }, k)) }) : /* @__PURE__ */ jsxs("span", { style: { color: COLORS.punct, opacity: 0.7 }, children: [
      " ",
      keys.length,
      " keys "
    ] }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "}" })
  ] });
}
function Toggle({ open, onClick }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      style: {
        background: "none",
        border: "none",
        color: COLORS.caret,
        cursor: "pointer",
        padding: 0,
        marginRight: "0.2em",
        fontFamily: FONT,
        fontSize: "inherit"
      },
      "aria-label": open ? "Collapse" : "Expand",
      children: open ? "\u25BE" : "\u25B8"
    }
  );
}
export {
  renderJsonTree
};
//# sourceMappingURL=json.js.map