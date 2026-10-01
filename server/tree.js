// src/server/tree.ts
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
export {
  createTreeHandlers
};
//# sourceMappingURL=tree.js.map