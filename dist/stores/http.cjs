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

// src/stores/http.ts
var http_exports = {};
__export(http_exports, {
  HttpStore: () => HttpStore
});
module.exports = __toCommonJS(http_exports);

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/http.ts
function HttpStore(apiBase, opts = {}) {
  const base = apiBase.replace(/\/+$/, "");
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const headers = opts.headers ?? {};
  return {
    async list(prefix, listOpts = {}) {
      const params = new URLSearchParams({ prefix });
      if (listOpts.cursor) params.set("cursor", listOpts.cursor);
      if (listOpts.limit) params.set("limit", String(listOpts.limit));
      const res = await f(`${base}/list?${params}`, { headers });
      if (res.status === 404) throw new NotFoundError(prefix);
      if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`);
      return res.json();
    },
    async get(path, range) {
      const params = new URLSearchParams({ path });
      const reqHeaders = { ...headers };
      if (range) {
        reqHeaders["Range"] = `bytes=${range.offset}-${range.offset + range.length - 1}`;
      }
      const res = await f(`${base}/get?${params}`, { headers: reqHeaders });
      if (res.status === 404) throw new NotFoundError(path);
      if (!res.ok && res.status !== 206) {
        throw new Error(`get ${path}: ${res.status} ${await res.text()}`);
      }
      const cr = res.headers.get("Content-Range");
      const totalSize = cr ? parseInt(cr.split("/")[1], 10) : void 0;
      const contentType = res.headers.get("Content-Type") ?? void 0;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const out = { bytes };
      if (totalSize != null && Number.isFinite(totalSize)) out.totalSize = totalSize;
      if (contentType) out.contentType = contentType;
      return out;
    },
    capabilities: { range: true }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HttpStore
});
//# sourceMappingURL=http.cjs.map