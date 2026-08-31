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

// src/og/index.ts
var og_exports = {};
__export(og_exports, {
  OG_HEIGHT: () => OG_HEIGHT,
  OG_WIDTH: () => OG_WIDTH,
  injectOgTags: () => injectOgTags,
  ogCardData: () => ogCardData,
  ogTags: () => ogTags,
  renderOgCard: () => renderOgCard
});
module.exports = __toCommonJS(og_exports);

// src/og/card.ts
var import_react = require("@disk-tree/react");

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/react/parsePath.ts
var TEXTY = /* @__PURE__ */ new Set(["txt", "csv", "tsv", "json", "md", "log", "yaml", "yml", "toml", "ini", "sql", "sh", "py", "ts", "tsx", "js", "jsx", "html", "css"]);
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

// src/og/card.ts
var OG_WIDTH = 1200;
var OG_HEIGHT = 630;
var DEFAULTS = {
  brand: "@rdub/file-tree",
  background: "#0e0f13",
  ink: "#f4f4f5",
  muted: "#9aa0aa"
};
var MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
var SANS = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
function esc(s) {
  return s.replace(/[<>&"']/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;");
}
function clipMiddle(s, n) {
  if (s.length <= n) return s;
  const head = Math.ceil((n - 1) / 2);
  const tail = Math.floor((n - 1) / 2);
  return `${s.slice(0, head)}\u2026${s.slice(s.length - tail)}`;
}
function renderOgCard(data, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const palette = opts.palette ?? import_react.DEFAULT_PALETTE;
  const W = OG_WIDTH, H = OG_HEIGHT;
  const pad = 60;
  const header = [data.storeLabel, ...data.crumbs].filter(Boolean).join(" / ");
  const title = clipMiddle(data.name || "root", 34);
  const sizeStr = data.size == null ? "" : fmtSize(data.size);
  const meta = [sizeStr, data.badge].filter(Boolean).join("  \xB7  ");
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${o.background}"/>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="8" fill="${palette[0]}"/>`);
  if (header) {
    parts.push(`<text x="${pad}" y="96" font-family="${MONO}" font-size="30" fill="${o.muted}">${esc(clipMiddle(header, 64))}</text>`);
  }
  const iconGap = 0;
  parts.push(`<text x="${pad + iconGap}" y="176" font-family="${SANS}" font-size="76" font-weight="700" fill="${o.ink}">${esc(title)}</text>`);
  if (meta) {
    parts.push(`<text x="${pad}" y="228" font-family="${MONO}" font-size="34" fill="${o.muted}">${esc(meta)}</text>`);
  }
  const bodyY = 268;
  const bodyH = H - bodyY - 92;
  const bodyW = W - pad * 2;
  if (data.kind === "dir" && data.treemap && data.treemap.length > 0) {
    parts.push(renderTreemapBody(data.treemap, pad, bodyY, bodyW, bodyH, palette, o.ink));
  } else {
    const glyph = data.kind === "dir" ? "\u{1F4C1}" : `.${data.badge || "file"}`;
    parts.push(`<rect x="${pad}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="16" fill="#ffffff" fill-opacity="0.04"/>`);
    parts.push(`<text x="${W / 2}" y="${bodyY + bodyH / 2 + 24}" text-anchor="middle" font-family="${MONO}" font-size="72" fill="${o.muted}">${esc(clipMiddle(String(glyph), 28))}</text>`);
  }
  parts.push(`<text x="${W - pad}" y="${H - 40}" text-anchor="end" font-family="${MONO}" font-size="28" fill="${o.muted}">${esc(o.brand)}</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}
function renderTreemapBody(children, x, y, w, h, palette, ink) {
  const rects = (0, import_react.squarify)([...children], x, y, w, h, (c) => c.size);
  const out = [];
  rects.forEach((r, i) => {
    const fill = palette[i % palette.length];
    out.push(`<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="${fill}" stroke="#0e0f13" stroke-width="3"/>`);
    if (r.w > 96 && r.h > 40) {
      const lx = r.x + 12;
      const ly = r.y + 34;
      out.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="${MONO}" font-size="24" font-weight="600" fill="${ink}">${esc(clipMiddle(r.it.name, Math.max(4, Math.floor(r.w / 13))))}</text>`);
      if (r.h > 70) {
        out.push(`<text x="${lx.toFixed(1)}" y="${(ly + 30).toFixed(1)}" font-family="${MONO}" font-size="22" fill="${ink}" fill-opacity="0.85">${esc(fmtSize(r.it.size))}</text>`);
      }
    }
  });
  return out.join("");
}
async function ogCardData(opts) {
  const { store, splat, treeSource, rootPrefix = "", parseOptions, maxTiles = 40 } = opts;
  const parsed = parsePath(splat, { rootPrefix, ...parseOptions });
  const storeLabel = store.describe?.();
  const key = parsed.kind === "dir" ? parsed.prefix : parsed.path;
  const treePath = keyToSplat(key, rootPrefix).replace(/^\/+|\/+$/g, "");
  const segs = treePath ? treePath.split("/") : [];
  const name = segs.length ? segs[segs.length - 1] : storeLabel ?? "root";
  const crumbs = segs.slice(0, -1);
  if (parsed.kind === "dir") {
    if (treeSource) {
      try {
        const level = await treeSource.children({ path: treePath });
        const kids = level.children.filter((c) => (c.size ?? 0) > 0).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, maxTiles).map((c) => ({ name: c.name, size: c.size ?? 0 }));
        return {
          crumbs,
          name: name === "" ? storeLabel ?? "root" : name,
          kind: "dir",
          size: level.node.size,
          storeLabel,
          badge: `${level.node.nChildren ?? level.children.length} items`,
          ...kids.length ? { treemap: kids } : {}
        };
      } catch {
      }
    }
    return { crumbs, name: name === "" ? storeLabel ?? "root" : name, kind: "dir", storeLabel };
  }
  const ext = extOf(parsed.path);
  let size = null;
  try {
    const parentKey = parsed.path.includes("/") ? parsed.path.replace(/[^/]+$/, "") : "";
    const leaf = basename(parsed.path);
    const { entries } = await store.list(parentKey);
    size = entries.find((e) => !e.isDir && basename(e.key) === leaf)?.size ?? null;
  } catch {
    size = null;
  }
  return {
    crumbs,
    name: basename(parsed.path),
    kind: "file",
    size,
    storeLabel,
    ...ext ? { badge: ext } : {}
  };
}

// src/og/html.ts
function esc2(s) {
  return s.replace(/[<>&"]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;");
}
function ogTags(meta) {
  const w = meta.imageWidth ?? 1200;
  const h = meta.imageHeight ?? 630;
  const rows = [
    ["property", "og:type", meta.type ?? "website"],
    ["property", "og:title", meta.title],
    ["property", "og:image", meta.image],
    ["property", "og:image:width", String(w)],
    ["property", "og:image:height", String(h)],
    ["name", "twitter:card", meta.twitterCard ?? "summary_large_image"],
    ["name", "twitter:title", meta.title],
    ["name", "twitter:image", meta.image]
  ];
  if (meta.description != null) {
    rows.push(["property", "og:description", meta.description]);
    rows.push(["name", "twitter:description", meta.description]);
  }
  if (meta.url != null) rows.push(["property", "og:url", meta.url]);
  if (meta.siteName != null) rows.push(["property", "og:site_name", meta.siteName]);
  return rows.map(([attr, key, val]) => `<meta ${attr}="${key}" content="${esc2(val)}">`).join("\n");
}
function injectOgTags(html, meta) {
  let out = html.replace(
    /[ \t]*<meta\b[^>]*\b(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\n?/gi,
    ""
  );
  const titleTag = `<title>${esc2(meta.title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  }
  const block = (/<title>[\s\S]*?<\/title>/i.test(out) ? "" : `${titleTag}
`) + ogTags(meta);
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${block}
</head>`);
  return block + out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OG_HEIGHT,
  OG_WIDTH,
  injectOgTags,
  ogCardData,
  ogTags,
  renderOgCard
});
//# sourceMappingURL=index.cjs.map