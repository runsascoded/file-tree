// src/react/FileTree.tsx
import { useMemo as useMemo2 } from "react";
import { useLocation } from "react-router-dom";

// src/react/Breadcrumb.tsx
import { Link } from "react-router-dom";
import { jsx, jsxs } from "react/jsx-runtime";
function Breadcrumb({ crumbs, separator = " / " }) {
  if (crumbs.length === 0) return null;
  return /* @__PURE__ */ jsx("nav", { "aria-label": "Breadcrumb", style: { fontFamily: "ui-monospace, monospace", fontSize: "0.95em", marginBottom: "0.5em" }, children: crumbs.map((c, i) => /* @__PURE__ */ jsxs("span", { children: [
    i > 0 && /* @__PURE__ */ jsx("span", { style: { opacity: 0.5 }, children: separator }),
    i === crumbs.length - 1 ? /* @__PURE__ */ jsx("span", { style: { opacity: 0.7 }, children: c.label }) : /* @__PURE__ */ jsx(Link, { to: c.to, children: c.label })
  ] }, c.to)) });
}

// src/react/DirListing.tsx
import { useEffect, useMemo, useState } from "react";
import { Link as Link2 } from "react-router-dom";

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
  if (ext === "pdf") return { kind: "pdf", path: key };
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
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function DirListing({ store, prefix, routeBase, rootPrefix = "", q: qExternal, setQ: setQExternal, markdownRenderer }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(void 0);
  const [qInternal, setQInternal] = useState("");
  const q = qExternal ?? qInternal;
  const setQ = setQExternal ?? setQInternal;
  useEffect(() => {
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
  const matcher = useMemo(() => makeMatcher(q), [q]);
  const filtered = useMemo(() => {
    if (!entries) return null;
    if (!q) return entries;
    return entries.filter((e) => matcher(basename(e.key)));
  }, [entries, q, matcher]);
  if (error) return /* @__PURE__ */ jsxs2("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!entries || !filtered) return /* @__PURE__ */ jsxs2("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    prefix,
    "\u2026"
  ] });
  const filterUI = /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: "0.5em", marginBottom: "0.5em", fontSize: "0.9em" }, children: [
    /* @__PURE__ */ jsx2(
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
    /* @__PURE__ */ jsx2("span", { style: { opacity: 0.6, fontVariantNumeric: "tabular-nums" }, children: q ? /* @__PURE__ */ jsxs2(Fragment, { children: [
      filtered.length,
      " / ",
      entries.length
    ] }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
      entries.length,
      " entries"
    ] }) }),
    q && /* @__PURE__ */ jsx2("button", { onClick: () => setQ(""), style: { fontSize: "0.85em", padding: "0.2em 0.6em" }, children: "clear" })
  ] });
  if (filtered.length === 0) {
    return /* @__PURE__ */ jsxs2(Fragment, { children: [
      filterUI,
      /* @__PURE__ */ jsx2("div", { style: { opacity: 0.6 }, children: q ? /* @__PURE__ */ jsxs2(Fragment, { children: [
        "no entries match ",
        /* @__PURE__ */ jsx2("code", { children: q })
      ] }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
        "empty: ",
        /* @__PURE__ */ jsx2("code", { children: prefix })
      ] }) })
    ] });
  }
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    filterUI,
    /* @__PURE__ */ jsxs2("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
        /* @__PURE__ */ jsx2("th", { style: { padding: "0.2em 0.6em 0.2em 0", fontWeight: 400 }, children: "name" }),
        /* @__PURE__ */ jsx2("th", { style: { padding: "0.2em 0.6em", fontWeight: 400, textAlign: "right" }, children: "size" }),
        /* @__PURE__ */ jsx2("th", { style: { padding: "0.2em 0", fontWeight: 400, textAlign: "right" }, children: "modified" })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: filtered.map((e) => {
        const name = basename(e.key);
        const splat = keyToSplat(e.key, rootPrefix);
        const href = `${baseTrimmed}/${splat}`;
        return /* @__PURE__ */ jsxs2("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.2)" }, children: [
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: /* @__PURE__ */ jsxs2(Link2, { to: href, children: [
            e.isDir ? /* @__PURE__ */ jsx2("span", { style: { opacity: 0.6 }, children: "\u{1F4C1} " }) : null,
            name,
            e.isDir ? "/" : ""
          ] }) }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: e.isDir ? 0.4 : 1 }, children: e.isDir ? "\u2014" : fmtSize(e.size) }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.3em 0", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6, fontSize: "0.9em" }, children: e.lastModified?.slice(0, 10) ?? "" })
        ] }, e.key);
      }) })
    ] }),
    cursor && /* @__PURE__ */ jsx2("button", { onClick: loadMore, style: { marginTop: "0.5em" }, children: "load more" }),
    markdownRenderer && /* @__PURE__ */ jsx2(DefaultReadme, { store, entries, markdownRenderer })
  ] });
}
function DefaultReadme({ store, entries, markdownRenderer }) {
  const readme = entries.find((e) => !e.isDir && /^README\.md$/i.test(basename(e.key)));
  const [text, setText] = useState(null);
  useEffect(() => {
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
  return /* @__PURE__ */ jsxs2(
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
        /* @__PURE__ */ jsx2("div", { style: { fontSize: "0.8em", opacity: 0.6, fontFamily: "ui-monospace, monospace", marginBottom: "0.5em" }, children: basename(readme.key) }),
        markdownRenderer(text)
      ]
    }
  );
}

// src/react/TextViewer.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var HEAD_BYTES = 64 * 1024;
function TextViewer({ store, path, markdownRenderer }) {
  const [text, setText] = useState2(null);
  const [totalSize, setTotalSize] = useState2(void 0);
  const [error, setError] = useState2(null);
  const [loadingMore, setLoadingMore] = useState2(false);
  useEffect2(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    setTotalSize(void 0);
    const range = store.capabilities?.range ? { offset: 0, length: HEAD_BYTES } : void 0;
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
  }, [store, path]);
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
  if (error) return /* @__PURE__ */ jsxs3("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (text == null) return /* @__PURE__ */ jsxs3("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  const truncated = totalSize != null && text.length < totalSize;
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    markdownRenderer ? /* @__PURE__ */ jsx3("div", { className: "rdub-file-tree-markdown", "data-path": path, children: markdownRenderer(text) }) : /* @__PURE__ */ jsx3("pre", { style: {
      background: "rgba(127,127,127,0.08)",
      padding: "0.6em 0.8em",
      borderRadius: 4,
      overflow: "auto",
      maxHeight: "80vh",
      fontSize: "0.85em",
      fontFamily: "ui-monospace, monospace",
      whiteSpace: "pre-wrap"
    }, children: text }),
    truncated && /* @__PURE__ */ jsxs3("div", { style: { marginTop: "0.5em", fontSize: "0.85em", opacity: 0.7 }, children: [
      "showing first ",
      fmtSize(text.length),
      " of ",
      fmtSize(totalSize),
      " ",
      /* @__PURE__ */ jsx3("button", { onClick: loadAll, disabled: loadingMore, children: loadingMore ? "loading\u2026" : "load all" })
    ] })
  ] });
}

// src/react/FileTree.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function FileTree({ store, routeBase, rootPrefix = "", extraTexty, title, className, style, markdownRenderer }) {
  const location = useLocation();
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`);
  const splat = location.pathname.replace(baseRe, "");
  const parsed = useMemo2(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty]);
  const crumbs = useMemo2(() => buildCrumbs(parsed, routeBase, rootPrefix), [parsed, routeBase, rootPrefix]);
  return /* @__PURE__ */ jsxs4("div", { className, style, children: [
    title && /* @__PURE__ */ jsx4("h1", { style: { fontSize: "1.4em", margin: "0 0 0.3em" }, children: title }),
    /* @__PURE__ */ jsx4(Breadcrumb, { crumbs }),
    /* @__PURE__ */ jsx4(Body, { store, parsed, routeBase, rootPrefix, markdownRenderer })
  ] });
}
function Body({ store, parsed, routeBase, rootPrefix, markdownRenderer }) {
  switch (parsed.kind) {
    case "dir":
      return /* @__PURE__ */ jsx4(DirListing, { store, prefix: parsed.prefix, routeBase, rootPrefix, markdownRenderer });
    case "text": {
      const ext = extOf(parsed.path);
      const isMd = ext === "md" || ext === "markdown";
      return /* @__PURE__ */ jsx4(TextViewer, { store, path: parsed.path, markdownRenderer: isMd ? markdownRenderer : void 0 });
    }
    case "zip":
    case "zipEntry":
      return /* @__PURE__ */ jsx4(UnsupportedView, { label: "Zip preview" });
    case "parquet":
      return /* @__PURE__ */ jsx4(UnsupportedView, { label: "Parquet preview" });
    case "pdf":
      return /* @__PURE__ */ jsx4(UnsupportedView, { label: "PDF preview" });
    case "binary":
      return /* @__PURE__ */ jsx4("div", { style: { opacity: 0.7 }, children: "Preview not supported for this file type." });
  }
}
function UnsupportedView({ label }) {
  return /* @__PURE__ */ jsxs4("div", { style: { opacity: 0.7 }, children: [
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
export {
  Breadcrumb,
  DirListing,
  FileTree,
  TEXTY,
  TextViewer,
  basename,
  extOf,
  fmtSize,
  keyToSplat,
  makeMatcher,
  parsePath
};
//# sourceMappingURL=index.js.map