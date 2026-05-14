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

// src/server/index.ts
var server_exports = {};
__export(server_exports, {
  createHandlers: () => createHandlers
});
module.exports = __toCommonJS(server_exports);
function createHandlers(store, opts = {}) {
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const cors = opts.corsOrigin === void 0 ? "*" : opts.corsOrigin;
  const corsHeaders = cors ? { "Access-Control-Allow-Origin": cors } : {};
  return {
    async handle(request) {
      const url = new URL(request.url);
      const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
      if (path == null) return null;
      if (path === "/list") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const cursor = url.searchParams.get("cursor") ?? void 0;
        const limitStr = url.searchParams.get("limit");
        const limit = limitStr ? parseInt(limitStr, 10) : void 0;
        try {
          const opts2 = cursor !== void 0 || limit !== void 0 ? { cursor, limit } : void 0;
          const result = await store.list(prefix, opts2);
          return jsonResponse(result, 200, corsHeaders);
        } catch (e) {
          return errorResponse(e, corsHeaders);
        }
      }
      if (path === "/presign") {
        if (typeof store.getDownloadUrl !== "function") {
          return jsonResponse({ error: "presign not supported by this store" }, 404, corsHeaders);
        }
        const p = url.searchParams.get("path");
        if (!p) return jsonResponse({ error: "path required" }, 400, corsHeaders);
        const expStr = url.searchParams.get("expires");
        const opts2 = expStr ? { expiresIn: parseInt(expStr, 10) } : void 0;
        try {
          const signed = await store.getDownloadUrl(p, opts2);
          return jsonResponse({ url: signed }, 200, corsHeaders);
        } catch (e) {
          return errorResponse(e, corsHeaders);
        }
      }
      if (path === "/get") {
        const p = url.searchParams.get("path");
        if (!p) return jsonResponse({ error: "path required" }, 400, corsHeaders);
        const rangeHeader = request.headers.get("Range");
        const range = parseRange(rangeHeader);
        try {
          const result = await store.get(p, range ?? void 0);
          const headers = new Headers(corsHeaders);
          if (result.contentType) headers.set("Content-Type", result.contentType);
          headers.set("Content-Length", String(result.bytes.byteLength));
          const basename = p.split("/").pop() || p;
          headers.set("Content-Disposition", `attachment; filename="${basename.replace(/"/g, '\\"')}"`);
          if (range && result.totalSize != null) {
            headers.set("Content-Range", `bytes ${range.offset}-${range.offset + result.bytes.byteLength - 1}/${result.totalSize}`);
            return new Response(result.bytes, { status: 206, headers });
          }
          return new Response(result.bytes, { status: 200, headers });
        } catch (e) {
          return errorResponse(e, corsHeaders);
        }
      }
      return null;
    }
  };
}
function jsonResponse(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra }
  });
}
function errorResponse(e, extra) {
  if (e instanceof Error && e.name === "NotFoundError") {
    return jsonResponse({ error: e.message }, 404, extra);
  }
  const msg = e instanceof Error ? e.message : String(e);
  return jsonResponse({ error: msg }, 500, extra);
}
function parseRange(h) {
  if (!h) return null;
  const m = h.match(/^bytes=(\d+)-(\d+)$/);
  if (!m) return null;
  const offset = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  return { offset, length: end - offset + 1 };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createHandlers
});
//# sourceMappingURL=index.cjs.map