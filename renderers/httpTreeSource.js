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
export {
  httpTreeSource
};
//# sourceMappingURL=httpTreeSource.js.map