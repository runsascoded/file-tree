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

// src/stores/mock.ts
var mock_exports = {};
__export(mock_exports, {
  MockStore: () => MockStore
});
module.exports = __toCommonJS(mock_exports);

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/mock.ts
var TEXT = new TextEncoder();
var DEFAULT_PAGE_SIZE = 100;
var DEFAULT_LM = "2026-01-01T00:00:00.000Z";
function toFile(v, defaultLM) {
  if (typeof v === "string") return { bytes: TEXT.encode(v), lastModified: defaultLM };
  if (v instanceof Uint8Array) return { bytes: v, lastModified: defaultLM };
  return { ...v, lastModified: v.lastModified ?? defaultLM };
}
function MockStore(input, opts = {}) {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const defaultLM = opts.defaultLastModified ?? DEFAULT_LM;
  const files = new Map(
    Object.entries(input).map(([k, v]) => [k, toFile(v, defaultLM)])
  );
  return {
    describe: () => opts.describe,
    async list(prefix, listOpts = {}) {
      const p = prefix === "" || prefix.endsWith("/") ? prefix : `${prefix}/`;
      const dirs = /* @__PURE__ */ new Set();
      const fileEntries = [];
      for (const [key, file] of files) {
        if (!key.startsWith(p)) continue;
        const rest = key.slice(p.length);
        if (rest.length === 0) continue;
        const slashIdx = rest.indexOf("/");
        if (slashIdx >= 0) {
          dirs.add(p + rest.slice(0, slashIdx) + "/");
        } else {
          const e = { key, size: file.bytes.byteLength, isDir: false };
          if (file.lastModified) e.lastModified = file.lastModified;
          fileEntries.push(e);
        }
      }
      const all = [
        ...Array.from(dirs).sort().map((key) => ({ key, isDir: true })),
        ...fileEntries.sort((a, b) => a.key.localeCompare(b.key))
      ];
      const offset = listOpts.cursor ? parseInt(atob(listOpts.cursor), 10) : 0;
      const limit = listOpts.limit ?? pageSize;
      const page = all.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      const result = { entries: page };
      if (nextOffset < all.length) result.cursor = btoa(String(nextOffset));
      return result;
    },
    async get(path, range) {
      const file = files.get(path);
      if (!file) throw new NotFoundError(path);
      const total = file.bytes.byteLength;
      const out = { bytes: file.bytes, totalSize: total };
      if (file.contentType) out.contentType = file.contentType;
      if (range) {
        const start = Math.max(0, range.offset);
        const end = Math.min(total, range.offset + range.length);
        out.bytes = file.bytes.slice(start, end);
      }
      return out;
    },
    capabilities: { range: true }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MockStore
});
//# sourceMappingURL=mock.cjs.map