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

// src/react/index.ts
var react_exports = {};
__export(react_exports, {
  AUDIO: () => AUDIO,
  BinaryView: () => BinaryView,
  Breadcrumb: () => Breadcrumb,
  CODECS: () => CODECS,
  CODE_LANG: () => CODE_LANG,
  CompressedView: () => CompressedView,
  DirListing: () => DirListing,
  FileTree: () => FileTree,
  HEXDUMP_BYTES: () => HEXDUMP_BYTES,
  IMAGE: () => IMAGE,
  JSONL: () => JSONL,
  MAX_COMPRESSED_BYTES: () => MAX_COMPRESSED_BYTES,
  MAX_DECOMPRESSED_BYTES: () => MAX_DECOMPRESSED_BYTES,
  MediaViewer: () => MediaViewer,
  PdfViewer: () => PdfViewer,
  RegistryViewer: () => RegistryViewer,
  SnapshotNotFoundError: () => SnapshotNotFoundError,
  TEXTY: () => TEXTY,
  TEXT_NAMES: () => TEXT_NAMES,
  TarEntryList: () => TarEntryList,
  TarMember: () => TarMember,
  TextViewer: () => TextViewer,
  TreeTooLargeError: () => TreeTooLargeError,
  VIDEO: () => VIDEO,
  ZipEntryList: () => ZipEntryList,
  ZipEntryPreview: () => ZipEntryPreview,
  asyncBufferFromStore: () => asyncBufferFromStore,
  basename: () => basename,
  bytesStore: () => bytesStore,
  decompress: () => decompress,
  diffLevels: () => diffLevels,
  diffNode: () => diffNode,
  diffStatus: () => diffStatus,
  diskTreeTreeSource: () => diskTreeTreeSource,
  extOf: () => extOf,
  findViewer: () => findViewer,
  fmtSize: () => fmtSize,
  hexdump: () => hexdump,
  httpTreeSource: () => httpTreeSource,
  isPlainClick: () => isPlainClick,
  keyToSplat: () => keyToSplat,
  looksLikeText: () => looksLikeText,
  makeMatcher: () => makeMatcher,
  markdownCtx: () => markdownCtx,
  parseFileKey: () => parseFileKey,
  parsePath: () => parsePath,
  parseTar: () => parseTar,
  readTar: () => readTar,
  readZipEntries: () => readZipEntries,
  readZipEntry: () => readZipEntry,
  resolveTreeHref: () => resolveTreeHref,
  resolveTreeKey: () => resolveTreeKey,
  tarCodec: () => tarCodec,
  tarEntryBytes: () => tarEntryBytes,
  walkTreeSource: () => walkTreeSource
});
module.exports = __toCommonJS(react_exports);

// src/react/FileTree.tsx
var import_react12 = require("react");
var import_react_router_dom5 = require("react-router-dom");

// src/react/parsePath.ts
var TEXTY = /* @__PURE__ */ new Set([
  "txt",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "ndjson",
  "md",
  "markdown",
  "log",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
  "sql",
  "sh",
  "bash",
  "zsh",
  "py",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "html",
  "css",
  "scss",
  "xml",
  "go",
  "rs",
  "rb",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "gitignore",
  "dockerignore",
  "editorconfig"
]);
var TEXT_NAMES = /* @__PURE__ */ new Set([
  "Makefile",
  "Dockerfile",
  "Justfile",
  "Procfile",
  "Gemfile",
  "Rakefile",
  "Vagrantfile",
  "LICENSE",
  "LICENCE",
  "COPYING",
  "NOTICE",
  "AUTHORS",
  "README",
  "CHANGELOG",
  "CODEOWNERS"
]);
var JSONL = /* @__PURE__ */ new Set(["jsonl", "ndjson"]);
var CODECS = { gz: "gzip", gzip: "gzip", zst: "zstd", zstd: "zstd" };
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
    const path = key.slice(0, bangIdx);
    const entry = key.slice(bangIdx + 2);
    const tar = tarCodec(path);
    if (tar !== null) return { kind: "tarEntry", path, entry, ...tar ? { codec: tar } : {} };
    return { kind: "zipEntry", path, entry };
  }
  if (key === "" || key === root) return { kind: "dir", prefix: root };
  if (key.endsWith("/")) return { kind: "dir", prefix: key };
  if (!extOf(key) && !TEXT_NAMES.has(basename(key))) return { kind: "dir", prefix: key + "/" };
  return parseFileKey(key, texty);
}
function tarCodec(key) {
  const ext = extOf(key);
  if (ext === "tar") return "";
  if (ext === "tgz") return "gzip";
  const codec = CODECS[ext];
  if (codec && extOf(key.slice(0, -(ext.length + 1))) === "tar") return codec;
  return null;
}
function parseFileKey(key, texty = TEXTY) {
  const ext = extOf(key);
  const tar = tarCodec(key);
  if (tar !== null) return { kind: "tar", path: key, ...tar ? { codec: tar } : {} };
  const codec = CODECS[ext];
  if (codec) return { kind: "compressed", path: key, codec, inner: key.slice(0, -(ext.length + 1)) };
  if (ext === "zip") return { kind: "zip", path: key };
  if (ext === "pqt" || ext === "parquet") return { kind: "parquet", path: key };
  if (ext === "ipynb") return { kind: "notebook", path: key };
  if (ext === "pdf") return { kind: "pdf", path: key };
  if (IMAGE.has(ext)) return { kind: "image", path: key };
  if (VIDEO.has(ext)) return { kind: "video", path: key };
  if (AUDIO.has(ext)) return { kind: "audio", path: key };
  if (texty.has(ext) || TEXT_NAMES.has(basename(key))) return { kind: "text", path: key };
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

// src/react/markdownLinks.ts
var SCHEME = /^[a-z][a-z0-9+.-]*:/i;
function resolveTreeKey(href, fileKey, rootPrefix = "") {
  if (!href || SCHEME.test(href) || href.startsWith("/") || href.startsWith("#") || href.startsWith("?")) return null;
  const m = /^([^?#]*)(.*)$/.exec(href);
  const [, rel, suffix] = m;
  const dir = fileKey.slice(0, fileKey.lastIndexOf("/") + 1);
  const parts = `${dir}${rel}`.split("/");
  const out = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (!out.length) return null;
      out.pop();
    } else {
      out.push(p);
    }
  }
  const isDir = ["", ".", ".."].includes(parts[parts.length - 1]);
  const key = out.join("/") + (isDir && out.length ? "/" : "");
  if (!key.startsWith(rootPrefix)) return null;
  return { key, suffix };
}
function resolveTreeHref(href, fileKey, opts) {
  const r = resolveTreeKey(href, fileKey, opts.rootPrefix);
  if (!r) return null;
  return `${opts.routeBase.replace(/\/+$/, "")}/${keyToSplat(r.key, opts.rootPrefix)}${r.suffix}`;
}
function markdownCtx(path, opts) {
  const { store, routeBase, rootPrefix = "", navigate } = opts;
  return {
    path,
    navigate,
    resolveHref: (href) => {
      const to = resolveTreeHref(href, path, { routeBase, rootPrefix });
      return to === null ? { href, internal: false } : { href: to, internal: true };
    },
    resolveSrc: (src) => {
      const r = resolveTreeKey(src, path, rootPrefix);
      if (!r || r.key.endsWith("/") || !store.getUrl) return src;
      try {
        return store.getUrl(decodeURIComponent(r.key), { inline: true }) + r.suffix;
      } catch {
        return src;
      }
    }
  };
}
function isPlainClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

// src/react/Breadcrumb.tsx
var import_react_router_dom = require("react-router-dom");
var import_jsx_runtime = require("react/jsx-runtime");
function Breadcrumb({ crumbs, separator = " / ", rightSlot, renderCrumb }) {
  if (crumbs.length === 0 && !rightSlot) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", { "aria-label": "Breadcrumb", style: { fontFamily: "ui-monospace, monospace", fontSize: "0.95em", marginBottom: "0.5em" }, children: [
    crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      const defaultNode = c.kind === "home" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: c.to, children: c.label }) : isLast ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.7 }, children: c.label }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react_router_dom.Link, { to: c.to, children: c.label });
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        i > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.5 }, children: separator }),
        renderCrumb ? renderCrumb({ crumb: c, index: i, isLast, defaultNode }) : defaultNode
      ] }, `${c.kind ?? "tree"}:${c.to}`);
    }),
    rightSlot && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: "0.8em" }, children: rightSlot })
  ] });
}

// src/react/DirListing.tsx
var import_react2 = require("react");
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

// src/react/persistedState.ts
var import_react = require("react");
var defaultUseState = (_key, defaultValue) => (0, import_react.useState)(defaultValue);

// src/react/DirListing.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function useDirSizes(treeSource, prefix, rootPrefix) {
  const [sizes, setSizes] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    setSizes(null);
    if (!treeSource) return;
    let cancelled = false;
    const treePath = keyToSplat(prefix, rootPrefix).replace(/\/+$/, "");
    treeSource.children({ path: treePath }).then(
      (level) => {
        if (cancelled) return;
        const m = /* @__PURE__ */ new Map();
        for (const c of level.children) {
          if (c.kind === "dir" && c.size != null) m.set(`${prefix}${c.name}/`, c.size);
        }
        setSizes(m);
      },
      () => {
        if (!cancelled) setSizes(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [treeSource, prefix, rootPrefix]);
  return sizes;
}
function dirSize(sizes, key) {
  const s = sizes?.get(key);
  return s == null ? "\u2014" : fmtSize(s);
}
function scrubMatchesRow(scrub, rowPath) {
  return scrub != null && (scrub === rowPath || scrub.startsWith(rowPath + "/"));
}
function DirListing({ store, prefix, routeBase, rootPrefix = "", q: qExternal, setQ: setQExternal, filterPlaceholder = "filter", usePersistedState, markdownRenderer, renderCell, treeSource, onHoverPath, highlightedPath, selectedPath }) {
  const [entries, setEntries] = (0, import_react2.useState)(null);
  const [error, setError] = (0, import_react2.useState)(null);
  const [cursor, setCursor] = (0, import_react2.useState)(void 0);
  const use = usePersistedState ?? defaultUseState;
  const [qInner, setQInner] = use("q", "");
  const q = qExternal ?? qInner;
  const setQ = setQExternal ?? setQInner;
  (0, import_react2.useEffect)(() => {
    setQ("");
  }, [prefix]);
  (0, import_react2.useEffect)(() => {
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
  const dirSizes = useDirSizes(treeSource, prefix, rootPrefix);
  const matcher = (0, import_react2.useMemo)(() => makeMatcher(q), [q]);
  const filtered = (0, import_react2.useMemo)(() => {
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
        placeholder: filterPlaceholder,
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
        const rowPath = splat.replace(/\/+$/, "");
        const cell = (column, defaultNode) => renderCell ? renderCell({ entry: e, column, prefix, href, defaultNode }) : defaultNode;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "tr",
          {
            onMouseEnter: onHoverPath ? () => onHoverPath(rowPath) : void 0,
            onMouseLeave: onHoverPath ? () => onHoverPath(null) : void 0,
            style: {
              borderTop: "1px solid rgba(127,127,127,0.2)",
              background: scrubMatchesRow(highlightedPath, rowPath) ? "rgba(127,127,127,0.16)" : scrubMatchesRow(selectedPath, rowPath) ? "rgba(74,158,255,0.18)" : void 0
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: cell("name", /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_react_router_dom2.Link, { to: href, children: [
                e.isDir ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { opacity: 0.6 }, children: "\u{1F4C1} " }) : null,
                name,
                e.isDir ? "/" : ""
              ] })) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: e.isDir && !dirSizes?.has(e.key) ? 0.4 : 1 }, children: cell("size", e.isDir ? dirSize(dirSizes, e.key) : fmtSize(e.size)) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: { padding: "0.3em 0", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6, fontSize: "0.9em" }, children: cell("modified", e.lastModified?.slice(0, 10) ?? "") })
            ]
          },
          e.key
        );
      }) })
    ] }),
    cursor && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: loadMore, style: { marginTop: "0.5em" }, children: "load more" }),
    markdownRenderer && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DefaultReadme, { store, entries, markdownRenderer, routeBase, rootPrefix })
  ] });
}
function DefaultReadme({ store, entries, markdownRenderer, routeBase, rootPrefix }) {
  const navigate = (0, import_react_router_dom2.useNavigate)();
  const readme = entries.find((e) => !e.isDir && /^README\.md$/i.test(basename(e.key)));
  const [text, setText] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
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
        markdownRenderer(text, markdownCtx(readme.key, { store, routeBase, rootPrefix, navigate }))
      ]
    }
  );
}

// src/react/MediaViewer.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function MediaViewer({ store, path, kind }) {
  const direct = typeof store.getUrl === "function" ? store.getUrl(path, { inline: true }) : null;
  const [blobUrl, setBlobUrl] = (0, import_react3.useState)(null);
  const [error, setError] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
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

// src/react/PdfViewer.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function PdfViewer({ store, path }) {
  const direct = typeof store.getUrl === "function" ? store.getUrl(path, { inline: true }) : null;
  const [blobUrl, setBlobUrl] = (0, import_react4.useState)(null);
  const [error, setError] = (0, import_react4.useState)(null);
  (0, import_react4.useEffect)(() => {
    if (direct) return;
    let cancelled = false;
    let createdUrl = null;
    setBlobUrl(null);
    setError(null);
    store.get(path).then((r) => {
      if (cancelled) return;
      const blob = new Blob([r.bytes], { type: "application/pdf" });
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
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  const src = direct ?? blobUrl;
  if (!src) return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "iframe",
    {
      src,
      title: path,
      style: { width: "100%", height: "80vh", border: "none", borderRadius: 4 }
    }
  );
}

// src/react/TextViewer.tsx
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var HEAD_BYTES = 64 * 1024;
function TextViewer({ store, path, markdownRenderer, jsonRenderer, codeRenderer, codeLang, usePersistedState }) {
  const [text, setText] = (0, import_react5.useState)(null);
  const [totalSize, setTotalSize] = (0, import_react5.useState)(void 0);
  const [error, setError] = (0, import_react5.useState)(null);
  const [loadingMore, setLoadingMore] = (0, import_react5.useState)(false);
  const fetchFull = !!markdownRenderer || !!jsonRenderer || !!codeRenderer;
  (0, import_react5.useEffect)(() => {
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
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (text == null) return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  const truncated = totalSize != null && text.length < totalSize;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    markdownRenderer ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "rdub-file-tree-markdown", "data-path": path, children: markdownRenderer(text) }) : jsonRenderer ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "rdub-file-tree-json", "data-path": path, children: jsonRenderer(text, usePersistedState) }) : codeRenderer ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "rdub-file-tree-code", "data-path": path, "data-lang": codeLang, children: codeRenderer(text, codeLang ?? "") }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { style: {
      background: "rgba(127,127,127,0.08)",
      padding: "0.6em 0.8em",
      borderRadius: 4,
      overflow: "auto",
      maxHeight: "80vh",
      fontSize: "0.85em",
      fontFamily: "ui-monospace, monospace",
      whiteSpace: "pre-wrap"
    }, children: text }),
    truncated && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: "0.5em", fontSize: "0.85em", opacity: 0.7 }, children: [
      "showing first ",
      fmtSize(text.length),
      " of ",
      fmtSize(totalSize),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { onClick: loadAll, disabled: loadingMore, children: loadingMore ? "loading\u2026" : "load all" })
    ] })
  ] });
}

// src/react/ZipEntryList.tsx
var import_react6 = require("react");
var import_react_router_dom3 = require("react-router-dom");

// src/react/zip.ts
var SIG_EOCD = 101010256;
var SIG_CENTRAL_DIR = 33639248;
var SIG_LOCAL_FILE = 67324752;
var EOCD_MIN_SIZE = 22;
var EOCD_PROBE_BYTES = 64 * 1024 + EOCD_MIN_SIZE;
async function readZipEntries(store, path) {
  const sizeProbe = await store.get(path, { offset: 0, length: 1 });
  let total = sizeProbe.totalSize;
  if (total == null) {
    if (typeof store.getUrl === "function") {
      const r = await fetch(store.getUrl(path), { method: "HEAD" });
      if (r.ok) {
        const cl = parseInt(r.headers.get("Content-Length") ?? "", 10);
        if (Number.isFinite(cl) && cl > 0) total = cl;
      }
    }
  }
  if (total == null) throw new Error(`zip: can't determine size of ${path}`);
  const probeLen = Math.min(EOCD_PROBE_BYTES, total);
  const probeOffset = total - probeLen;
  const probe = await store.get(path, { offset: probeOffset, length: probeLen });
  const eocd = findEocd(probe.bytes);
  if (!eocd) throw new Error(`zip: end-of-central-directory record not found in last ${probeLen} bytes of ${path}`);
  const cdSize = eocd.cdSize;
  const cdOffset = eocd.cdOffset;
  const cdEntries = eocd.cdEntries;
  let cdBytes;
  if (cdOffset >= probeOffset && cdOffset + cdSize <= probeOffset + probeLen) {
    const start = cdOffset - probeOffset;
    cdBytes = probe.bytes.subarray(start, start + cdSize);
  } else {
    const r = await store.get(path, { offset: cdOffset, length: cdSize });
    cdBytes = r.bytes;
  }
  const entries = [];
  let totalSize = 0;
  let totalCompressed = 0;
  let off = 0;
  for (let i = 0; i < cdEntries; i++) {
    const e = parseCentralDirectoryEntry(cdBytes, off);
    entries.push(e.entry);
    totalSize += e.entry.size;
    totalCompressed += e.entry.compressedSize;
    off = e.nextOffset;
  }
  return { entries, totalSize, totalCompressed };
}
async function readZipEntry(store, path, entryName, opts = {}) {
  const dir = await readZipEntries(store, path);
  const found = dir.entries.find((e) => e.name === entryName);
  if (!found) throw new Error(`zip: entry not found: ${entryName}`);
  const LFH_FIXED = 30;
  const head = await store.get(path, { offset: found.localHeaderOffset, length: LFH_FIXED });
  const v = new DataView(head.bytes.buffer, head.bytes.byteOffset, head.bytes.byteLength);
  if (v.getUint32(0, true) !== SIG_LOCAL_FILE) {
    throw new Error(`zip: bad local-file-header signature for ${entryName}`);
  }
  const fileNameLen = v.getUint16(26, true);
  const extraLen = v.getUint16(28, true);
  const dataOffset = found.localHeaderOffset + LFH_FIXED + fileNameLen + extraLen;
  const r = await store.get(path, { offset: dataOffset, length: found.compressedSize });
  let out;
  if (found.method === 0) {
    out = opts.max != null && r.bytes.byteLength > opts.max ? r.bytes.subarray(0, opts.max) : r.bytes;
  } else if (found.method === 8) {
    out = await inflateDeflateRaw(r.bytes, opts.max);
  } else {
    throw new Error(`zip: unsupported compression method ${found.method} for ${entryName}`);
  }
  const result = { bytes: out, totalSize: found.size };
  return result;
}
function findEocd(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (v.getUint32(i, true) !== SIG_EOCD) continue;
    const cdEntries = v.getUint16(i + 10, true);
    const cdSize = v.getUint32(i + 12, true);
    const cdOffset = v.getUint32(i + 16, true);
    return { cdSize, cdOffset, cdEntries };
  }
  return null;
}
function parseCentralDirectoryEntry(bytes, offset) {
  const v = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
  if (v.getUint32(0, true) !== SIG_CENTRAL_DIR) {
    throw new Error(`zip: bad central-directory-header signature at offset ${offset}`);
  }
  const method = v.getUint16(10, true);
  const dosTime = v.getUint16(12, true);
  const dosDate = v.getUint16(14, true);
  const compressedSize = v.getUint32(20, true);
  const size = v.getUint32(24, true);
  const fileNameLen = v.getUint16(28, true);
  const extraLen = v.getUint16(30, true);
  const commentLen = v.getUint16(32, true);
  const localHeaderOffset = v.getUint32(42, true);
  const fixedSize = 46;
  const nameBytes = bytes.subarray(offset + fixedSize, offset + fixedSize + fileNameLen);
  const name = new TextDecoder("utf-8").decode(nameBytes);
  const entry = {
    name,
    size,
    compressedSize,
    method,
    localHeaderOffset,
    lastModified: dosTimeToIso(dosDate, dosTime)
  };
  return { entry, nextOffset: offset + fixedSize + fileNameLen + extraLen + commentLen };
}
function dosTimeToIso(dosDate, dosTime) {
  if (dosDate === 0 && dosTime === 0) return void 0;
  const year = (dosDate >> 9 & 127) + 1980;
  const month = dosDate >> 5 & 15;
  const day = dosDate & 31;
  const hour = dosTime >> 11 & 31;
  const minute = dosTime >> 5 & 63;
  const second = (dosTime & 31) * 2;
  if (month < 1 || month > 12 || day < 1 || day > 31) return void 0;
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}
async function inflateDeflateRaw(input, max) {
  const DS = globalThis.DecompressionStream;
  if (!DS) throw new Error("zip: DecompressionStream not available; need a modern browser or Worker runtime");
  const stream = new Blob([input]).stream().pipeThrough(new DS("deflate-raw"));
  const chunks = [];
  let produced = 0;
  const reader = stream.getReader();
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (max != null && produced + value.byteLength > max) {
      chunks.push(value.subarray(0, max - produced));
      produced = max;
      reader.cancel().catch(() => {
      });
      break;
    }
    chunks.push(value);
    produced += value.byteLength;
  }
  const out = new Uint8Array(produced);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

// src/react/ZipEntryList.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function ZipEntryList({ store, path, routeBase, rootPrefix = "" }) {
  const [resp, setResp] = (0, import_react6.useState)(null);
  const [error, setError] = (0, import_react6.useState)(null);
  (0, import_react6.useEffect)(() => {
    let cancelled = false;
    setResp(null);
    setError(null);
    const fetcher = store.getZipEntries ? store.getZipEntries.bind(store) : (p) => readZipEntries(store, p);
    fetcher(path).then((r) => {
      if (!cancelled) setResp(r);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!resp) return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "reading central directory of ",
    path,
    "\u2026"
  ] });
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  const splat = keyToSplat(path, rootPrefix);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: resp.entries.length }),
      " entries \xB7 uncompressed",
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: fmtSize(resp.totalSize) }),
      " \xB7 compressed",
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: fmtSize(resp.totalCompressed) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.2em 0.6em 0.2em 0", fontWeight: 400 }, children: "name" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.2em 0.6em", fontWeight: 400, textAlign: "right" }, children: "size" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.2em 0.6em", fontWeight: 400, textAlign: "right" }, children: "compressed" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { style: { padding: "0.2em 0", fontWeight: 400, textAlign: "right" }, children: "method" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: resp.entries.map((e) => {
        const href = `${baseTrimmed}/${splat}!/${e.name}`;
        const methodLabel = e.method === 0 ? "store" : e.method === 8 ? "deflate" : `m${e.method}`;
        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.2)" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_react_router_dom3.Link, { to: href, children: e.name }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: fmtSize(e.size) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.7 }, children: fmtSize(e.compressedSize) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { style: { padding: "0.3em 0", textAlign: "right", opacity: 0.7, fontSize: "0.9em" }, children: methodLabel })
        ] }, e.name);
      }) })
    ] })
  ] });
}

// src/react/ZipEntryPreview.tsx
var import_react7 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
var STREAMING_PREVIEW_BYTES = 256 * 1024;
var FULL_FETCH_THRESHOLD = 4 * 1024 * 1024;
function ZipEntryPreview({ store, path, entry, markdownRenderer }) {
  const [bytes, setBytes] = (0, import_react7.useState)(null);
  const [totalSize, setTotalSize] = (0, import_react7.useState)(void 0);
  const [error, setError] = (0, import_react7.useState)(null);
  const ext = (0, import_react7.useMemo)(() => extOf(entry), [entry]);
  (0, import_react7.useEffect)(() => {
    let cancelled = false;
    setBytes(null);
    setError(null);
    setTotalSize(void 0);
    const fetcher = store.getZipEntry ? store.getZipEntry.bind(store) : (p, e, opts) => readZipEntry(store, p, e, opts);
    fetcher(path, entry, { max: STREAMING_PREVIEW_BYTES + 1 }).then((r) => {
      if (cancelled) return;
      setBytes(r.bytes);
      setTotalSize(r.totalSize);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, entry]);
  const blobUrl = (0, import_react7.useMemo)(() => {
    if (!bytes || !IMAGE.has(ext)) return null;
    return URL.createObjectURL(new Blob([bytes]));
  }, [bytes, ext]);
  (0, import_react7.useEffect)(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!bytes) return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "inflating ",
    entry,
    "\u2026"
  ] });
  const truncated = totalSize != null && totalSize > FULL_FETCH_THRESHOLD && bytes.byteLength < totalSize;
  const banner = truncated && totalSize != null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(TruncationBanner, { shown: bytes.byteLength, total: totalSize }) : null;
  if (TEXTY.has(ext)) {
    const text = new TextDecoder().decode(bytes);
    const isMd = ext === "md" || ext === "markdown";
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      banner,
      isMd && markdownRenderer ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "rdub-file-tree-markdown", "data-entry": entry, children: markdownRenderer(text) }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("pre", { style: {
        background: "rgba(127,127,127,0.08)",
        padding: "0.6em 0.8em",
        borderRadius: 4,
        overflow: "auto",
        maxHeight: "80vh",
        fontSize: "0.85em",
        fontFamily: "ui-monospace, monospace",
        whiteSpace: "pre-wrap"
      }, children: text })
    ] });
  }
  if (IMAGE.has(ext) && blobUrl) {
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      banner,
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "img",
        {
          src: blobUrl,
          alt: entry,
          style: { maxWidth: "100%", maxHeight: "80vh", display: "block", borderRadius: 4 }
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { opacity: 0.7 }, children: [
    "Inline preview not supported for ",
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("code", { children: [
      ".",
      ext
    ] }),
    " entries."
  ] });
}
function TruncationBanner({ shown, total }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: {
    background: "rgba(220, 165, 60, 0.12)",
    border: "1px solid rgba(220, 165, 60, 0.4)",
    padding: "0.5em 0.8em",
    borderRadius: 4,
    marginBottom: "0.6em",
    fontSize: "0.9em"
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: "Streaming preview:" }),
    " showing the first ",
    fmtSize(shown),
    " of ",
    fmtSize(total),
    "."
  ] });
}

// src/react/BinaryView.tsx
var import_react8 = require("react");

// src/react/hexdump.ts
function hexdump(bytes, base = 0) {
  const lines = [];
  for (let o = 0; o < bytes.length; o += 16) {
    const row = bytes.subarray(o, o + 16);
    let hex = "";
    let ascii = "";
    for (let i = 0; i < 16; i++) {
      if (i === 8) hex += " ";
      if (i < row.length) {
        const b = row[i];
        hex += b.toString(16).padStart(2, "0") + " ";
        ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
      } else {
        hex += "   ";
      }
    }
    lines.push(`${(base + o).toString(16).padStart(8, "0")}  ${hex} |${ascii}|`);
  }
  return lines;
}
function looksLikeText(bytes) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, trimPartialUtf8(bytes)));
    return true;
  } catch {
    return false;
  }
}
function trimPartialUtf8(bytes) {
  const n = bytes.length;
  for (let back = 1; back <= Math.min(3, n); back++) {
    const b = bytes[n - back];
    if ((b & 192) === 128) continue;
    const need = b >= 240 ? 4 : b >= 224 ? 3 : b >= 192 ? 2 : 1;
    return need > back ? n - back : n;
  }
  return n;
}

// src/react/BinaryView.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var HEXDUMP_BYTES = 4096;
var PRE = {
  background: "rgba(127,127,127,0.08)",
  padding: "0.6em 0.8em",
  borderRadius: 4,
  overflow: "auto",
  maxHeight: "80vh",
  fontSize: "0.85em",
  fontFamily: "ui-monospace, monospace",
  margin: 0
};
function BinaryView({ store, path }) {
  const [head, setHead] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)(null);
  (0, import_react8.useEffect)(() => {
    let cancelled = false;
    setHead(null);
    setError(null);
    store.get(path, store.capabilities?.range ? { offset: 0, length: HEXDUMP_BYTES } : void 0).then((r) => {
      if (cancelled) return;
      const bytes = r.bytes.subarray(0, HEXDUMP_BYTES);
      setHead({ bytes, total: r.totalSize ?? r.bytes.byteLength });
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!head) return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  const text = looksLikeText(head.bytes);
  const shown = head.total != null && head.total > head.bytes.byteLength ? `first ${fmtSize(head.bytes.byteLength)} of ${fmtSize(head.total)}` : fmtSize(head.bytes.byteLength);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { opacity: 0.7, fontSize: "0.85em", margin: "0 0 0.5em" }, children: [
      text ? "Unknown type; reads as text" : "Binary",
      " \xB7 ",
      shown
    ] }),
    text ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { "data-testid": "binary-text", style: { ...PRE, whiteSpace: "pre-wrap" }, children: new TextDecoder().decode(head.bytes) }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { "data-testid": "hexdump", style: PRE, children: hexdump(head.bytes).join("\n") })
  ] });
}

// src/react/TarEntryList.tsx
var import_react9 = require("react");
var import_react_router_dom4 = require("react-router-dom");

// src/react/decompress.ts
var MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
var MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
function concat(chunks, n) {
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}
async function gunzip(input, max) {
  const DS = globalThis.DecompressionStream;
  if (!DS) throw new Error("gzip: DecompressionStream not available; need a modern browser or Worker runtime");
  const reader = new Blob([input]).stream().pipeThrough(new DS("gzip")).getReader();
  const chunks = [];
  let produced = 0;
  let truncated = false;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      if (produced + value.byteLength > max) {
        chunks.push(value.subarray(0, max - produced));
        produced = max;
        truncated = true;
        reader.cancel().catch(() => {
        });
        break;
      }
      chunks.push(value);
      produced += value.byteLength;
    }
  } catch (e) {
    if (!produced) throw e;
    truncated = true;
  }
  return { bytes: concat(chunks, produced), truncated };
}
async function unzstd(input, max) {
  const { Decompress } = await import("fzstd");
  const chunks = [];
  let produced = 0;
  let truncated = false;
  const d = new Decompress((chunk) => {
    if (truncated) return;
    if (produced + chunk.byteLength > max) {
      chunks.push(chunk.subarray(0, max - produced));
      produced = max;
      truncated = true;
      return;
    }
    chunks.push(chunk);
    produced += chunk.byteLength;
  });
  const STEP = 1 << 20;
  try {
    for (let o = 0; o < input.byteLength && !truncated; o += STEP) {
      const end = Math.min(o + STEP, input.byteLength);
      d.push(input.subarray(o, end), end === input.byteLength);
    }
  } catch (e) {
    if (!produced) throw e;
    truncated = true;
  }
  return { bytes: concat(chunks, produced), truncated };
}
async function decompress(input, codec, opts = {}) {
  const max = opts.max ?? MAX_DECOMPRESSED_BYTES;
  const r = codec === "gzip" ? await gunzip(input, max) : await unzstd(input, max);
  return opts.inputTruncated ? { ...r, truncated: true } : r;
}

// src/react/tar.ts
var BLOCK = 512;
var DEC = new TextDecoder();
function str(b, off, len) {
  const s = b.subarray(off, off + len);
  const nul = s.indexOf(0);
  return DEC.decode(nul < 0 ? s : s.subarray(0, nul));
}
function num(b, off, len) {
  if (b[off] & 128) {
    let n = b[off] & 127;
    for (let i = 1; i < len; i++) n = n * 256 + b[off + i];
    return n;
  }
  const s = str(b, off, len).trim();
  return s ? parseInt(s, 8) : 0;
}
function paxRecords(data) {
  const out = {};
  let o = 0;
  while (o < data.length) {
    const sp = data.indexOf(32, o);
    if (sp < 0) break;
    const len = parseInt(DEC.decode(data.subarray(o, sp)), 10);
    if (!len) break;
    const rec = DEC.decode(data.subarray(sp + 1, o + len - 1));
    const eq = rec.indexOf("=");
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    o += len;
  }
  return out;
}
function typeOf(flag) {
  if (flag === "" || flag === "0" || flag === "7") return "file";
  if (flag === "5") return "dir";
  if (flag === "2") return "symlink";
  return "other";
}
function parseTar(bytes) {
  const entries = [];
  let o = 0;
  let longName;
  let pax = {};
  while (o + BLOCK <= bytes.length) {
    const h = bytes.subarray(o, o + BLOCK);
    if (h.every((b) => b === 0)) break;
    const flag = str(h, 156, 1);
    const size = num(h, 124, 12);
    const dataOffset = o + BLOCK;
    const next = dataOffset + Math.ceil(size / BLOCK) * BLOCK;
    if (flag === "L") {
      longName = str(bytes, dataOffset, size);
    } else if (flag === "x") {
      pax = paxRecords(bytes.subarray(dataOffset, dataOffset + size));
    } else if (flag === "g") {
    } else {
      const magic = str(h, 257, 6);
      const prefix = magic.startsWith("ustar") ? str(h, 345, 155) : "";
      const base = str(h, 0, 100);
      let name = pax.path ?? longName ?? (prefix ? `${prefix}/${base}` : base);
      const type = typeOf(flag);
      if (type === "dir" && !name.endsWith("/")) name += "/";
      const realSize = pax.size !== void 0 ? Number(pax.size) : size;
      const mtime = pax.mtime !== void 0 ? Number(pax.mtime) : num(h, 136, 12);
      const linkName = pax.linkpath ?? str(h, 157, 100);
      entries.push({
        name: name.replace(/^\.\//, ""),
        size: realSize,
        type,
        ...mtime ? { lastModified: new Date(mtime * 1e3).toISOString() } : {},
        ...type === "symlink" && linkName ? { linkName } : {},
        offset: dataOffset
      });
      longName = void 0;
      pax = {};
      o = dataOffset + Math.ceil(realSize / BLOCK) * BLOCK;
      continue;
    }
    o = next;
  }
  return entries.filter((e) => e.name !== "" && e.name !== "./");
}
function tarEntryBytes(archive, entry) {
  return archive.bytes.subarray(entry.offset, Math.min(entry.offset + entry.size, archive.bytes.length));
}
async function load(store, path, codec) {
  const cap = codec ? MAX_COMPRESSED_BYTES : MAX_DECOMPRESSED_BYTES;
  const r = await store.get(path, store.capabilities?.range ? { offset: 0, length: cap } : void 0);
  const raw = r.bytes.byteLength > cap ? r.bytes.subarray(0, cap) : r.bytes;
  const inputTruncated = (r.totalSize ?? r.bytes.byteLength) > raw.byteLength;
  const { bytes, truncated } = codec ? await decompress(raw, codec, { inputTruncated }) : { bytes: raw, truncated: inputTruncated };
  return { entries: parseTar(bytes), bytes, truncated };
}
var cache = /* @__PURE__ */ new WeakMap();
function readTar(store, path, codec) {
  let byPath = cache.get(store);
  if (!byPath) {
    byPath = /* @__PURE__ */ new Map();
    cache.set(store, byPath);
  }
  let p = byPath.get(path);
  if (!p) {
    p = load(store, path, codec);
    p.catch(() => byPath.delete(path));
    byPath.set(path, p);
  }
  return p;
}

// src/react/TarEntryList.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
var TD = { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" };
function TarEntryList({ store, path, codec, routeBase, rootPrefix = "" }) {
  const [archive, setArchive] = (0, import_react9.useState)(null);
  const [error, setError] = (0, import_react9.useState)(null);
  (0, import_react9.useEffect)(() => {
    let cancelled = false;
    setArchive(null);
    setError(null);
    readTar(store, path, codec).then((a) => {
      if (!cancelled) setArchive(a);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, codec]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!archive) return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "reading ",
    path,
    "\u2026"
  ] });
  const href = (name) => `${routeBase.replace(/\/+$/, "")}/${keyToSplat(path, rootPrefix)}!/${name}`;
  const files = archive.entries.filter((e) => e.type === "file");
  const total = files.reduce((n, e) => n + e.size, 0);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: files.length }),
      " files \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: fmtSize(total) }),
      codec && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        " \xB7 ",
        codec
      ] })
    ] }),
    archive.truncated && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { "data-testid": "tar-truncated", style: { fontSize: "0.9em", margin: "0 0 0.6em", color: "rgb(220,165,60)" }, children: [
      "Archive read stopped at ",
      fmtSize(archive.bytes.byteLength),
      "; members past that point aren't listed."
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { style: { padding: "0.2em 0.6em 0.2em 0", fontWeight: 400 }, children: "name" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { style: { ...TD, padding: "0.2em 0.6em", fontWeight: 400 }, children: "size" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { style: { ...TD, padding: "0.2em 0", fontWeight: 400 }, children: "modified" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("tbody", { children: archive.entries.map((e) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.2)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: e.type === "file" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_react_router_dom4.Link, { to: href(e.name), children: e.name }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: { opacity: 0.7 }, children: [
          e.name,
          e.linkName ? ` \u2192 ${e.linkName}` : ""
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { style: TD, children: e.type === "file" ? fmtSize(e.size) : "" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { style: { ...TD, padding: "0.3em 0", opacity: 0.7 }, children: e.lastModified?.slice(0, 10) ?? "" })
      ] }, e.name)) })
    ] })
  ] });
}

// src/react/VirtualFile.tsx
var import_react10 = require("react");

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/react/bytesStore.ts
function bytesStore(key, load2, opts = {}) {
  let bytes;
  const read = () => bytes ??= load2();
  return {
    capabilities: { range: true },
    describe: () => opts.describe,
    async list() {
      return { entries: [] };
    },
    async get(path, range) {
      if (path !== key) throw new NotFoundError(path);
      const all = await read();
      const out = range ? all.subarray(range.offset, range.offset + range.length) : all;
      return { bytes: out, totalSize: all.byteLength };
    }
  };
}

// src/react/VirtualFile.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function useLoaded(load2, deps) {
  const [state, setState] = (0, import_react10.useState)({});
  (0, import_react10.useEffect)(() => {
    let cancelled = false;
    setState({});
    load2().then((loaded) => {
      if (!cancelled) setState({ loaded });
    }).catch((e) => {
      if (!cancelled) setState({ error: String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, deps);
  return state;
}
function Note({ children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { opacity: 0.7, fontSize: "0.85em", margin: "0 0 0.5em" }, children });
}
function Virtual({ vkey, state, label, render }) {
  const { loaded, error } = state;
  const store = (0, import_react10.useMemo)(
    () => loaded ? bytesStore(vkey, async () => loaded.bytes) : null,
    [vkey, loaded]
  );
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!loaded || !store) return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { opacity: 0.6 }, children: [
    "reading ",
    vkey,
    "\u2026"
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Note, { children: label(loaded) }),
    render(store, vkey)
  ] });
}
function CompressedView({ store, path, codec, inner, render }) {
  const state = useLoaded(async () => {
    const r = await store.get(path, store.capabilities?.range ? { offset: 0, length: MAX_COMPRESSED_BYTES } : void 0);
    const raw = r.bytes.byteLength > MAX_COMPRESSED_BYTES ? r.bytes.subarray(0, MAX_COMPRESSED_BYTES) : r.bytes;
    const compressed = r.totalSize ?? r.bytes.byteLength;
    const d = await decompress(raw, codec, { inputTruncated: compressed > raw.byteLength });
    return { ...d, compressed };
  }, [store, path, codec]);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    Virtual,
    {
      vkey: inner,
      state,
      render,
      label: (l) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { "data-testid": "decompressed-note", children: [
        codec,
        ": ",
        fmtSize(l.compressed),
        " \u2192 ",
        fmtSize(l.bytes.byteLength),
        l.truncated && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("b", { children: [
          " (truncated: showing the first ",
          fmtSize(l.bytes.byteLength),
          ")"
        ] })
      ] })
    }
  );
}
function TarMember({ store, path, entry, codec, render }) {
  const state = useLoaded(async () => {
    const archive = await readTar(store, path, codec);
    const e = archive.entries.find((x) => x.name === entry);
    if (!e) throw new Error(`tar: no member ${entry} in ${path}`);
    const bytes = tarEntryBytes(archive, e);
    return { bytes, truncated: bytes.byteLength < e.size };
  }, [store, path, entry, codec]);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    Virtual,
    {
      vkey: `${path}!/${entry}`,
      state,
      render,
      label: (l) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { "data-testid": "tar-member-note", children: [
        "member of ",
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: path }),
        " \xB7 ",
        fmtSize(l.bytes.byteLength),
        l.truncated && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: " (truncated: the archive read stopped partway through this member)" })
      ] })
    }
  );
}

// src/react/viewers.tsx
var import_react11 = require("react");
var import_jsx_runtime11 = require("react/jsx-runtime");
var lazyCache = /* @__PURE__ */ new Map();
function lazyFor(entry) {
  let C = lazyCache.get(entry.id);
  if (!C) {
    C = (0, import_react11.lazy)(entry.load);
    lazyCache.set(entry.id, C);
  }
  return C;
}
function findViewer(viewers, path) {
  if (!viewers?.length) return void 0;
  const ctx = { path, ext: extOf(path) };
  return viewers.find((v) => v.match(ctx));
}
function RegistryViewer({ entry, store, path, usePersistedState, fallback }) {
  const Component = lazyFor(entry);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_react11.Suspense, { fallback: fallback ?? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: { opacity: 0.6 }, children: "loading viewer\u2026" }), children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Component, { store, path, usePersistedState, ...entry.options ?? {} }) });
}

// src/react/FileTree.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function FileTree({ store, routeBase, rootPrefix = "", extraTexty, title, titleHref, home, className, style, markdownRenderer, parquetRenderer, parquetOptions, viewers, jsonRenderer, jsonlRenderer, csvRenderer, notebookRenderer, pdfRenderer, codeRenderer, viewerActions, renderCell, renderCrumb, filterPlaceholder, usePersistedState, treeSource, treemapRenderer }) {
  const location = (0, import_react_router_dom5.useLocation)();
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`);
  const splat = location.pathname.replace(baseRe, "");
  const parsed = (0, import_react12.useMemo)(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty]);
  const texty = (0, import_react12.useMemo)(() => extraTexty ? /* @__PURE__ */ new Set([...TEXTY, ...extraTexty]) : TEXTY, [extraTexty]);
  const crumbs = (0, import_react12.useMemo)(() => {
    const tree = buildCrumbs(parsed, routeBase, rootPrefix, store.describe?.() ?? "root");
    return home ? [{ label: home.label, to: home.href, kind: "home" }, ...tree] : tree;
  }, [parsed, routeBase, rootPrefix, home]);
  const downloadable = parsed.kind !== "dir" && parsed.kind !== "zipEntry" && parsed.kind !== "tarEntry";
  const downloadName = downloadable ? basename(parsed.path) : "";
  const downloadHref = useDownloadHref(store, downloadable ? parsed.path : null);
  const ctx = parsed.kind === "dir" ? null : {
    store,
    path: parsed.path,
    kind: parsed.kind,
    ...parsed.kind === "zipEntry" || parsed.kind === "tarEntry" ? { entry: parsed.entry } : {}
  };
  const actionsNode = ctx && viewerActions ? viewerActions(ctx) : null;
  const right = downloadHref || actionsNode ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.6em" }, children: [
    actionsNode,
    downloadHref && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(DownloadIcon, { href: downloadHref, name: downloadName })
  ] }) : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className, style, children: [
    title && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h1", { style: { fontSize: "1.4em", margin: "0 0 0.3em" }, children: titleHref ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "a",
      {
        href: titleHref,
        style: { color: "inherit", textDecoration: "none" },
        onMouseEnter: (e) => {
          e.currentTarget.style.textDecoration = "underline";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.textDecoration = "none";
        },
        children: title
      }
    ) : title }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Breadcrumb, { crumbs, rightSlot: right, renderCrumb }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Body, { store, parsed, texty, routeBase, rootPrefix, markdownRenderer, parquetRenderer, parquetOptions, viewers, jsonRenderer, jsonlRenderer, csvRenderer, notebookRenderer, pdfRenderer, codeRenderer, renderCell, filterPlaceholder, usePersistedState, treeSource, treemapRenderer })
  ] });
}
function Body(props) {
  const { store, parsed, texty, routeBase, rootPrefix, markdownRenderer, parquetRenderer, parquetOptions, viewers, jsonRenderer, jsonlRenderer, csvRenderer, notebookRenderer, pdfRenderer, codeRenderer, renderCell, filterPlaceholder, usePersistedState, treeSource, treemapRenderer } = props;
  const inner = (s, key) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Body, { ...props, store: s, parsed: parseFileKey(key, texty) });
  const navigate = (0, import_react_router_dom5.useNavigate)();
  if (parsed.kind !== "dir" && parsed.kind !== "zipEntry" && parsed.kind !== "tarEntry") {
    const entry = findViewer(viewers, parsed.path);
    if (entry) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(RegistryViewer, { entry, store, path: parsed.path, usePersistedState });
  }
  switch (parsed.kind) {
    case "dir": {
      const listing = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(DirListing, { store, prefix: parsed.prefix, routeBase, rootPrefix, markdownRenderer, renderCell, filterPlaceholder, usePersistedState, treeSource });
      if (!treeSource || !treemapRenderer) return listing;
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        DirView,
        {
          treeSource,
          treemapRenderer,
          prefix: parsed.prefix,
          routeBase,
          rootPrefix,
          rootLabel: store.describe?.() ?? "root",
          usePersistedState,
          listing
        }
      );
    }
    case "text": {
      const ext = extOf(parsed.path);
      const isMd = ext === "md" || ext === "markdown";
      const isJson = ext === "json";
      const isCsv = ext === "csv" || ext === "tsv";
      const lang = CODE_LANG[ext];
      if (isCsv && csvRenderer) {
        const Component = csvRenderer;
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Component, { store, path: parsed.path, delimiter: ext === "tsv" ? "	" : ",", usePersistedState });
      }
      if (JSONL.has(ext) && jsonlRenderer) {
        const Component = jsonlRenderer;
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Component, { store, path: parsed.path, usePersistedState });
      }
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        TextViewer,
        {
          store,
          path: parsed.path,
          markdownRenderer: isMd && markdownRenderer ? (s) => markdownRenderer(s, markdownCtx(parsed.path, { store, routeBase, rootPrefix, navigate })) : void 0,
          jsonRenderer: isJson ? jsonRenderer : void 0,
          codeRenderer: !isMd && !isJson && lang ? codeRenderer : void 0,
          codeLang: lang,
          usePersistedState
        }
      );
    }
    case "zip":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ZipEntryList, { store, path: parsed.path, routeBase, rootPrefix });
    case "zipEntry":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ZipEntryPreview, { store, path: parsed.path, entry: parsed.entry, markdownRenderer });
    case "tar":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TarEntryList, { store, path: parsed.path, codec: parsed.codec, routeBase, rootPrefix });
    case "tarEntry":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TarMember, { store, path: parsed.path, entry: parsed.entry, codec: parsed.codec, render: inner });
    case "compressed":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(CompressedView, { store, path: parsed.path, codec: parsed.codec, inner: parsed.inner, render: inner });
    case "parquet": {
      if (!parquetRenderer) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(UnsupportedView, { label: "Parquet preview" });
      const Component = parquetRenderer;
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Component, { store, path: parsed.path, usePersistedState, ...parquetOptions });
    }
    case "notebook": {
      if (!notebookRenderer) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(UnsupportedView, { label: "Notebook preview" });
      const Component = notebookRenderer;
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Component, { store, path: parsed.path, usePersistedState });
    }
    case "image":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(MediaViewer, { store, path: parsed.path, kind: "image" });
    case "video":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(MediaViewer, { store, path: parsed.path, kind: "video" });
    case "audio":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(MediaViewer, { store, path: parsed.path, kind: "audio" });
    case "pdf": {
      if (pdfRenderer) {
        const Component = pdfRenderer;
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Component, { store, path: parsed.path, usePersistedState });
      }
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(PdfViewer, { store, path: parsed.path });
    }
    case "binary":
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(BinaryView, { store, path: parsed.path });
  }
}
function DirView({ treeSource, treemapRenderer: Map2, prefix, routeBase, rootPrefix, rootLabel, usePersistedState, listing }) {
  const use = usePersistedState ?? defaultUseState;
  const navigate = (0, import_react_router_dom5.useNavigate)();
  const [stored, setView] = use("view", "split");
  const view = stored === "tree" || stored === "split" ? stored : "list";
  const treePath = keyToSplat(prefix, rootPrefix).replace(/\/+$/, "");
  const [hovered, setHovered] = (0, import_react12.useState)(null);
  const [selected, setSelected] = (0, import_react12.useState)(null);
  (0, import_react12.useEffect)(() => {
    setSelected(null);
    setHovered(null);
  }, [treePath]);
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  const navigateTo = (p) => navigate(`${baseTrimmed}/${p}/`);
  const map = (height, onHover) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
    Map2,
    {
      source: treeSource,
      path: treePath,
      rootLabel,
      height,
      highlightedPath: hovered,
      selectedPath: selected,
      onSelectPath: setSelected,
      onNavigate: navigateTo,
      onHoverPath: onHover
    }
  );
  const scrubListing = (0, import_react12.isValidElement)(listing) ? (0, import_react12.cloneElement)(
    listing,
    { highlightedPath: hovered, selectedPath: selected, onHoverPath: setHovered }
  ) : listing;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ViewToggle, { view, setView }),
    view === "tree" && map(),
    view === "list" && listing,
    view === "split" && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "1em" }, children: [
      scrubListing,
      map("45vh", setHovered)
    ] })
  ] });
}
function ViewToggle({ view, setView }) {
  const btn = (v, label, path) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
    "button",
    {
      type: "button",
      onClick: () => setView(v),
      "aria-pressed": view === v,
      "aria-label": label,
      title: label,
      style: {
        display: "inline-flex",
        alignItems: "center",
        padding: "0.15em 0.45em",
        background: view === v ? "var(--ft-toggle-on, #e0e0e0)" : "transparent",
        border: "1px solid var(--ft-border, #ccc)",
        cursor: "pointer",
        color: "inherit",
        lineHeight: 1
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("svg", { viewBox: "0 0 24 24", width: "1.15em", height: "1.15em", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: path })
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "inline-flex", gap: 0, marginBottom: "0.5em" }, role: "group", "aria-label": "View", children: [
    btn("list", "List view", /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M8 6h13" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M8 12h13" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M8 18h13" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M3 6h.01" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M3 12h.01" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M3 18h.01" })
    ] })),
    btn("tree", "Treemap view", /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("rect", { x: "3", y: "3", width: "8", height: "8", rx: "1" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("rect", { x: "13", y: "3", width: "8", height: "5", rx: "1" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("rect", { x: "13", y: "10", width: "8", height: "11", rx: "1" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("rect", { x: "3", y: "13", width: "8", height: "8", rx: "1" })
    ] })),
    btn("split", "Split view (list + map)", /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M4 6h16" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M4 9h16" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("rect", { x: "4", y: "13", width: "7", height: "7", rx: "1" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("rect", { x: "13", y: "13", width: "7", height: "7", rx: "1" })
    ] }))
  ] });
}
function useDownloadHref(store, path) {
  const syncHref = path != null && typeof store.getUrl === "function" ? store.getUrl(path) : null;
  const [asyncHref, setAsyncHref] = (0, import_react12.useState)(null);
  (0, import_react12.useEffect)(() => {
    if (path == null || typeof store.getDownloadUrl !== "function") {
      setAsyncHref(null);
      return;
    }
    let cancelled = false;
    setAsyncHref(null);
    store.getDownloadUrl(path).then(
      (url) => {
        if (!cancelled) setAsyncHref(url);
      },
      () => {
        if (!cancelled) setAsyncHref(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  if (path == null) return null;
  if (typeof store.getDownloadUrl === "function") return asyncHref;
  return syncHref;
}
function DownloadIcon({ href, name }) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
    "a",
    {
      href,
      download: name,
      title: `Download ${name}`,
      "aria-label": `Download ${name}`,
      style: { textDecoration: "none", display: "inline-block", lineHeight: 1, verticalAlign: "middle" },
      children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: "1.15em",
          height: "1.15em",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M16.5 12 12 16.5 7.5 12" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M12 3v13.5" })
          ]
        }
      )
    }
  );
}
function UnsupportedView({ label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { opacity: 0.7 }, children: [
    label,
    " not yet supported in this version."
  ] });
}
function buildCrumbs(parsed, routeBase, rootPrefix, rootLabel) {
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  if (parsed.kind === "zipEntry" || parsed.kind === "tarEntry") {
    const archive = buildCrumbs({ kind: "binary", path: parsed.path }, routeBase, rootPrefix, rootLabel);
    const archiveSplat = keyToSplat(parsed.path, rootPrefix);
    return [...archive, { label: parsed.entry, to: `${baseTrimmed}/${archiveSplat}!/${parsed.entry}`, path: `${parsed.path}!/${parsed.entry}` }];
  }
  const path = parsed.kind === "dir" ? parsed.prefix : parsed.path;
  const splat = keyToSplat(path, rootPrefix);
  const parts = splat.split("/").filter((p) => p.length > 0);
  const crumbs = [{ label: rootLabel, to: `${baseTrimmed}/`, path: rootPrefix }];
  let cum = "";
  for (const p of parts) {
    cum = cum ? `${cum}/${p}` : p;
    const isFileLeaf = parsed.kind !== "dir" && cum === splat;
    crumbs.push({
      label: basename(p),
      to: `${baseTrimmed}/${cum}${parsed.kind === "dir" && cum === splat ? "/" : ""}`,
      path: `${rootPrefix}${cum}${isFileLeaf ? "" : "/"}`
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

// src/renderers/treeSource.ts
var TreeTooLargeError = class extends Error {
  constructor(message, nodesWalked) {
    super(message);
    this.nodesWalked = nodesWalked;
  }
  nodesWalked;
  name = "TreeTooLargeError";
};
var SnapshotNotFoundError = class extends Error {
  constructor(snapshot) {
    super(`no such snapshot: ${snapshot}`);
    this.snapshot = snapshot;
  }
  snapshot;
  name = "SnapshotNotFoundError";
};
function diffStatus(a, b) {
  if (!a) return "added";
  if (!b) return "removed";
  if (a.size !== b.size || (a.nDesc ?? null) !== (b.nDesc ?? null) || a.kind !== b.kind) return "changed";
  if ((a.mtime ?? null) !== (b.mtime ?? null)) return "touched";
  return "unchanged";
}
function diffNode(a, b) {
  const n = b ?? a;
  return {
    path: n.path,
    name: n.name,
    kind: n.kind,
    status: diffStatus(a, b),
    sizeA: a ? a.size : null,
    sizeB: b ? b.size : null,
    nDescA: a?.nDesc ?? null,
    nDescB: b?.nDesc ?? null
  };
}
function diffLevels(a, b) {
  if (!a && !b) throw new Error("diffLevels: node absent from both snapshots");
  const aKids = new Map((a?.children ?? []).map((c) => [c.path, c]));
  const bPaths = new Set((b?.children ?? []).map((c) => c.path));
  const children = [
    ...(b?.children ?? []).map((c) => diffNode(aKids.get(c.path) ?? null, c)),
    ...(a?.children ?? []).filter((c) => !bPaths.has(c.path)).map((c) => diffNode(c, null))
  ];
  return { node: diffNode(a?.node ?? null, b?.node ?? null), children };
}
function nodeName(path) {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

// src/renderers/walkTreeSource.ts
var DEFAULT_MAX_NODES = 5e4;
function toEpoch(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1e3) : null;
}
function maxMtime(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
async function listAll(store, prefix) {
  const out = [];
  let cursor;
  for (let i = 0; i < 1e3; i++) {
    const r = await store.list(prefix, cursor ? { cursor } : void 0);
    out.push(...r.entries);
    if (!r.cursor) return out;
    cursor = r.cursor;
  }
  throw new Error(`walkTreeSource: cursor did not terminate under ${prefix}`);
}
function walkTreeSource(store, opts = {}) {
  const root = opts.root ?? "";
  const rootLabel = opts.rootLabel ?? "root";
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const levels = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  const keyFor = (path) => path ? `${root}${path}/` : root;
  async function build(path, walked) {
    const entries = await listAll(store, keyFor(path));
    const children2 = [];
    let size = 0;
    let nDesc = 0;
    let mtime = null;
    for (const e of entries) {
      walked.n++;
      if (walked.n > maxNodes) {
        throw new TreeTooLargeError(
          `tree under ${keyFor(path) || "(root)"} exceeds ${maxNodes} entries`,
          walked.n
        );
      }
      const name = nodeName(e.key);
      const childPath = path ? `${path}/${name}` : name;
      if (e.isDir) {
        const sub = await build(childPath, walked);
        children2.push(sub);
        size += sub.node.size ?? 0;
        nDesc += 1 + (sub.node.nDesc ?? 0);
        mtime = maxMtime(mtime, sub.node.mtime ?? null);
      } else {
        const fileMtime = toEpoch(e.lastModified);
        children2.push({
          node: {
            path: childPath,
            name,
            kind: "file",
            size: e.size ?? 0,
            mtime: fileMtime
          },
          children: []
        });
        size += e.size ?? 0;
        nDesc += 1;
        mtime = maxMtime(mtime, fileMtime);
      }
    }
    const node = {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: "dir",
      size,
      nChildren: children2.length,
      nDesc,
      mtime
    };
    return { node, children: children2 };
  }
  function cache2(built) {
    levels.set(built.node.path, {
      node: built.node,
      children: built.children.map((c) => c.node)
    });
    for (const c of built.children) if (c.node.kind === "dir") cache2(c);
  }
  async function children(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const cached = levels.get(path);
    if (cached) return cached;
    let pending = inflight.get(path);
    if (!pending) {
      pending = (async () => {
        try {
          const built = await build(path, { n: 0 });
          cache2(built);
          return levels.get(path);
        } finally {
          inflight.delete(path);
        }
      })();
      inflight.set(path, pending);
    }
    return pending;
  }
  return {
    capabilities: { history: false, diff: false, scan: false, lazy: true },
    children
  };
}

// src/renderers/diskTreeTreeSource.ts
function isoTime(t) {
  return t.replace(/^(\d{4}-\d\d-\d\d) /, "$1T");
}
var num2 = (v) => v == null ? null : v;
function diskTreeTreeSource(opts) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const root = opts.uri === "/" ? "/" : opts.uri.replace(/\/+$/, "");
  const rootLabel = opts.rootLabel ?? (nodeName(root.replace(/^[a-z0-9]+:\/\//i, "")) || "root");
  const uriFor = (path) => !path ? root : root === "/" ? `/${path}` : `${root}/${path}`;
  const join = (path, rel) => path ? `${path}/${rel}` : rel;
  async function call(url, what, init) {
    const res = await doFetch(url, init);
    let body = null;
    try {
      body = await res.json();
    } catch {
    }
    if (!res.ok) {
      const detail = body?.error ?? `${res.status} ${res.statusText}`;
      if (res.status === 404) {
        const e = new NotFoundError(what);
        e.message = `${what}: ${detail}`;
        throw e;
      }
      throw new Error(`disk-tree ${res.status}: ${detail}`);
    }
    return body;
  }
  function toNode(r, path) {
    return {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: r.kind === "dir" ? "dir" : "file",
      size: num2(r.size),
      ...r.n_children != null ? { nChildren: r.n_children } : {},
      ...r.n_desc != null ? { nDesc: r.n_desc } : {},
      mtime: num2(r.mtime),
      ...r.mtime_mean !== void 0 ? { mtimeMean: num2(r.mtime_mean) } : {}
    };
  }
  async function children(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams({ uri: uriFor(path), depth: "1", expand_single: "false" });
    if (req.snapshot) params.set("scan_id", req.snapshot);
    const r = await call(`${base}/api/scan?${params}`, uriFor(path));
    return {
      node: toNode(r.root, path),
      children: r.children.map((c) => toNode(c, join(path, c.path))),
      ...req.snapshot ? { snapshot: req.snapshot } : {}
    };
  }
  async function snapshots() {
    const params = new URLSearchParams({ uri: root });
    const rows = await call(`${base}/api/scans/history?${params}`, root);
    return rows.map((s) => ({ id: String(s.id), time: isoTime(s.time), size: s.size }));
  }
  async function diff(req) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams({ uri: uriFor(path), scan1: req.a, scan2: req.b, depth: "1" });
    let r;
    try {
      r = await call(`${base}/api/compare?${params}`, uriFor(path));
    } catch (e) {
      if (e instanceof Error && e.name === "NotFoundError") throw new SnapshotNotFoundError(`${req.a}|${req.b}`);
      throw e;
    }
    const { scan1: a, scan2: b } = r;
    const nodeStatus = a.size == null && b.size != null ? "added" : a.size != null && b.size == null ? "removed" : a.size !== b.size || a.n_desc !== b.n_desc ? "changed" : "unchanged";
    const node = {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: "dir",
      status: nodeStatus,
      sizeA: a.size,
      sizeB: b.size,
      nDescA: a.n_desc,
      nDescB: b.n_desc
    };
    const kids = r.rows.map((row) => {
      const p = join(path, row.path);
      const [sizeA, sizeB, nDescA, nDescB] = row.status === "added" ? [null, num2(row.size), null, num2(row.n_desc)] : row.status === "removed" ? [num2(row.size), null, num2(row.n_desc), null] : [num2(row.size_old), num2(row.size), num2(row.n_desc_old), num2(row.n_desc)];
      return {
        path: p,
        name: nodeName(p),
        kind: row.kind === "dir" ? "dir" : "file",
        status: row.status,
        sizeA,
        sizeB,
        nDescA,
        nDescB
      };
    });
    return { node, children: kids };
  }
  const toJob = (j) => ({
    id: j.job_id,
    status: j.status,
    error: j.error ? j.error : null
  });
  async function scan(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const res = await doFetch(`${base}/api/scan/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: uriFor(path) })
    });
    const body = await res.json();
    if (res.status === 409 && body.job_id) return { id: body.job_id, status: "running", error: null };
    if (!res.ok) throw new Error(`disk-tree ${res.status}: ${body.error ?? res.statusText}`);
    return toJob(body);
  }
  async function scanStatus(id) {
    return toJob(await call(`${base}/api/scan/status/${encodeURIComponent(id)}`, `scan job ${id}`));
  }
  const canScan = opts.scan ?? true;
  return {
    capabilities: { history: true, diff: true, scan: canScan, lazy: true },
    children,
    snapshots,
    diff,
    ...canScan ? { scan, scanStatus } : {}
  };
}

// src/renderers/httpTreeSource.ts
function httpTreeSource(opts) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const capabilities = {
    history: false,
    diff: false,
    scan: false,
    lazy: true,
    ...opts.capabilities
  };
  async function call(route, params, init) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== void 0 && v !== "") qs.set(k, String(v));
    const res = await doFetch(`${base}${route}${qs.size ? `?${qs}` : ""}`, init);
    let body = null;
    try {
      body = await res.json();
    } catch {
    }
    if (res.ok) return body;
    const b = body ?? {};
    const message = b.error ?? `${res.status} ${res.statusText}`;
    switch (b.name) {
      case "NotFoundError": {
        const e = new NotFoundError("");
        e.message = message;
        throw e;
      }
      case "SnapshotNotFoundError": {
        const e = new SnapshotNotFoundError(b.snapshot ?? "");
        e.message = message;
        throw e;
      }
      case "TreeTooLargeError":
        throw new TreeTooLargeError(message, b.nodesWalked ?? 0);
      default:
        throw new Error(message);
    }
  }
  const children = (req = {}) => call("/children", { path: req.path, depth: req.depth, snapshot: req.snapshot });
  const snapshots = async () => (await call("/snapshots", {})).snapshots;
  const diff = (req) => call("/diff", { a: req.a, b: req.b, path: req.path, depth: req.depth });
  const scan = (req = {}) => call("/scan", { path: req.path }, { method: "POST" });
  const scanStatus = (id) => call("/scan/status", { id });
  return {
    capabilities,
    children,
    ...capabilities.history ? { snapshots } : {},
    ...capabilities.diff ? { diff } : {},
    ...capabilities.scan ? { scan, scanStatus } : {}
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AUDIO,
  BinaryView,
  Breadcrumb,
  CODECS,
  CODE_LANG,
  CompressedView,
  DirListing,
  FileTree,
  HEXDUMP_BYTES,
  IMAGE,
  JSONL,
  MAX_COMPRESSED_BYTES,
  MAX_DECOMPRESSED_BYTES,
  MediaViewer,
  PdfViewer,
  RegistryViewer,
  SnapshotNotFoundError,
  TEXTY,
  TEXT_NAMES,
  TarEntryList,
  TarMember,
  TextViewer,
  TreeTooLargeError,
  VIDEO,
  ZipEntryList,
  ZipEntryPreview,
  asyncBufferFromStore,
  basename,
  bytesStore,
  decompress,
  diffLevels,
  diffNode,
  diffStatus,
  diskTreeTreeSource,
  extOf,
  findViewer,
  fmtSize,
  hexdump,
  httpTreeSource,
  isPlainClick,
  keyToSplat,
  looksLikeText,
  makeMatcher,
  markdownCtx,
  parseFileKey,
  parsePath,
  parseTar,
  readTar,
  readZipEntries,
  readZipEntry,
  resolveTreeHref,
  resolveTreeKey,
  tarCodec,
  tarEntryBytes,
  walkTreeSource
});
//# sourceMappingURL=index.cjs.map