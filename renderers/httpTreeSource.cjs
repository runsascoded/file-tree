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

// src/renderers/httpTreeSource.ts
var httpTreeSource_exports = {};
__export(httpTreeSource_exports, {
  httpTreeSource: () => httpTreeSource
});
module.exports = __toCommonJS(httpTreeSource_exports);

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

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
  httpTreeSource
});
//# sourceMappingURL=httpTreeSource.cjs.map