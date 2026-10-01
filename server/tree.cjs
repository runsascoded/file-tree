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

// src/server/tree.ts
var tree_exports = {};
__export(tree_exports, {
  createTreeHandlers: () => createTreeHandlers
});
module.exports = __toCommonJS(tree_exports);
var DEFAULT_MAX_DEPTH = 4;
function createTreeHandlers(source, opts = {}) {
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const cors = opts.corsOrigin === void 0 ? "*" : opts.corsOrigin;
  const corsHeaders = cors ? { "Access-Control-Allow-Origin": cors } : {};
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const scan = opts.scanner?.scan ?? source.scan?.bind(source);
  const scanStatus = opts.scanner?.status ?? source.scanStatus?.bind(source);
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
  const unsupported = (what) => json({ error: `${what} not supported by this tree source` }, 404);
  return {
    async handle(request) {
      const url = new URL(request.url);
      const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
      if (route !== "/children" && route !== "/snapshots" && route !== "/diff" && route !== "/scan" && route !== "/scan/status") {
        return null;
      }
      const q = url.searchParams;
      const opt = (k) => q.get(k) || void 0;
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      }
      try {
        switch (route) {
          case "/children": {
            const path = opt("path"), snapshot = opt("snapshot");
            const depth = clampInt(q.get("depth"), 1, 1, maxDepth);
            return json(await source.children({
              ...path ? { path } : {},
              depth,
              ...snapshot ? { snapshot } : {}
            }));
          }
          case "/snapshots":
            if (!source.snapshots) return unsupported("snapshots");
            return json({ snapshots: await source.snapshots() });
          case "/diff": {
            if (!source.diff) return unsupported("diff");
            const a = opt("a"), b = opt("b"), path = opt("path");
            if (!a || !b) return json({ error: "a and b required" }, 400);
            return json(await source.diff({
              a,
              b,
              ...path ? { path } : {},
              depth: clampInt(q.get("depth"), 1, 1, maxDepth)
            }));
          }
          case "/scan": {
            if (request.method !== "POST") return json({ error: "POST required" }, 405);
            if (!scan) return unsupported("scan");
            const path = opt("path");
            return json(await scan(path ? { path } : {}));
          }
          case "/scan/status": {
            if (!scanStatus) return unsupported("scan");
            const id = opt("id");
            if (!id) return json({ error: "id required" }, 400);
            return json(await scanStatus(id));
          }
        }
      } catch (e) {
        return errorJson(e, json);
      }
    }
  };
}
function clampInt(raw, fallback, min, max) {
  const n = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function errorJson(e, json) {
  if (!(e instanceof Error)) return json({ error: String(e) }, 500);
  switch (e.name) {
    case "NotFoundError":
      return json({ error: e.message, name: e.name }, 404);
    case "SnapshotNotFoundError":
      return json({ error: e.message, name: e.name, snapshot: e.snapshot }, 404);
    case "TreeTooLargeError":
      return json({ error: e.message, name: e.name, nodesWalked: e.nodesWalked }, 413);
    default:
      return json({ error: e.message }, 500);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createTreeHandlers
});
//# sourceMappingURL=tree.cjs.map