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

// src/stores/r2.ts
var r2_exports = {};
__export(r2_exports, {
  R2Store: () => R2Store
});
module.exports = __toCommonJS(r2_exports);

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/r2.ts
function R2Store(bucket, opts = {}) {
  const allowedPrefixes = opts.prefixes;
  const checkPrefix = (path, label) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return;
    if (allowedPrefixes.some((p) => path === p || path.startsWith(p))) return;
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(", ")}`);
  };
  return {
    async list(prefix, opts2 = {}) {
      const p = prefix.endsWith("/") || prefix === "" ? prefix : `${prefix}/`;
      if (p === "" && allowedPrefixes && allowedPrefixes.length > 0 && !allowedPrefixes.some((ap) => ap === "")) {
        const entries2 = allowedPrefixes.map((ap) => ({ key: ap.endsWith("/") ? ap : `${ap}/`, isDir: true })).sort((a, b) => a.key.localeCompare(b.key));
        return { entries: entries2 };
      }
      checkPrefix(p, "list prefix");
      const result = await bucket.list({
        prefix: p,
        delimiter: "/",
        cursor: opts2.cursor,
        limit: opts2.limit ?? 1e3
      });
      const entries = [];
      for (const dir of result.delimitedPrefixes ?? []) {
        entries.push({ key: dir, isDir: true });
      }
      for (const obj of result.objects ?? []) {
        if (obj.key === p) continue;
        entries.push({
          key: obj.key,
          size: obj.size,
          lastModified: obj.uploaded.toISOString(),
          isDir: false
        });
      }
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.key.localeCompare(b.key);
      });
      const out = { entries };
      if (result.truncated && result.cursor) out.cursor = result.cursor;
      return out;
    },
    async get(path, range) {
      checkPrefix(path, "get path");
      const obj = await bucket.get(path, range ? { range: { offset: range.offset, length: range.length } } : void 0);
      if (!obj) throw new NotFoundError(path);
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const out = { bytes, totalSize: obj.size };
      if (obj.httpMetadata?.contentType) out.contentType = obj.httpMetadata.contentType;
      return out;
    },
    capabilities: { range: true }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  R2Store
});
//# sourceMappingURL=r2.cjs.map