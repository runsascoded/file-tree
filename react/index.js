// src/react/FileTree.tsx
import { useEffect as useEffect6, useMemo as useMemo3, useState as useState7 } from "react";
import { useLocation } from "react-router-dom";

// src/react/Breadcrumb.tsx
import { Link } from "react-router-dom";
import { jsx, jsxs } from "react/jsx-runtime";
function Breadcrumb({ crumbs, separator = " / ", rightSlot, renderCrumb }) {
  if (crumbs.length === 0 && !rightSlot) return null;
  return /* @__PURE__ */ jsxs("nav", { "aria-label": "Breadcrumb", style: { fontFamily: "ui-monospace, monospace", fontSize: "0.95em", marginBottom: "0.5em" }, children: [
    crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      const defaultNode = isLast ? /* @__PURE__ */ jsx("span", { style: { opacity: 0.7 }, children: c.label }) : /* @__PURE__ */ jsx(Link, { to: c.to, children: c.label });
      return /* @__PURE__ */ jsxs("span", { children: [
        i > 0 && /* @__PURE__ */ jsx("span", { style: { opacity: 0.5 }, children: separator }),
        renderCrumb ? renderCrumb({ crumb: c, index: i, isLast, defaultNode }) : defaultNode
      ] }, c.to);
    }),
    rightSlot && /* @__PURE__ */ jsx("span", { style: { marginLeft: "0.8em" }, children: rightSlot })
  ] });
}

// src/react/DirListing.tsx
import { useEffect, useMemo, useState as useState2 } from "react";
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

// src/react/persistedState.ts
import { useState } from "react";
var defaultUseState = (_key, defaultValue) => useState(defaultValue);

// src/react/DirListing.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function DirListing({ store, prefix, routeBase, rootPrefix = "", q: qExternal, setQ: setQExternal, filterPlaceholder = "filter", usePersistedState, markdownRenderer, renderCell }) {
  const [entries, setEntries] = useState2(null);
  const [error, setError] = useState2(null);
  const [cursor, setCursor] = useState2(void 0);
  const use = usePersistedState ?? defaultUseState;
  const [qInner, setQInner] = use("q", "");
  const q = qExternal ?? qInner;
  const setQ = setQExternal ?? setQInner;
  useEffect(() => {
    setQ("");
  }, [prefix]);
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
        const cell = (column, defaultNode) => renderCell ? renderCell({ entry: e, column, prefix, href, defaultNode }) : defaultNode;
        return /* @__PURE__ */ jsxs2("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.2)" }, children: [
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: cell("name", /* @__PURE__ */ jsxs2(Link2, { to: href, children: [
            e.isDir ? /* @__PURE__ */ jsx2("span", { style: { opacity: 0.6 }, children: "\u{1F4C1} " }) : null,
            name,
            e.isDir ? "/" : ""
          ] })) }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: e.isDir ? 0.4 : 1 }, children: cell("size", e.isDir ? "\u2014" : fmtSize(e.size)) }),
          /* @__PURE__ */ jsx2("td", { style: { padding: "0.3em 0", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.6, fontSize: "0.9em" }, children: cell("modified", e.lastModified?.slice(0, 10) ?? "") })
        ] }, e.key);
      }) })
    ] }),
    cursor && /* @__PURE__ */ jsx2("button", { onClick: loadMore, style: { marginTop: "0.5em" }, children: "load more" }),
    markdownRenderer && /* @__PURE__ */ jsx2(DefaultReadme, { store, entries, markdownRenderer })
  ] });
}
function DefaultReadme({ store, entries, markdownRenderer }) {
  const readme = entries.find((e) => !e.isDir && /^README\.md$/i.test(basename(e.key)));
  const [text, setText] = useState2(null);
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

// src/react/MediaViewer.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function MediaViewer({ store, path, kind }) {
  const direct = typeof store.getUrl === "function" ? store.getUrl(path) : null;
  const [blobUrl, setBlobUrl] = useState3(null);
  const [error, setError] = useState3(null);
  useEffect2(() => {
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
  if (error) return /* @__PURE__ */ jsxs3("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  const src = direct ?? blobUrl;
  if (!src) return /* @__PURE__ */ jsxs3("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  if (kind === "image") {
    return /* @__PURE__ */ jsx3(
      "img",
      {
        src,
        alt: path,
        style: { maxWidth: "100%", maxHeight: "80vh", display: "block", borderRadius: 4 }
      }
    );
  }
  if (kind === "audio") {
    return /* @__PURE__ */ jsx3(
      "audio",
      {
        src,
        controls: true,
        preload: "metadata",
        style: { display: "block", width: "100%", maxWidth: 600 }
      }
    );
  }
  return /* @__PURE__ */ jsx3(
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
import { useEffect as useEffect3, useState as useState4 } from "react";
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var HEAD_BYTES = 64 * 1024;
function TextViewer({ store, path, markdownRenderer, jsonRenderer, codeRenderer, codeLang, usePersistedState }) {
  const [text, setText] = useState4(null);
  const [totalSize, setTotalSize] = useState4(void 0);
  const [error, setError] = useState4(null);
  const [loadingMore, setLoadingMore] = useState4(false);
  const fetchFull = !!markdownRenderer || !!jsonRenderer || !!codeRenderer;
  useEffect3(() => {
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
  if (error) return /* @__PURE__ */ jsxs4("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (text == null) return /* @__PURE__ */ jsxs4("div", { style: { opacity: 0.6 }, children: [
    "loading ",
    path,
    "\u2026"
  ] });
  const truncated = totalSize != null && text.length < totalSize;
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    markdownRenderer ? /* @__PURE__ */ jsx4("div", { className: "rdub-file-tree-markdown", "data-path": path, children: markdownRenderer(text) }) : jsonRenderer ? /* @__PURE__ */ jsx4("div", { className: "rdub-file-tree-json", "data-path": path, children: jsonRenderer(text, usePersistedState) }) : codeRenderer ? /* @__PURE__ */ jsx4("div", { className: "rdub-file-tree-code", "data-path": path, "data-lang": codeLang, children: codeRenderer(text, codeLang ?? "") }) : /* @__PURE__ */ jsx4("pre", { style: {
      background: "rgba(127,127,127,0.08)",
      padding: "0.6em 0.8em",
      borderRadius: 4,
      overflow: "auto",
      maxHeight: "80vh",
      fontSize: "0.85em",
      fontFamily: "ui-monospace, monospace",
      whiteSpace: "pre-wrap"
    }, children: text }),
    truncated && /* @__PURE__ */ jsxs4("div", { style: { marginTop: "0.5em", fontSize: "0.85em", opacity: 0.7 }, children: [
      "showing first ",
      fmtSize(text.length),
      " of ",
      fmtSize(totalSize),
      " ",
      /* @__PURE__ */ jsx4("button", { onClick: loadAll, disabled: loadingMore, children: loadingMore ? "loading\u2026" : "load all" })
    ] })
  ] });
}

// src/react/ZipEntryList.tsx
import { useEffect as useEffect4, useState as useState5 } from "react";
import { Link as Link3 } from "react-router-dom";

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
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function ZipEntryList({ store, path, routeBase, rootPrefix = "" }) {
  const [resp, setResp] = useState5(null);
  const [error, setError] = useState5(null);
  useEffect4(() => {
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
  if (error) return /* @__PURE__ */ jsxs5("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!resp) return /* @__PURE__ */ jsxs5("div", { style: { opacity: 0.6 }, children: [
    "reading central directory of ",
    path,
    "\u2026"
  ] });
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  const splat = keyToSplat(path, rootPrefix);
  return /* @__PURE__ */ jsxs5(Fragment3, { children: [
    /* @__PURE__ */ jsxs5("p", { style: { opacity: 0.7, fontSize: "0.95em", margin: "0 0 0.6em" }, children: [
      /* @__PURE__ */ jsx5("b", { children: resp.entries.length }),
      " entries \xB7 uncompressed",
      " ",
      /* @__PURE__ */ jsx5("b", { children: fmtSize(resp.totalSize) }),
      " \xB7 compressed",
      " ",
      /* @__PURE__ */ jsx5("b", { children: fmtSize(resp.totalCompressed) })
    ] }),
    /* @__PURE__ */ jsxs5("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [
      /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs5("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
        /* @__PURE__ */ jsx5("th", { style: { padding: "0.2em 0.6em 0.2em 0", fontWeight: 400 }, children: "name" }),
        /* @__PURE__ */ jsx5("th", { style: { padding: "0.2em 0.6em", fontWeight: 400, textAlign: "right" }, children: "size" }),
        /* @__PURE__ */ jsx5("th", { style: { padding: "0.2em 0.6em", fontWeight: 400, textAlign: "right" }, children: "compressed" }),
        /* @__PURE__ */ jsx5("th", { style: { padding: "0.2em 0", fontWeight: 400, textAlign: "right" }, children: "method" })
      ] }) }),
      /* @__PURE__ */ jsx5("tbody", { children: resp.entries.map((e) => {
        const href = `${baseTrimmed}/${splat}!/${e.name}`;
        const methodLabel = e.method === 0 ? "store" : e.method === 8 ? "deflate" : `m${e.method}`;
        return /* @__PURE__ */ jsxs5("tr", { style: { borderTop: "1px solid rgba(127,127,127,0.2)" }, children: [
          /* @__PURE__ */ jsx5("td", { style: { padding: "0.3em 0.6em 0.3em 0", fontFamily: "ui-monospace, monospace" }, children: /* @__PURE__ */ jsx5(Link3, { to: href, children: e.name }) }),
          /* @__PURE__ */ jsx5("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: fmtSize(e.size) }),
          /* @__PURE__ */ jsx5("td", { style: { padding: "0.3em 0.6em", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.7 }, children: fmtSize(e.compressedSize) }),
          /* @__PURE__ */ jsx5("td", { style: { padding: "0.3em 0", textAlign: "right", opacity: 0.7, fontSize: "0.9em" }, children: methodLabel })
        ] }, e.name);
      }) })
    ] })
  ] });
}

// src/react/ZipEntryPreview.tsx
import { useEffect as useEffect5, useMemo as useMemo2, useState as useState6 } from "react";
import { Fragment as Fragment4, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var STREAMING_PREVIEW_BYTES = 256 * 1024;
var FULL_FETCH_THRESHOLD = 4 * 1024 * 1024;
function ZipEntryPreview({ store, path, entry, markdownRenderer }) {
  const [bytes, setBytes] = useState6(null);
  const [totalSize, setTotalSize] = useState6(void 0);
  const [error, setError] = useState6(null);
  const ext = useMemo2(() => extOf(entry), [entry]);
  useEffect5(() => {
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
  const blobUrl = useMemo2(() => {
    if (!bytes || !IMAGE.has(ext)) return null;
    return URL.createObjectURL(new Blob([bytes]));
  }, [bytes, ext]);
  useEffect5(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);
  if (error) return /* @__PURE__ */ jsxs6("div", { style: { color: "salmon" }, children: [
    "error: ",
    error
  ] });
  if (!bytes) return /* @__PURE__ */ jsxs6("div", { style: { opacity: 0.6 }, children: [
    "inflating ",
    entry,
    "\u2026"
  ] });
  const truncated = totalSize != null && totalSize > FULL_FETCH_THRESHOLD && bytes.byteLength < totalSize;
  const banner = truncated && totalSize != null ? /* @__PURE__ */ jsx6(TruncationBanner, { shown: bytes.byteLength, total: totalSize }) : null;
  if (TEXTY.has(ext)) {
    const text = new TextDecoder().decode(bytes);
    const isMd = ext === "md" || ext === "markdown";
    return /* @__PURE__ */ jsxs6(Fragment4, { children: [
      banner,
      isMd && markdownRenderer ? /* @__PURE__ */ jsx6("div", { className: "rdub-file-tree-markdown", "data-entry": entry, children: markdownRenderer(text) }) : /* @__PURE__ */ jsx6("pre", { style: {
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
    return /* @__PURE__ */ jsxs6(Fragment4, { children: [
      banner,
      /* @__PURE__ */ jsx6(
        "img",
        {
          src: blobUrl,
          alt: entry,
          style: { maxWidth: "100%", maxHeight: "80vh", display: "block", borderRadius: 4 }
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs6("div", { style: { opacity: 0.7 }, children: [
    "Inline preview not supported for ",
    /* @__PURE__ */ jsxs6("code", { children: [
      ".",
      ext
    ] }),
    " entries."
  ] });
}
function TruncationBanner({ shown, total }) {
  return /* @__PURE__ */ jsxs6("div", { style: {
    background: "rgba(220, 165, 60, 0.12)",
    border: "1px solid rgba(220, 165, 60, 0.4)",
    padding: "0.5em 0.8em",
    borderRadius: 4,
    marginBottom: "0.6em",
    fontSize: "0.9em"
  }, children: [
    /* @__PURE__ */ jsx6("b", { children: "Streaming preview:" }),
    " showing the first ",
    fmtSize(shown),
    " of ",
    fmtSize(total),
    "."
  ] });
}

// src/react/FileTree.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function FileTree({ store, routeBase, rootPrefix = "", extraTexty, title, className, style, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer, viewerActions, renderCell, renderCrumb, filterPlaceholder, usePersistedState }) {
  const location = useLocation();
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`);
  const splat = location.pathname.replace(baseRe, "");
  const parsed = useMemo3(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty]);
  const crumbs = useMemo3(() => buildCrumbs(parsed, routeBase, rootPrefix), [parsed, routeBase, rootPrefix]);
  const downloadable = parsed.kind !== "dir" && parsed.kind !== "zipEntry";
  const downloadName = downloadable ? basename(parsed.path) : "";
  const downloadHref = useDownloadHref(store, downloadable ? parsed.path : null);
  const ctx = parsed.kind === "dir" ? null : {
    store,
    path: parsed.path,
    kind: parsed.kind,
    ...parsed.kind === "zipEntry" ? { entry: parsed.entry } : {}
  };
  const actionsNode = ctx && viewerActions ? viewerActions(ctx) : null;
  const right = downloadHref || actionsNode ? /* @__PURE__ */ jsxs7("span", { style: { display: "inline-flex", alignItems: "center", gap: "0.6em" }, children: [
    actionsNode,
    downloadHref && /* @__PURE__ */ jsx7(DownloadIcon, { href: downloadHref, name: downloadName })
  ] }) : void 0;
  return /* @__PURE__ */ jsxs7("div", { className, style, children: [
    title && /* @__PURE__ */ jsx7("h1", { style: { fontSize: "1.4em", margin: "0 0 0.3em" }, children: title }),
    /* @__PURE__ */ jsx7(Breadcrumb, { crumbs, rightSlot: right, renderCrumb }),
    /* @__PURE__ */ jsx7(Body, { store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer, renderCell, filterPlaceholder, usePersistedState })
  ] });
}
function Body({ store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer, renderCell, filterPlaceholder, usePersistedState }) {
  switch (parsed.kind) {
    case "dir":
      return /* @__PURE__ */ jsx7(DirListing, { store, prefix: parsed.prefix, routeBase, rootPrefix, markdownRenderer, renderCell, filterPlaceholder, usePersistedState });
    case "text": {
      const ext = extOf(parsed.path);
      const isMd = ext === "md" || ext === "markdown";
      const isJson = ext === "json";
      const isCsv = ext === "csv" || ext === "tsv";
      const lang = CODE_LANG[ext];
      if (isCsv && csvRenderer) {
        const Component = csvRenderer;
        return /* @__PURE__ */ jsx7(Component, { store, path: parsed.path, delimiter: ext === "tsv" ? "	" : ",", usePersistedState });
      }
      return /* @__PURE__ */ jsx7(
        TextViewer,
        {
          store,
          path: parsed.path,
          markdownRenderer: isMd ? markdownRenderer : void 0,
          jsonRenderer: isJson ? jsonRenderer : void 0,
          codeRenderer: !isMd && !isJson && lang ? codeRenderer : void 0,
          codeLang: lang,
          usePersistedState
        }
      );
    }
    case "zip":
      return /* @__PURE__ */ jsx7(ZipEntryList, { store, path: parsed.path, routeBase, rootPrefix });
    case "zipEntry":
      return /* @__PURE__ */ jsx7(ZipEntryPreview, { store, path: parsed.path, entry: parsed.entry, markdownRenderer });
    case "parquet": {
      if (!parquetRenderer) return /* @__PURE__ */ jsx7(UnsupportedView, { label: "Parquet preview" });
      const Component = parquetRenderer;
      return /* @__PURE__ */ jsx7(Component, { store, path: parsed.path, usePersistedState });
    }
    case "notebook": {
      if (!notebookRenderer) return /* @__PURE__ */ jsx7(UnsupportedView, { label: "Notebook preview" });
      const Component = notebookRenderer;
      return /* @__PURE__ */ jsx7(Component, { store, path: parsed.path, usePersistedState });
    }
    case "image":
      return /* @__PURE__ */ jsx7(MediaViewer, { store, path: parsed.path, kind: "image" });
    case "video":
      return /* @__PURE__ */ jsx7(MediaViewer, { store, path: parsed.path, kind: "video" });
    case "audio":
      return /* @__PURE__ */ jsx7(MediaViewer, { store, path: parsed.path, kind: "audio" });
    case "pdf":
      return /* @__PURE__ */ jsx7(UnsupportedView, { label: "PDF preview" });
    case "binary":
      return /* @__PURE__ */ jsx7("div", { style: { opacity: 0.7 }, children: "Preview not supported for this file type." });
  }
}
function useDownloadHref(store, path) {
  const syncHref = path != null && typeof store.getUrl === "function" ? store.getUrl(path) : null;
  const [asyncHref, setAsyncHref] = useState7(null);
  useEffect6(() => {
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
  return /* @__PURE__ */ jsx7(
    "a",
    {
      href,
      download: name,
      title: `Download ${name}`,
      "aria-label": `Download ${name}`,
      style: { textDecoration: "none", display: "inline-block", lineHeight: 1, verticalAlign: "middle" },
      children: /* @__PURE__ */ jsxs7(
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
            /* @__PURE__ */ jsx7("path", { d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5" }),
            /* @__PURE__ */ jsx7("path", { d: "M16.5 12 12 16.5 7.5 12" }),
            /* @__PURE__ */ jsx7("path", { d: "M12 3v13.5" })
          ]
        }
      )
    }
  );
}
function UnsupportedView({ label }) {
  return /* @__PURE__ */ jsxs7("div", { style: { opacity: 0.7 }, children: [
    label,
    " not yet supported in this version."
  ] });
}
function buildCrumbs(parsed, routeBase, rootPrefix) {
  const path = parsed.kind === "dir" ? parsed.prefix : parsed.kind === "zipEntry" ? `${parsed.path}!/${parsed.entry}` : parsed.path;
  const splat = keyToSplat(path, rootPrefix);
  const parts = splat.split("/").filter((p) => p.length > 0);
  const baseTrimmed = routeBase.replace(/\/+$/, "");
  const crumbs = [{ label: "root", to: `${baseTrimmed}/`, path: rootPrefix }];
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
export {
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
  ZipEntryList,
  ZipEntryPreview,
  asyncBufferFromStore,
  basename,
  extOf,
  fmtSize,
  keyToSplat,
  makeMatcher,
  parsePath,
  readZipEntries,
  readZipEntry
};
//# sourceMappingURL=index.js.map