// src/renderers/treeSource.ts
var TreeTooLargeError = class extends Error {
  constructor(message, nodesWalked) {
    super(message);
    this.nodesWalked = nodesWalked;
  }
  nodesWalked;
  name = "TreeTooLargeError";
};

// src/react/fmt.ts
function fmtSize(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// src/omnibar.ts
var DEFAULT_INDEX_MAX_NODES = 5e4;
async function treePathIndex(source, opts = {}) {
  const { path = "", maxNodes = DEFAULT_INDEX_MAX_NODES } = opts;
  const out = [];
  let frontier = [path];
  while (frontier.length) {
    const levels = await Promise.all(frontier.map((p) => source.children({ path: p })));
    frontier = [];
    for (const { children } of levels) {
      for (const c of children) {
        out.push(c);
        if (c.kind === "dir") frontier.push(c.path);
      }
      if (out.length > maxNodes) {
        throw new TreeTooLargeError(`tree under ${path || "(root)"} exceeds ${maxNodes} entries`, out.length);
      }
    }
  }
  return out;
}
var BOUNDARY = /[\s\-_./]/;
var MIN_SUBSEQ = 3;
function scoreToken(token, text) {
  const lo = text.toLowerCase();
  let best = null;
  for (let i = lo.indexOf(token); i >= 0; i = lo.indexOf(token, i + 1)) {
    const s = 10 * token.length + (i === 0 || BOUNDARY.test(text[i - 1]) ? 8 : 0) - i * 0.01;
    if (best === null || s > best) best = s;
  }
  if (best !== null) return best;
  if (token.length < MIN_SUBSEQ) return null;
  let score = 0, run = 0, last = -2, ti = 0;
  for (let i = 0; i < lo.length && ti < token.length; i++) {
    if (lo[i] !== token[ti]) continue;
    run = last === i - 1 ? run + 1 : 0;
    score += 1 + run + (i === 0 || BOUNDARY.test(text[i - 1]) ? 2 : 0) - i * 0.01;
    last = i;
    ti++;
  }
  return ti === token.length ? score : null;
}
var NAME_BONUS = 5;
function scorePath(query, path) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const name = path.slice(path.lastIndexOf("/") + 1);
  let total = 0;
  for (const t of tokens) {
    const inName = scoreToken(t, name);
    const inPath = scoreToken(t, path);
    if (inName === null && inPath === null) return null;
    total += Math.max(inName === null ? -Infinity : inName + NAME_BONUS, inPath ?? -Infinity);
  }
  return total - path.length * 1e-3;
}
var indexes = /* @__PURE__ */ new WeakMap();
function cachedIndex(source, opts) {
  let bySource = indexes.get(source);
  if (!bySource) indexes.set(source, bySource = /* @__PURE__ */ new Map());
  const key = `${opts.path ?? ""}\0${opts.maxNodes ?? DEFAULT_INDEX_MAX_NODES}`;
  let p = bySource.get(key);
  if (!p) {
    p = treePathIndex(source, opts);
    p.catch(() => bySource.delete(key));
    bySource.set(key, p);
  }
  return p;
}
var KEEP_ORDER = { sort: "none" };
function treePathEndpoint(source, opts) {
  const { routeBase, group = "Files", priority = 50, excludePath, kinds, minQueryLength = 1, pageSize } = opts;
  const base = routeBase.replace(/\/+$/, "");
  const kindSet = kinds ? new Set(kinds) : void 0;
  return {
    ...group !== null ? { group } : {},
    priority,
    minQueryLength,
    ...opts.enabled !== void 0 ? { enabled: opts.enabled } : {},
    ...pageSize !== void 0 ? { pageSize } : {},
    ...KEEP_ORDER,
    fetch: async (query, _signal, { offset, limit }) => {
      let index;
      try {
        index = await cachedIndex(source, opts);
      } catch (e) {
        if (!(e instanceof Error && e.name === "TreeTooLargeError")) throw e;
        return { entries: [{ id: `${group ?? "files"}:too-large`, label: "Tree too large to index", description: e.message, handler: () => {
        } }], total: 1 };
      }
      const hits = [];
      for (const node of index) {
        if (kindSet && !kindSet.has(node.kind)) continue;
        if (excludePath !== void 0 && (node.path === excludePath || node.path.startsWith(`${excludePath}/`))) continue;
        const score = scorePath(query, node.path);
        if (score !== null) hits.push({ node, score });
      }
      hits.sort((a, b) => b.score - a.score);
      const entries = hits.slice(offset, offset + limit).map(({ node }) => {
        const dir = node.kind === "dir";
        const shown = dir ? `${node.path}/` : node.path;
        return {
          id: node.path,
          label: dir ? `${node.name}/` : node.name,
          description: node.size != null ? `${shown} \xB7 ${fmtSize(node.size)}` : shown,
          href: `${base}/${shown}`
        };
      });
      return { entries, total: hits.length, hasMore: offset + limit < hits.length };
    }
  };
}
export {
  DEFAULT_INDEX_MAX_NODES,
  scorePath,
  treePathEndpoint,
  treePathIndex
};
//# sourceMappingURL=omnibar.js.map