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

// src/renderers/walkTreeSource.ts
var walkTreeSource_exports = {};
__export(walkTreeSource_exports, {
  walkTreeSource: () => walkTreeSource
});
module.exports = __toCommonJS(walkTreeSource_exports);

// src/renderers/treeSource.ts
var TreeTooLargeError = class extends Error {
  constructor(message, nodesWalked) {
    super(message);
    this.nodesWalked = nodesWalked;
  }
  nodesWalked;
  name = "TreeTooLargeError";
};
function nodeName(path) {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

// src/renderers/walkTreeSource.ts
var DEFAULT_MAX_NODES = 5e4;
function toEpoch(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1e3) : null;
}
function maxMtime(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
async function listAll(store, prefix) {
  const out = [];
  let cursor;
  for (let i = 0; i < 1e3; i++) {
    const r = await store.list(prefix, cursor ? { cursor } : void 0);
    out.push(...r.entries);
    if (!r.cursor) return out;
    cursor = r.cursor;
  }
  throw new Error(`walkTreeSource: cursor did not terminate under ${prefix}`);
}
function walkTreeSource(store, opts = {}) {
  const root = opts.root ?? "";
  const rootLabel = opts.rootLabel ?? "root";
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const levels = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  const keyFor = (path) => path ? `${root}${path}/` : root;
  async function build(path, walked) {
    const entries = await listAll(store, keyFor(path));
    const children2 = [];
    let size = 0;
    let nDesc = 0;
    let mtime = null;
    for (const e of entries) {
      walked.n++;
      if (walked.n > maxNodes) {
        throw new TreeTooLargeError(
          `tree under ${keyFor(path) || "(root)"} exceeds ${maxNodes} entries`,
          walked.n
        );
      }
      const name = nodeName(e.key);
      const childPath = path ? `${path}/${name}` : name;
      if (e.isDir) {
        const sub = await build(childPath, walked);
        children2.push(sub);
        size += sub.node.size ?? 0;
        nDesc += 1 + (sub.node.nDesc ?? 0);
        mtime = maxMtime(mtime, sub.node.mtime ?? null);
      } else {
        const fileMtime = toEpoch(e.lastModified);
        children2.push({
          node: {
            path: childPath,
            name,
            kind: "file",
            size: e.size ?? 0,
            mtime: fileMtime
          },
          children: []
        });
        size += e.size ?? 0;
        nDesc += 1;
        mtime = maxMtime(mtime, fileMtime);
      }
    }
    const node = {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: "dir",
      size,
      nChildren: children2.length,
      nDesc,
      mtime
    };
    return { node, children: children2 };
  }
  function cache(built) {
    levels.set(built.node.path, {
      node: built.node,
      children: built.children.map((c) => c.node)
    });
    for (const c of built.children) if (c.node.kind === "dir") cache(c);
  }
  async function children(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const cached = levels.get(path);
    if (cached) return cached;
    let pending = inflight.get(path);
    if (!pending) {
      pending = (async () => {
        try {
          const built = await build(path, { n: 0 });
          cache(built);
          return levels.get(path);
        } finally {
          inflight.delete(path);
        }
      })();
      inflight.set(path, pending);
    }
    return pending;
  }
  return {
    capabilities: { history: false, diff: false, scan: false, lazy: true },
    children
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  walkTreeSource
});
//# sourceMappingURL=walkTreeSource.cjs.map