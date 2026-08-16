// src/renderers/json.tsx
import { useEffect, useMemo, useState as useState2 } from "react";

// src/react/persistedState.ts
import { useState } from "react";
var defaultUseState = (_key, defaultValue) => useState(defaultValue);

// src/renderers/json.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var COLORS = {
  key: "rgb(180, 200, 240)",
  string: "rgb(220, 180, 130)",
  number: "rgb(150, 220, 180)",
  bool: "rgb(220, 150, 200)",
  null: "rgb(200, 200, 200)",
  punct: "rgba(180, 180, 180, 0.8)",
  caret: "rgba(200, 200, 200, 0.8)",
  match: "rgba(255, 220, 0, 0.35)"
};
var FONT = "ui-monospace, monospace";
var INDENT = "1.4em";
function makeJsonTreeRenderer({ renderValue } = {}) {
  return function renderJson(source, usePersistedState) {
    return /* @__PURE__ */ jsx(JsonViewer, { source, usePersistedState, renderValue });
  };
}
var renderJsonTree = makeJsonTreeRenderer();
function JsonViewer({ source, usePersistedState, renderValue }) {
  const use = usePersistedState ?? defaultUseState;
  const [q, setQ] = use("json-q", "");
  const [jq, setJq] = use("jq", "");
  const [expandVersion, setExpandVersion] = useState2(0);
  const [forceOpen, setForceOpen] = useState2(null);
  const [copyToast, setCopyToast] = useState2(null);
  let parsed;
  let parseError = null;
  try {
    parsed = JSON.parse(source);
  } catch (e) {
    parseError = String(e);
  }
  const [jqResult, setJqResult] = useState2(null);
  const [jqError, setJqError] = useState2(null);
  const [jqLoading, setJqLoading] = useState2(false);
  useEffect(() => {
    if (parseError || jq.trim() === "") {
      setJqResult(null);
      setJqError(null);
      setJqLoading(false);
      return;
    }
    let cancelled = false;
    setJqLoading(true);
    setJqError(null);
    runJq(parsed, jq).then((value2) => {
      if (cancelled) return;
      setJqResult({ value: value2 });
      setJqLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setJqError(String(e));
      setJqResult(null);
      setJqLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source, jq, parseError]);
  const value = jqResult ? jqResult.value : parsed;
  const matches = useMemo(() => q.trim() === "" || value === void 0 ? null : collectMatchPaths(value, q), [value, q]);
  if (parseError) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { style: { color: "salmon", fontSize: "0.85em", marginBottom: "0.4em" }, children: [
        parseError,
        " \u2014 showing raw text:"
      ] }),
      /* @__PURE__ */ jsx(RawPre, { children: source })
    ] });
  }
  function copyPath(path) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(path || ".").then(() => {
      setCopyToast(path || ".");
      setTimeout(() => setCopyToast(null), 1200);
    }).catch(() => {
    });
  }
  return /* @__PURE__ */ jsxs("div", { style: { fontFamily: FONT, fontSize: "0.85em" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginBottom: "0.5em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "search",
          value: q,
          onChange: (e) => setQ(e.target.value),
          placeholder: "search",
          style: inputStyle
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: jq,
          onChange: (e) => setJq(e.target.value),
          placeholder: "jq filter (e.g. .foo[].bar)",
          style: { ...inputStyle, minWidth: "16em" },
          spellCheck: false
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            setForceOpen(true);
            setExpandVersion((v) => v + 1);
          },
          title: "Expand all",
          style: btnStyle,
          children: "expand"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            setForceOpen(false);
            setExpandVersion((v) => v + 1);
          },
          title: "Collapse all",
          style: btnStyle,
          children: "collapse"
        }
      ),
      copyToast !== null && /* @__PURE__ */ jsxs("span", { style: { opacity: 0.7, fontSize: "0.85em" }, children: [
        "copied ",
        /* @__PURE__ */ jsx("code", { children: copyToast })
      ] })
    ] }),
    jqLoading && /* @__PURE__ */ jsx("div", { style: { opacity: 0.6, marginBottom: "0.4em" }, children: "running jq\u2026" }),
    jqError && /* @__PURE__ */ jsxs("div", { style: { color: "salmon", fontSize: "0.85em", marginBottom: "0.4em" }, children: [
      "jq error: ",
      jqError
    ] }),
    /* @__PURE__ */ jsx("div", { style: { overflowX: "auto", maxHeight: "80vh" }, children: /* @__PURE__ */ jsx(
      Node,
      {
        value,
        path: "",
        q,
        matches,
        forceOpen,
        forceOpenVersion: expandVersion,
        initialOpen: true,
        copyPath,
        renderValue
      }
    ) })
  ] });
}
var inputStyle = {
  padding: "0.3em 0.6em",
  borderRadius: 4,
  border: "1px solid rgba(127,127,127,0.4)",
  background: "rgba(127,127,127,0.08)",
  color: "inherit",
  fontFamily: FONT,
  fontSize: "inherit",
  minWidth: "12em"
};
var btnStyle = {
  fontSize: "0.85em",
  padding: "0.25em 0.7em",
  borderRadius: 4,
  border: "1px solid rgba(127,127,127,0.4)",
  background: "rgba(127,127,127,0.08)",
  color: "inherit",
  cursor: "pointer"
};
function RawPre({ children }) {
  return /* @__PURE__ */ jsx("pre", { style: {
    background: "rgba(127,127,127,0.08)",
    padding: "0.6em 0.8em",
    borderRadius: 4,
    overflow: "auto",
    maxHeight: "80vh",
    fontSize: "0.85em",
    fontFamily: FONT,
    whiteSpace: "pre-wrap"
  }, children });
}
function scalarNode(value, q) {
  if (value === null) return /* @__PURE__ */ jsx("span", { style: { color: COLORS.null }, children: "null" });
  if (typeof value === "string") return /* @__PURE__ */ jsx(HighlightedString, { value, q });
  if (typeof value === "number") return /* @__PURE__ */ jsx("span", { style: { color: COLORS.number }, children: value });
  if (typeof value === "boolean") return /* @__PURE__ */ jsx("span", { style: { color: COLORS.bool }, children: String(value) });
  return null;
}
function Node({ value, path, keyName, q, matches, forceOpen, forceOpenVersion, initialOpen, copyPath, renderValue }) {
  const scalar = scalarNode(value, q);
  if (scalar !== null) {
    if (!renderValue) return /* @__PURE__ */ jsx(Fragment, { children: scalar });
    return /* @__PURE__ */ jsx(Fragment, { children: renderValue({ value, path, key: keyName, defaultNode: scalar }) });
  }
  if (Array.isArray(value)) {
    return /* @__PURE__ */ jsx(ArrayNode, { value, path, q, matches, forceOpen, forceOpenVersion, initialOpen: initialOpen ?? false, copyPath, renderValue });
  }
  if (typeof value === "object") {
    return /* @__PURE__ */ jsx(ObjectNode, { value, path, q, matches, forceOpen, forceOpenVersion, initialOpen: initialOpen ?? false, copyPath, renderValue });
  }
  return /* @__PURE__ */ jsx("span", { children: String(value) });
}
function ArrayNode({ value, path, q, matches, forceOpen, forceOpenVersion, initialOpen, copyPath, renderValue }) {
  const matchedHere = matches?.has(path) ?? false;
  const [open, setOpen] = useOpenState(initialOpen, forceOpen, forceOpenVersion, matchedHere);
  if (value.length === 0) return /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "[]" });
  return /* @__PURE__ */ jsxs("span", { children: [
    /* @__PURE__ */ jsx(Toggle, { open, onClick: () => setOpen((o) => !o) }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "[" }),
    open ? /* @__PURE__ */ jsx("div", { style: { marginLeft: INDENT }, children: value.map((v, i) => {
      const childPath = `${path}[${i}]`;
      return /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Node, { value: v, path: childPath, q, matches, forceOpen, forceOpenVersion, copyPath, renderValue }),
        i < value.length - 1 && /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "," })
      ] }, i);
    }) }) : /* @__PURE__ */ jsxs("span", { style: { color: COLORS.punct, opacity: 0.7 }, children: [
      " ",
      value.length,
      " items "
    ] }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "]" })
  ] });
}
function ObjectNode({ value, path, q, matches, forceOpen, forceOpenVersion, initialOpen, copyPath, renderValue }) {
  const matchedHere = matches?.has(path) ?? false;
  const [open, setOpen] = useOpenState(initialOpen, forceOpen, forceOpenVersion, matchedHere);
  const keys = Object.keys(value);
  if (keys.length === 0) return /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "{}" });
  return /* @__PURE__ */ jsxs("span", { children: [
    /* @__PURE__ */ jsx(Toggle, { open, onClick: () => setOpen((o) => !o) }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "{" }),
    open ? /* @__PURE__ */ jsx("div", { style: { marginLeft: INDENT }, children: keys.map((k, i) => {
      const childPath = `${path}${jqKeySegment(k)}`;
      return /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(KeyLabel, { keyName: k, q, path: childPath, copyPath }),
        /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: ": " }),
        /* @__PURE__ */ jsx(Node, { value: value[k], path: childPath, keyName: k, q, matches, forceOpen, forceOpenVersion, copyPath, renderValue }),
        i < keys.length - 1 && /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "," })
      ] }, k);
    }) }) : /* @__PURE__ */ jsxs("span", { style: { color: COLORS.punct, opacity: 0.7 }, children: [
      " ",
      keys.length,
      " keys "
    ] }),
    /* @__PURE__ */ jsx("span", { style: { color: COLORS.punct }, children: "}" })
  ] });
}
function useOpenState(initialOpen, forceOpen, forceOpenVersion, matchedHere) {
  const [open, setOpen] = useState2(initialOpen);
  const [lastVersion, setLastVersion] = useState2(forceOpenVersion);
  if (forceOpenVersion !== lastVersion) {
    setLastVersion(forceOpenVersion);
    if (forceOpen !== null) setOpen(forceOpen);
  }
  useEffect(() => {
    if (matchedHere) setOpen(true);
  }, [matchedHere]);
  return [open, setOpen];
}
function KeyLabel({ keyName, q, path, copyPath }) {
  return /* @__PURE__ */ jsxs(
    "span",
    {
      onClick: () => copyPath(path),
      title: `copy ${path || "."}`,
      style: { color: COLORS.key, cursor: "pointer" },
      children: [
        '"',
        /* @__PURE__ */ jsx(HighlightedText, { text: keyName, q }),
        '"'
      ]
    }
  );
}
function HighlightedString({ value, q }) {
  return /* @__PURE__ */ jsxs("span", { style: { color: COLORS.string }, children: [
    '"',
    /* @__PURE__ */ jsx(HighlightedText, { text: value, q }),
    '"'
  ] });
}
function HighlightedText({ text, q }) {
  if (!q) return /* @__PURE__ */ jsx(Fragment, { children: text });
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const found = lower.indexOf(needle, i);
    if (found < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (found > i) parts.push(text.slice(i, found));
    parts.push(/* @__PURE__ */ jsx("mark", { style: { background: COLORS.match, color: "inherit", padding: 0 }, children: text.slice(found, found + needle.length) }, found));
    i = found + needle.length;
  }
  return /* @__PURE__ */ jsx(Fragment, { children: parts });
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
function jqKeySegment(key) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `.${key}`;
  return `["${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}
function collectMatchPaths(value, q) {
  const out = /* @__PURE__ */ new Set();
  const needle = q.toLowerCase();
  function visit(v, path) {
    let matched = false;
    if (typeof v === "string" && v.toLowerCase().includes(needle)) matched = true;
    if (Array.isArray(v)) {
      v.forEach((child, i) => {
        if (visit(child, `${path}[${i}]`)) matched = true;
      });
    } else if (v !== null && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        const childPath = `${path}${jqKeySegment(k)}`;
        const keyMatched = k.toLowerCase().includes(needle);
        if (keyMatched) {
          out.add(childPath);
          matched = true;
        }
        if (visit(child, childPath)) matched = true;
      }
    }
    if (matched) out.add(path);
    return matched;
  }
  visit(value, "");
  return out;
}
async function runJq(value, expr) {
  let mod;
  try {
    mod = await import("jq-web");
  } catch {
    throw new Error("jq filtering requires the `jq-web` peer dep \u2014 install it in your app to enable.");
  }
  const jq = await mod.default;
  return jq.json(value, expr);
}
export {
  makeJsonTreeRenderer,
  renderJsonTree
};
//# sourceMappingURL=json.js.map