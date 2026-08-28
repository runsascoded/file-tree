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

// src/renderers/yaml.tsx
var yaml_exports = {};
__export(yaml_exports, {
  makeYamlTreeRenderer: () => makeYamlTreeRenderer,
  parseYaml: () => parseYaml,
  renderYamlTree: () => renderYamlTree
});
module.exports = __toCommonJS(yaml_exports);

// src/renderers/json.tsx
var import_react2 = require("react");

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

// src/renderers/json.tsx
var import_jsx_runtime = require("react/jsx-runtime");
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
function makeJsonTreeRenderer({ renderValue, renderKey, initialOpenDepth = 1, parse, label = "JSON", jqDebounceMs = 300 } = {}) {
  return function renderJson(source, usePersistedState) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      JsonViewer,
      {
        source,
        usePersistedState,
        renderValue,
        renderKey,
        initialOpenDepth,
        ...parse ? { parse } : {},
        label,
        jqDebounceMs
      }
    );
  };
}
var renderJsonTree = makeJsonTreeRenderer();
function JsonViewer({ source, usePersistedState, renderValue, renderKey, initialOpenDepth, parse, label, jqDebounceMs }) {
  const use = usePersistedState ?? defaultUseState;
  const [q, setQ] = use("q", "");
  const [jq, setJq] = use("jq", "");
  const [jqDraft, setJqDraft] = (0, import_react2.useState)(jq);
  (0, import_react2.useEffect)(() => setJqDraft(jq), [jq]);
  (0, import_react2.useEffect)(() => {
    if (jqDraft === jq) return;
    if (jqDebounceMs <= 0) {
      setJq(jqDraft);
      return;
    }
    const t = setTimeout(() => setJq(jqDraft), jqDebounceMs);
    return () => clearTimeout(t);
  }, [jqDraft, jqDebounceMs]);
  const [expandVersion, setExpandVersion] = (0, import_react2.useState)(0);
  const [forceDepth, setForceDepth] = usePersistedDepth(use);
  const [copyToast, setCopyToast] = (0, import_react2.useState)(null);
  const [asyncParsed, setAsyncParsed] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    if (!parse) return;
    let cancelled = false;
    setAsyncParsed(null);
    Promise.resolve().then(() => parse(source)).then((value2) => {
      if (!cancelled) setAsyncParsed({ value: value2 });
    }).catch((e) => {
      if (!cancelled) setAsyncParsed({ error: String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, [source, parse]);
  let parsed;
  let parseError = null;
  let parsing = false;
  if (parse) {
    if (asyncParsed === null) parsing = true;
    else if ("error" in asyncParsed) parseError = asyncParsed.error;
    else parsed = asyncParsed.value;
  } else {
    try {
      parsed = JSON.parse(source);
    } catch (e) {
      parseError = String(e);
    }
  }
  const [jqResult, setJqResult] = (0, import_react2.useState)(null);
  const [jqError, setJqError] = (0, import_react2.useState)(null);
  const [jqLoading, setJqLoading] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
    if (parseError || parsing || jq.trim() === "") {
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
  }, [source, jq, parseError, parsing]);
  const value = jqResult ? jqResult.value : parsed;
  const matches = (0, import_react2.useMemo)(() => q.trim() === "" || value === void 0 ? null : collectMatchPaths(value, q), [value, q]);
  if (parsing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "parsing ",
    label,
    "\u2026"
  ] });
  if (parseError) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "salmon", fontSize: "0.85em", marginBottom: "0.4em" }, children: [
        parseError,
        " \u2014 showing raw text:"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RawPre, { children: source })
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontFamily: FONT, fontSize: "0.85em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginBottom: "0.5em", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "search",
          value: q,
          onChange: (e) => setQ(e.target.value),
          placeholder: "search",
          style: inputStyle
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "text",
          value: jqDraft,
          onChange: (e) => setJqDraft(e.target.value),
          placeholder: "jq filter (e.g. .foo[].bar)",
          style: { ...inputStyle, minWidth: "16em" },
          spellCheck: false
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.25em" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.6, fontSize: "0.85em" }, children: "depth" }),
        [0, 1, 2, 3].map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: () => {
              setForceDepth(d);
              setExpandVersion((v) => v + 1);
            },
            title: d === 0 ? "Collapse all" : `Expand to depth ${d}`,
            style: btnStyle,
            children: d
          },
          d
        )),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: () => {
              setForceDepth(EXPAND_ALL);
              setExpandVersion((v) => v + 1);
            },
            title: "Expand all",
            style: btnStyle,
            children: "all"
          }
        )
      ] }),
      copyToast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.7, fontSize: "0.85em" }, children: [
        "copied ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: copyToast })
      ] })
    ] }),
    jqLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, marginBottom: "0.4em" }, children: "running jq\u2026" }),
    jqError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "salmon", fontSize: "0.85em", marginBottom: "0.4em" }, children: [
      "jq error: ",
      jqError
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rdub-file-tree-json-tree", style: { overflowX: "auto", maxHeight: "80vh" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Node,
      {
        value,
        path: "",
        depth: 0,
        initialOpenDepth,
        q,
        matches,
        forceDepth,
        forceOpenVersion: expandVersion,
        copyPath,
        renderValue,
        renderKey,
        root: value
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: {
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
  if (value === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.null }, children: "null" });
  if (typeof value === "string") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HighlightedString, { value, q });
  if (typeof value === "number") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.number }, children: value });
  if (typeof value === "boolean") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.bool }, children: String(value) });
  return null;
}
function Node({ value, path, depth, initialOpenDepth, keyName, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, renderKey, root }) {
  const scalar = scalarNode(value, q);
  if (scalar !== null) {
    if (!renderValue) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: scalar });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: renderValue({ value, path, key: keyName, defaultNode: scalar }) });
  }
  const rest = { path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, renderKey, root, initialOpen: depth < initialOpenDepth };
  if (Array.isArray(value)) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrayNode, { value, ...rest });
  }
  if (typeof value === "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ObjectNode, { value, ...rest });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: String(value) });
}
function ArrayNode({ value, path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, initialOpen, copyPath, renderValue, renderKey, root }) {
  const matchedHere = matches?.has(path) ?? false;
  const [open, setOpen] = useOpenState(initialOpen, forceDepth === null ? null : depth < forceDepth, forceOpenVersion, matchedHere);
  if (value.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "[]" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { open, onClick: () => setOpen((o) => !o) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "[" }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginLeft: INDENT }, children: value.map((v, i) => {
      const childPath = `${path}[${i}]`;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Node, { value: v, path: childPath, depth: depth + 1, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, renderKey, root }),
        i < value.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "," })
      ] }, i);
    }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: COLORS.punct, opacity: 0.7 }, children: [
      " ",
      value.length,
      " items "
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "]" })
  ] });
}
function ObjectNode({ value, path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, initialOpen, copyPath, renderValue, renderKey, root }) {
  const matchedHere = matches?.has(path) ?? false;
  const [open, setOpen] = useOpenState(initialOpen, forceDepth === null ? null : depth < forceDepth, forceOpenVersion, matchedHere);
  const keys = Object.keys(value);
  if (keys.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "{}" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { open, onClick: () => setOpen((o) => !o) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "{" }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginLeft: INDENT }, children: keys.map((k, i) => {
      const childPath = `${path}${jqKeySegment(k)}`;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        renderKey ? renderKey({ key: k, path: childPath, root, defaultNode: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyLabel, { keyName: k, q, path: childPath, copyPath }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyLabel, { keyName: k, q, path: childPath, copyPath }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: ": " }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Node, { value: value[k], path: childPath, depth: depth + 1, initialOpenDepth, keyName: k, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, renderKey, root }),
        i < keys.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "," })
      ] }, k);
    }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: COLORS.punct, opacity: 0.7 }, children: [
      " ",
      keys.length,
      " keys "
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.punct }, children: "}" })
  ] });
}
var EXPAND_ALL = 99;
function usePersistedDepth(use) {
  const [raw, setRaw] = use("depth", -1);
  return [raw < 0 ? null : raw === 0 ? 0 : raw, setRaw];
}
function useOpenState(initialOpen, forceOpen, forceOpenVersion, matchedHere) {
  const [open, setOpenRaw] = (0, import_react2.useState)(forceOpen ?? initialOpen);
  const [lastVersion, setLastVersion] = (0, import_react2.useState)(forceOpenVersion);
  if (forceOpenVersion !== lastVersion) {
    setLastVersion(forceOpenVersion);
    if (forceOpen !== null) setOpenRaw(forceOpen);
  }
  const openedBySearch = (0, import_react2.useRef)(false);
  const openRef = (0, import_react2.useRef)(open);
  openRef.current = open;
  (0, import_react2.useEffect)(() => {
    if (matchedHere) {
      if (!openRef.current) {
        openedBySearch.current = true;
        setOpenRaw(true);
      }
    } else if (openedBySearch.current) {
      openedBySearch.current = false;
      setOpenRaw(false);
    }
  }, [matchedHere]);
  const setOpen = (0, import_react2.useCallback)((v) => {
    openedBySearch.current = false;
    setOpenRaw(v);
  }, []);
  return [open, setOpen];
}
function KeyLabel({ keyName, q, path, copyPath }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      onClick: () => copyPath(path),
      title: `copy ${path || "."}`,
      style: { color: COLORS.key, cursor: "pointer" },
      children: [
        '"',
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HighlightedText, { text: keyName, q }),
        '"'
      ]
    }
  );
}
function HighlightedString({ value, q }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: COLORS.string }, children: [
    '"',
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HighlightedText, { text: value, q }),
    '"'
  ] });
}
function HighlightedText({ text, q }) {
  if (!q) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: text });
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
    parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("mark", { style: { background: COLORS.match, color: "inherit", padding: 0 }, children: text.slice(found, found + needle.length) }, found));
    i = found + needle.length;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: parts });
}
function Toggle({ open, onClick }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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

// src/renderers/yaml.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var cached = null;
function loadYaml() {
  cached ??= import("yaml").then((m) => m).catch(() => {
    cached = null;
    throw new Error("YAML rendering requires the `yaml` peer dep \u2014 install it in your app to enable.");
  });
  return cached;
}
var comments = /* @__PURE__ */ new WeakMap();
function seg(k) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`;
}
function collect(node, path, out) {
  const n = node;
  if (!n || typeof n !== "object" || !Array.isArray(n.items)) return;
  n.items.forEach((item, i) => {
    const pair = item;
    if (pair && typeof pair === "object" && "key" in pair) {
      const k = pair.key?.value;
      if (typeof k !== "string") return;
      const childPath = `${path}${seg(k)}`;
      const key = pair.key;
      const val = pair.value;
      const parts = [key?.commentBefore, val?.comment].filter((c) => typeof c === "string" && c.trim() !== "").map((c) => c.split("\n").map((l) => l.replace(/^#?\s*/, "").trim()).filter(Boolean).join(" "));
      if (parts.length) out.set(childPath, parts.join(" \u2014 "));
      collect(pair.value, childPath, out);
    } else {
      collect(pair, `${path}[${i}]`, out);
    }
  });
}
async function parseYaml(source) {
  const { parseDocument } = await loadYaml();
  const doc = parseDocument(source, { merge: true });
  const value = doc.toJS();
  if (value !== null && typeof value === "object") {
    const map = /* @__PURE__ */ new Map();
    collect(doc.contents, "", map);
    if (map.size) comments.set(value, map);
  }
  return value;
}
function commentRenderKey(user) {
  return (ctx) => {
    const node = user ? user(ctx) : ctx.defaultNode;
    const { root } = ctx;
    const map = root !== null && typeof root === "object" ? comments.get(root) : void 0;
    const c = map?.get(ctx.path);
    if (!c) return node;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { opacity: 0.45, fontStyle: "italic", fontWeight: 400, whiteSpace: "normal" }, children: [
        "# ",
        c
      ] }),
      node
    ] });
  };
}
function makeYamlTreeRenderer(opts = {}) {
  return makeJsonTreeRenderer({
    ...opts,
    parse: parseYaml,
    label: "YAML",
    renderKey: commentRenderKey(opts.renderKey)
  });
}
var renderYamlTree = makeYamlTreeRenderer();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  makeYamlTreeRenderer,
  parseYaml,
  renderYamlTree
});
//# sourceMappingURL=yaml.cjs.map