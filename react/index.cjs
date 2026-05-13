"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react/index.ts
var react_exports = {};
__export(react_exports, {
  AUDIO: () => AUDIO,
  Breadcrumb: () => Breadcrumb,
  CODE_LANG: () => CODE_LANG,
  DirListing: () => DirListing,
  FileTree: () => FileTree,
  IMAGE: () => IMAGE,
  MediaViewer: () => MediaViewer,
  TEXTY: () => TEXTY,
  TextViewer: () => TextViewer,
  VIDEO: () => VIDEO,
  asyncBufferFromStore: () => asyncBufferFromStore,
  basename: () => basename,
  extOf: () => extOf,
  fmtSize: () => fmtSize,
  keyToSplat: () => keyToSplat,
  makeMatcher: () => makeMatcher,
  parsePath: () => parsePath
});
module.exports = __toCommonJS(react_exports);

// src/react/FileTree.tsx
var import_react4 = require("react");
var import_react_router_dom3 = require("react-router-dom");

// src/react/Breadcrumb.tsx
var import_react_router_dom = require("react-router-dom");
var import_jsx_runtime = require("react/jsx-runtime");
function Breadcrumb({ crumbs, separator = " / ", rightSlot }) {
  if (crumbs.length === 0 && !rightSlot) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", { "aria-label": "Breadcrumb", style: { fontFamily: "ui-monospace, monospace", fontSize: "0.95em", marginBottom: "0.5em" }, children: [
    crumbs.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
      i > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.5 }, children: separator }),
      i === crumbs.length - 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.7 }, children: c.label }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react_router_dom.Link, { to: c.to, children: c.label })
    ] }, c.to)),
    rightSlot && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: "0.8em" }, children: rightSlot })
  ] });
}

// src/react/DirListing.tsx
var import_react = require("react");
var import_react_router_dom2 = require("react-router-dom");

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/react/match.ts
function makeMatcher(q) {
  if (!q) return () => true;
  if (!/[*?]/.test(q)) {
    const lower = q.toLowerCase();
    return (s) => s.toLowerCase().includes(lower);
  }
  const pattern = q.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const re = new RegExp(`^${pattern}$`, "i");
  return (s) => re.test(s);
}

// src/react/parsePath.ts
var TEXTY = /* @__PURE__ */ new Set(["txt", "csv", "tsv", "json", "md", "log", "yaml", "yml", "toml", "ini", "sql", "sh", "py", "ts", "tsx", "js", "jsx", "html", "css"]);
var CODE_LANG = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  go: "go",
  rs: "rust",
  rb: "ruby",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp"
};
var IMAGE = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);
var VIDEO = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
var AUDIO = /* @__PURE__ */ new Set(["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac"]);
function extOf(name) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}
function parsePath(splat, opts = {}) {
  const root = opts.rootPrefix ?? "";
  const texty = opts.extraTexty ? /* @__PURE__ */ new Set([...TEXTY, ...opts.extraTexty]) : TEXTY;
  let decoded;
  try {
    decoded = decodeURIComponent(splat);
  } catch {
    decoded = splat;
  }
  const stripped = decoded.replace(/^\/+/, "");
  const key = root + stripped;
  const bangIdx = key.indexOf("!/");
  if (bangIdx >= 0) {
    return {
      kind: "zipEntry",
      path: key.slice(0, bangIdx),
      entry: key.slice(bangIdx + 2)
    };
  }
  if (key === "" || key === root) return { kind: "dir", prefix: root };
  if (key.endsWith("/")) return { kind: "dir", prefix: key };
  const ext = extOf(key);
  if (ext === "zip") return { kind: "zip", path: key };
  if (ext === "pqt" || ext === "parquet") return { kind: "parquet", path: key };
  if (ext === "ipynb") return { kind: "notebook", path: key };
  if (ext === "pdf") return { kind: "pdf", path: key };
  if (IMAGE.has(ext)) return { kind: "image", path: key };
  if (VIDEO.has(ext)) return { kind: "video", path: key };
  if (AUDIO.has(ext)) return { kind: "audio", path: key };
  if (texty.has(ext)) return { kind: "text", path: key };
  if (!ext) return { kind: "dir", prefix: key + "/" };
  return { kind: "binary", path: key };
}
function keyToSplat(key, rootPrefix = "") {
  return key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key;
}
function basename(key) {
  const trimmed = key.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

// src/react/DirListing.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function DirListing({ store, prefix, routeBase, rootPrefix = "", q: qExternal, setQ: setQExternal, markdownRenderer }) {
  const [entries, setEntries] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const [cursor, setCursor] = (0, import_react.useState)(void 0);
  const [qInternal, setQInternal] = (0, import_react.useState)("");
  const q = qExternal ?? qInternal;
  const setQ = setQExternal ?? setQInternal;
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    setCursor(void 0);
    const MAX_PAGES = 20;
    (async () => {
      try {
        const collected = [];
        let cur = void 0;
        for (let i = 0; i < MAX_PAGES; i++) {
          const r = await store.list(prefix, cur ? { cursor: cur } : void 0);
          if (cancelled) return;
          collected.push(...r.entries);
          if (!r.cursor) {
            cur = void 0;
            break;
          }
          cur = r.cursor;
        }
        if (cancelled) return;
        setEntries(collected);
        setCursor(cur);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, prefix]);
  async function loadMore() {
    if (!cursor) return;
    const r = await store.list(prefix, { cursor });
    setEntries((prev) => [...prev ?? [], ...r.entries]);
    setCursor(r.cursor);
  }
  const matcher = (0, import_react.useMemo)(() => makeMatcher(q), [q]);
  const filtered = (0, import_react.useMemo)(() => {
    if (!entries) return null;
    if (!q) return entries;
    return entries.filter((e) => matcher(basename(e.key)));
  }, [entries, q, matcher]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!entries || !filtered) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    prefix,
    "\u2026"
  ] });
  const filterUI = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginBottom: "0.5em", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "input",
      {
        type: "search",
        value: q,
        onChange: (e) => setQ(e.target.value),
        placeholder: "filter (e.g. NewJersey* or pedestr)",
        style: {
          padding: "0.3em 0.6em",
          borderRadius: 4,
          border: "1px solid rgba(127,127,127,0.4)",
          background: "rgba(127,127,127,0.08)",
          color: "inherit",
          fontFamily: "ui-monospace, monospace",
          minWidth: "20em"
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { opacity: 0.6, fontVariantNumeric: "tabular-nums" }, children: q ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      filtered.length,
      " / ",
      entries.length
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      entries.length,
      " entries"
    ] }) }),
    q && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => setQ(""), style: { fontSize: "0.85em", padding: "0.2em 0.6em" }, children: "clear" })
  ] });
  if (filtered.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      filterUI,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { opacity: 0.6 }, children: q ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        "no entries match ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: q })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        "empty: ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: prefix })
      ] }) })
    ] });
  }
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    filterUI,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: { padding: "0.2em 0.6em 0.2em 0", fontWeight: 400 }, children: "name" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: { padding: "0.2em 0.6em", fontWeight: 400, textAlign: "right" }, children: "size" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: { padding: "0.2em 0", fontWeight: 400, textAlign: "right" }, children: "modified" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: filtered.map((e) => {
        const name = basename(e.key);
        const splat = keyToSplat(e.key, rootPrefix);
        const href = `${baseTrimmed}/${splat}`;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.2)" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_react_router_dom2.Link, { to: href, children: [
            e.isDir ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { opacity: 0.6 }, children: "\u{1F4C1} " }) : null,
            name,
            e.isDir ? "/" : ""
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: e.isDir ? 0.4 : 1 }, children: e.isDir ? "\u2014" : fmtSize(e.size) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: { padding: "0.3em 0", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6, fontSize: "0.9em" }, children: e.lastModified?.slice(0, 10) ?? "" })
        ] }, e.key);
      }) })
    ] }),
    cursor && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: loadMore, style: { marginTop: "0.5em" }, children: "load more" }),
    markdownRenderer && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DefaultReadme, { store, entries, markdownRenderer })
  ] });
}
function DefaultReadme({ store, entries, markdownRenderer }) {
  const readme = entries.find((e) => !e.isDir && /^README\.md$/i.test(basename(e.key)));
  const [text, setText] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    setText(null);
    if (!readme) return;
    let cancelled = false;
    store.get(readme.key).then((r) => {
      if (cancelled) return;
      setText(new TextDecoder().decode(r.bytes));
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [store, readme?.key]);
  if (!readme || text == null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: "rdub-file-tree-default-readme",
      "data-readme-key": readme.key,
      style: {
        marginTop: "1.5em",
        padding: "0.8em 1em",
        border: "1px solid rgba(127,127,127,0.25)",
        borderRadius: 6,
        background: "rgba(127,127,127,0.04)"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.8em", opacity: 0.6, fontFamily: "ui-monospace, monospace", marginBottom: "0.5em" }, children: basename(readme.key) }),
        markdownRenderer(text)
      ]
    }
  );
}

// src/react/MediaViewer.tsx
var import_react2 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function MediaViewer({ store, path, kind }) {
  const direct = typeof store.getUrl === "function" ? store.getUrl(path) : null;
  const [blobUrl, setBlobUrl] = (0, import_react2.useState)(null);
  const [error, setError] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    if (direct) return;
    let cancelled = false;
    let createdUrl = null;
    setBlobUrl(null);
    setError(null);
    store.get(path).then((r) => {
      if (cancelled) return;
      const blob = new Blob([r.bytes], r.contentType ? { type: r.contentType } : {});
      createdUrl = URL.createObjectURL(blob);
      setBlobUrl(createdUrl);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [store, path, direct]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  const src = direct ?? blobUrl;
  if (!src) return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  if (kind === "image") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "img",
      {
        src,
        alt: path,
        style: { maxWidth: "100%", maxHeight: "80vh", display: "block", borderRadius: 4 }
      }
    );
  }
  if (kind === "audio") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "audio",
      {
        src,
        controls: true,
        preload: "metadata",
        style: { display: "block", width: "100%", maxWidth: 600 }
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "video",
    {
      src,
      controls: true,
      preload: "metadata",
      style: { maxWidth: "100%", maxHeight: "80vh", display: "block", borderRadius: 4 }
    }
  );
}

// src/react/TextViewer.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var HEAD_BYTES = 64 * 1024;
function TextViewer({ store, path, markdownRenderer, jsonRenderer, codeRenderer, codeLang }) {
  const [text, setText] = (0, import_react3.useState)(null);
  const [totalSize, setTotalSize] = (0, import_react3.useState)(void 0);
  const [error, setError] = (0, import_react3.useState)(null);
  const [loadingMore, setLoadingMore] = (0, import_react3.useState)(false);
  const fetchFull = !!markdownRenderer || !!jsonRenderer || !!codeRenderer;
  (0, import_react3.useEffect)(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    setTotalSize(void 0);
    const range = !fetchFull && store.capabilities?.range ? { offset: 0, length: HEAD_BYTES } : void 0;
    store.get(path, range).then((r) => {
      if (cancelled) return;
      setText(new TextDecoder().decode(r.bytes));
      setTotalSize(r.totalSize);
    }).catch((e) => {
      if (cancelled) return;
      setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, fetchFull]);
  async function loadAll() {
    if (totalSize == null) return;
    setLoadingMore(true);
    try {
      const r = await store.get(path);
      setText(new TextDecoder().decode(r.bytes));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (text == null) return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  const truncated = totalSize != null && text.length < totalSize;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    markdownRenderer ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rdub-file-tree-markdown", "data-path": path, children: markdownRenderer(text) }) : jsonRenderer ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rdub-file-tree-json", "data-path": path, children: jsonRenderer(text) }) : codeRenderer ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rdub-file-tree-code", "data-path": path, "data-lang": codeLang, children: codeRenderer(text, codeLang ?? "") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { style: {
      background: "rgba(127,127,127,0.08)",
      padding: "0.6em 0.8em",
      borderRadius: 4,
      overflow: "auto",
      maxHeight: "80vh",
      fontSize: "0.85em",
      fontFamily: "ui-monospace, monospace",
      whiteSpace: "pre-wrap"
    }, children: text }),
    truncated && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: "0.5em", fontSize: "0.85em", opacity: 0.7 }, children: [
      "showing first ",
      fmtSize(text.length),
      " of ",
      fmtSize(totalSize),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { onClick: loadAll, disabled: loadingMore, children: loadingMore ? "loading\u2026" : "load all" })
    ] })
  ] });
}

// src/react/FileTree.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function FileTree({ store, routeBase, rootPrefix = "", extraTexty, title, className, style, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer }) {
  const location = (0, import_react_router_dom3.useLocation)();
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`);
  const splat = location.pathname.replace(baseRe, "");
  const parsed = (0, import_react4.useMemo)(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty]);
  const crumbs = (0, import_react4.useMemo)(() => buildCrumbs(parsed, routeBase, rootPrefix), [parsed, routeBase, rootPrefix]);
  const downloadable = parsed.kind !== "dir" && parsed.kind !== "zipEntry";
  const downloadHref = downloadable && typeof store.getUrl === "function" ? store.getUrl(parsed.path) : null;
  const downloadName = downloadable ? basename(parsed.path) : "";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className, style, children: [
    title && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h1", { style: { fontSize: "1.4em", margin: "0 0 0.3em" }, children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      Breadcrumb,
      {
        crumbs,
        rightSlot: downloadHref ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(DownloadIcon, { href: downloadHref, name: downloadName }) : void 0
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Body, { store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer })
  ] });
}
function Body({ store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer }) {
  switch (parsed.kind) {
    case "dir":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(DirListing, { store, prefix: parsed.prefix, routeBase, rootPrefix, markdownRenderer });
    case "text": {
      const ext = extOf(parsed.path);
      const isMd = ext === "md" || ext === "markdown";
      const isJson = ext === "json";
      const isCsv = ext === "csv" || ext === "tsv";
      const lang = CODE_LANG[ext];
      if (isCsv && csvRenderer) {
        const Component = csvRenderer;
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Component, { store, path: parsed.path, delimiter: ext === "tsv" ? "	" : "," });
      }
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        TextViewer,
        {
          store,
          path: parsed.path,
          markdownRenderer: isMd ? markdownRenderer : void 0,
          jsonRenderer: isJson ? jsonRenderer : void 0,
          codeRenderer: !isMd && !isJson && lang ? codeRenderer : void 0,
          codeLang: lang
        }
      );
    }
    case "zip":
    case "zipEntry":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UnsupportedView, { label: "Zip preview" });
    case "parquet": {
      if (!parquetRenderer) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UnsupportedView, { label: "Parquet preview" });
      const Component = parquetRenderer;
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Component, { store, path: parsed.path });
    }
    case "notebook": {
      if (!notebookRenderer) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UnsupportedView, { label: "Notebook preview" });
      const Component = notebookRenderer;
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Component, { store, path: parsed.path });
    }
    case "image":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(MediaViewer, { store, path: parsed.path, kind: "image" });
    case "video":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(MediaViewer, { store, path: parsed.path, kind: "video" });
    case "audio":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(MediaViewer, { store, path: parsed.path, kind: "audio" });
    case "pdf":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UnsupportedView, { label: "PDF preview" });
    case "binary":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { opacity: 0.7 }, children: "Preview not supported for this file type." });
  }
}
function DownloadIcon({ href, name }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "a",
    {
      href,
      download: name,
      title: `Download ${name}`,
      "aria-label": `Download ${name}`,
      style: { fontSize: "1.1em", textDecoration: "none", lineHeight: 1 },
      children: "\u2B07"
    }
  );
}
function UnsupportedView({ label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { opacity: 0.7 }, children: [
    label,
    " not yet supported in this version."
  ] });
}
function buildCrumbs(parsed, routeBase, rootPrefix) {
  const path = parsed.kind === "dir" ? parsed.prefix : parsed.kind === "zipEntry" ? `${parsed.path}!/${parsed.entry}` : parsed.path;
  const splat = keyToSplat(path, rootPrefix);
  const parts = splat.split("/").filter((p) => p.length > 0);
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  const crumbs = [{ label: "root", to: `${baseTrimmed}/` }];
  let cum = "";
  for (const p of parts) {
    cum = cum ? `${cum}/${p}` : p;
    crumbs.push({
      label: basename(p),
      to: `${baseTrimmed}/${cum}${parsed.kind === "dir" && cum === splat ? "/" : ""}`
    });
  }
  return crumbs;
}

// src/react/asyncBuffer.ts
async function asyncBufferFromStore(store, path) {
  let byteLength;
  if (typeof store.getUrl === "function") {
    try {
      const r = await fetch(store.getUrl(path), { method: "HEAD" });
      if (r.ok) {
        const cl = parseInt(r.headers.get("Content-Length") ?? "", 10);
        if (Number.isFinite(cl) && cl > 0) byteLength = cl;
      }
    } catch {
    }
  }
  if (byteLength === void 0) {
    const head = await store.get(path, { offset: 0, length: 1 });
    byteLength = head.totalSize ?? head.bytes.byteLength;
  }
  return {
    byteLength,
    async slice(start, end) {
      const e = end ?? byteLength;
      const length = e - start;
      if (length <= 0) return new ArrayBuffer(0);
      const r = await store.get(path, { offset: start, length });
      return r.bytes.buffer.slice(
        r.bytes.byteOffset,
        r.bytes.byteOffset + r.bytes.byteLength
      );
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AUDIO,
  Breadcrumb,
  CODE_LANG,
  DirListing,
  FileTree,
  IMAGE,
  MediaViewer,
  TEXTY,
  TextViewer,
  VIDEO,
  asyncBufferFromStore,
  basename,
  extOf,
  fmtSize,
  keyToSplat,
  makeMatcher,
  parsePath
});
//# sourceMappingURL=index.cjs.map