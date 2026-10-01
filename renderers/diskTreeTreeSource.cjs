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

// src/renderers/diskTreeTreeSource.ts
var diskTreeTreeSource_exports = {};
__export(diskTreeTreeSource_exports, {
  diskTreeTreeSource: () => diskTreeTreeSource
});
module.exports = __toCommonJS(diskTreeTreeSource_exports);

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/renderers/treeSource.ts
var SnapshotNotFoundError = class extends Error {
  constructor(snapshot) {
    super(`no such snapshot: ${snapshot}`);
    this.snapshot = snapshot;
  }
  snapshot;
  name = "SnapshotNotFoundError";
};
function nodeName(path) {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

// src/renderers/diskTreeTreeSource.ts
function isoTime(t) {
  return t.replace(/^(\d{4}-\d\d-\d\d) /, "$1T");
}
var num = (v) => v == null ? null : v;
function diskTreeTreeSource(opts) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const root = opts.uri === "/" ? "/" : opts.uri.replace(/\/+$/, "");
  const rootLabel = opts.rootLabel ?? (nodeName(root.replace(/^[a-z0-9]+:\/\//i, "")) || "root");
  const uriFor = (path) => !path ? root : root === "/" ? `/${path}` : `${root}/${path}`;
  const join = (path, rel) => path ? `${path}/${rel}` : rel;
  async function call(url, what, init) {
    const res = await doFetch(url, init);
    let body = null;
    try {
      body = await res.json();
    } catch {
    }
    if (!res.ok) {
      const detail = body?.error ?? `${res.status} ${res.statusText}`;
      if (res.status === 404) {
        const e = new NotFoundError(what);
        e.message = `${what}: ${detail}`;
        throw e;
      }
      throw new Error(`disk-tree ${res.status}: ${detail}`);
    }
    return body;
  }
  function toNode(r, path) {
    return {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: r.kind === "dir" ? "dir" : "file",
      size: num(r.size),
      ...r.n_children != null ? { nChildren: r.n_children } : {},
      ...r.n_desc != null ? { nDesc: r.n_desc } : {},
      mtime: num(r.mtime),
      ...r.mtime_mean !== void 0 ? { mtimeMean: num(r.mtime_mean) } : {}
    };
  }
  async function children(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams({ uri: uriFor(path), depth: "1", expand_single: "false" });
    if (req.snapshot) params.set("scan_id", req.snapshot);
    const r = await call(`${base}/api/scan?${params}`, uriFor(path));
    return {
      node: toNode(r.root, path),
      children: r.children.map((c) => toNode(c, join(path, c.path))),
      ...req.snapshot ? { snapshot: req.snapshot } : {}
    };
  }
  async function snapshots() {
    const params = new URLSearchParams({ uri: root });
    const rows = await call(`${base}/api/scans/history?${params}`, root);
    return rows.map((s) => ({ id: String(s.id), time: isoTime(s.time), size: s.size }));
  }
  async function diff(req) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams({ uri: uriFor(path), scan1: req.a, scan2: req.b, depth: "1" });
    let r;
    try {
      r = await call(`${base}/api/compare?${params}`, uriFor(path));
    } catch (e) {
      if (e instanceof Error && e.name === "NotFoundError") throw new SnapshotNotFoundError(`${req.a}|${req.b}`);
      throw e;
    }
    const { scan1: a, scan2: b } = r;
    const nodeStatus = a.size == null && b.size != null ? "added" : a.size != null && b.size == null ? "removed" : a.size !== b.size || a.n_desc !== b.n_desc ? "changed" : "unchanged";
    const node = {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: "dir",
      status: nodeStatus,
      sizeA: a.size,
      sizeB: b.size,
      nDescA: a.n_desc,
      nDescB: b.n_desc
    };
    const kids = r.rows.map((row) => {
      const p = join(path, row.path);
      const [sizeA, sizeB, nDescA, nDescB] = row.status === "added" ? [null, num(row.size), null, num(row.n_desc)] : row.status === "removed" ? [num(row.size), null, num(row.n_desc), null] : [num(row.size_old), num(row.size), num(row.n_desc_old), num(row.n_desc)];
      return {
        path: p,
        name: nodeName(p),
        kind: row.kind === "dir" ? "dir" : "file",
        status: row.status,
        sizeA,
        sizeB,
        nDescA,
        nDescB
      };
    });
    return { node, children: kids };
  }
  const toJob = (j) => ({
    id: j.job_id,
    status: j.status,
    error: j.error ? j.error : null
  });
  async function scan(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const res = await doFetch(`${base}/api/scan/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: uriFor(path) })
    });
    const body = await res.json();
    if (res.status === 409 && body.job_id) return { id: body.job_id, status: "running", error: null };
    if (!res.ok) throw new Error(`disk-tree ${res.status}: ${body.error ?? res.statusText}`);
    return toJob(body);
  }
  async function scanStatus(id) {
    return toJob(await call(`${base}/api/scan/status/${encodeURIComponent(id)}`, `scan job ${id}`));
  }
  const canScan = opts.scan ?? true;
  return {
    capabilities: { history: true, diff: true, scan: canScan, lazy: true },
    children,
    snapshots,
    diff,
    ...canScan ? { scan, scanStatus } : {}
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  diskTreeTreeSource
});
//# sourceMappingURL=diskTreeTreeSource.cjs.map