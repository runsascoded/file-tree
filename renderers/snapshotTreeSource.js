// src/renderers/snapshotTreeSource.ts
import { parquetMetadataAsync, parquetRead } from "hyparquet";

// src/react/asyncBuffer.ts
async function asyncBufferFromStore(store, path) {
  let byteLength;
  if (typeof store.getUrl === "function") {
    try {
      const r = await fetch(store.getUrl(path), { method: "HEAD" });
      if (r.ok) {
        const cl = parseInt(r.headers.get("Content-Length") ?? "", 10);
        if (Number.isFinite(cl) && cl > 0) byteLength = cl;
      }
    } catch {
    }
  }
  if (byteLength === void 0) {
    const head = await store.get(path, { offset: 0, length: 1 });
    byteLength = head.totalSize ?? head.bytes.byteLength;
  }
  return {
    byteLength,
    async slice(start, end) {
      const e = end ?? byteLength;
      const length = e - start;
      if (length <= 0) return new ArrayBuffer(0);
      const r = await store.get(path, { offset: start, length });
      return r.bytes.buffer.slice(
        r.bytes.byteOffset,
        r.bytes.byteOffset + r.bytes.byteLength
      );
    }
  };
}

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/renderers/parquetCompressors.ts
import { decompress as zstdDecompress } from "fzstd";
var defaultCompressors = {
  ZSTD: (input, outputLength) => zstdDecompress(input, new Uint8Array(outputLength))
};
function withDefaultCompressors(compressors) {
  return compressors ? { ...defaultCompressors, ...compressors } : defaultCompressors;
}

// src/renderers/treeSource.ts
var SnapshotNotFoundError = class extends Error {
  constructor(snapshot) {
    super(`no such snapshot: ${snapshot}`);
    this.snapshot = snapshot;
  }
  snapshot;
  name = "SnapshotNotFoundError";
};
function diffStatus(a, b) {
  if (!a) return "added";
  if (!b) return "removed";
  if (a.size !== b.size || (a.nDesc ?? null) !== (b.nDesc ?? null) || a.kind !== b.kind) return "changed";
  if ((a.mtime ?? null) !== (b.mtime ?? null)) return "touched";
  return "unchanged";
}
function diffNode(a, b) {
  const n = b ?? a;
  return {
    path: n.path,
    name: n.name,
    kind: n.kind,
    status: diffStatus(a, b),
    sizeA: a ? a.size : null,
    sizeB: b ? b.size : null,
    nDescA: a?.nDesc ?? null,
    nDescB: b?.nDesc ?? null
  };
}
function diffLevels(a, b) {
  if (!a && !b) throw new Error("diffLevels: node absent from both snapshots");
  const aKids = new Map((a?.children ?? []).map((c) => [c.path, c]));
  const bPaths = new Set((b?.children ?? []).map((c) => c.path));
  const children = [
    ...(b?.children ?? []).map((c) => diffNode(aKids.get(c.path) ?? null, c)),
    ...(a?.children ?? []).filter((c) => !bPaths.has(c.path)).map((c) => diffNode(c, null))
  ];
  return { node: diffNode(a?.node ?? null, b?.node ?? null), children };
}
function nodeName(path) {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

// src/renderers/snapshotTreeSource.ts
var SNAPSHOT_LAYOUT_VERSION = 1;
var NODE_COLUMNS = ["path", "size", "mtime", "kind", "n_desc", "n_children", "depth", "mtime_mean"];
var TEXT = new TextDecoder("utf-8", { fatal: true });
function statString(v) {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) {
    try {
      return TEXT.decode(v);
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function statNumber(v) {
  if (typeof v === "number" || typeof v === "bigint") return Number(v);
  return void 0;
}
function cmpBytes(a, b) {
  if (a === b) return 0;
  const ai = a[Symbol.iterator](), bi = b[Symbol.iterator]();
  for (; ; ) {
    const x = ai.next(), y = bi.next();
    if (x.done) return y.done ? 0 : -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0), cy = y.value.codePointAt(0);
    if (cx !== cy) return cx - cy;
  }
}
function inRange(p, r) {
  if (r.lo !== void 0 && cmpBytes(p, r.lo) < 0) return false;
  if (r.hi !== void 0) {
    const c = cmpBytes(p, r.hi);
    if (r.hiInclusive ? c > 0 : c >= 0) return false;
  }
  return true;
}
function groupMayMatch(g, r) {
  if (!g.depth) return true;
  const [dMin, dMax] = g.depth;
  if (r.depth < dMin || r.depth > dMax) return false;
  if (dMin !== dMax || !g.path) return true;
  const [pMin, pMax] = g.path;
  if (r.lo !== void 0 && cmpBytes(pMax, r.lo) < 0) return false;
  if (r.hi !== void 0) {
    const c = cmpBytes(pMin, r.hi);
    if (r.hiInclusive ? c > 0 : c >= 0) return false;
  }
  return true;
}
function rowSpans(groups, ranges) {
  const spans = [];
  for (const g of groups) {
    if (!ranges.some((r) => groupMayMatch(g, r))) continue;
    const last = spans[spans.length - 1];
    if (last && last[1] === g.rowStart) last[1] = g.rowEnd;
    else spans.push([g.rowStart, g.rowEnd]);
  }
  return spans;
}
function descendantRange(depth, prefix) {
  return prefix ? { depth, lo: `${prefix}/`, hi: `${prefix}0` } : { depth };
}
var pathDepth = (p) => p ? p.split("/").length : 0;
var parentOf = (p) => {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
};
var num = (v) => v == null ? null : Number(v);
function snapshotTreeSource(opts) {
  const { store } = opts;
  const base = opts.path ? `${opts.path.replace(/\/+$/, "")}/` : "";
  const compressors = withDefaultCompressors(opts.compressors);
  let manifestP = null;
  const trees = /* @__PURE__ */ new Map();
  const levels = /* @__PURE__ */ new Map();
  function manifest() {
    manifestP ??= (async () => {
      const r = await store.get(`${base}snapshots.json`);
      const m = JSON.parse(new TextDecoder().decode(r.bytes));
      if (m.version !== SNAPSHOT_LAYOUT_VERSION) {
        throw new Error(`snapshots.json: layout version ${m.version}, this reader understands ${SNAPSHOT_LAYOUT_VERSION}`);
      }
      const roots = [...new Set(m.snapshots.map((s) => s.path))];
      const root = opts.root ?? (roots.length === 1 ? roots[0] : void 0);
      if (root === void 0) {
        throw new Error(`snapshots.json holds ${roots.length} roots (${roots.join(", ")}); pass \`root\` to pick one`);
      }
      const entries = m.snapshots.filter((s) => s.path === root).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
      const rootLabel = opts.rootLabel ?? (nodeName(root.replace(/^[a-z0-9]+:\/\//i, "")) || "root");
      return { entries, rootLabel };
    })();
    manifestP.catch(() => {
      manifestP = null;
    });
    return manifestP;
  }
  async function entryFor(requested) {
    const { entries } = await manifest();
    const snapshot = requested ?? opts.snapshot;
    if (snapshot === void 0) {
      const newest = entries[0];
      if (!newest) throw new SnapshotNotFoundError("(newest)");
      return newest;
    }
    const e = entries.find((s) => String(s.id) === snapshot);
    if (!e) throw new SnapshotNotFoundError(snapshot);
    return e;
  }
  function treeFile(e) {
    const id = String(e.id);
    let p = trees.get(id);
    if (!p) {
      p = (async () => {
        const file = await asyncBufferFromStore(store, `${base}${e.tree}`);
        const metadata = await parquetMetadataAsync(file);
        const names = metadata.schema.slice(1).map((el) => el.name);
        const columns = NODE_COLUMNS.filter((c) => names.includes(c));
        const groups = [];
        let cum = 0;
        for (const rg of metadata.row_groups) {
          const n = Number(rg.num_rows);
          const stat = (col) => rg.columns.find((c) => c.meta_data?.path_in_schema.join(".") === col)?.meta_data?.statistics;
          const ds = stat("depth"), ps = stat("path");
          const dMin = statNumber(ds?.min_value ?? ds?.min), dMax = statNumber(ds?.max_value ?? ds?.max);
          const pMin = statString(ps?.min_value ?? ps?.min), pMax = statString(ps?.max_value ?? ps?.max);
          groups.push({
            rowStart: cum,
            rowEnd: cum + n,
            depth: dMin !== void 0 && dMax !== void 0 ? [dMin, dMax] : null,
            path: pMin !== void 0 && pMax !== void 0 ? [pMin, pMax] : null
          });
          cum += n;
        }
        return { file, metadata, columns, groups };
      })();
      p.catch(() => trees.delete(id));
      trees.set(id, p);
    }
    return p;
  }
  async function readRanges(t, ranges) {
    const out = [];
    for (const [rowStart, rowEnd] of rowSpans(t.groups, ranges)) {
      await parquetRead({
        file: t.file,
        metadata: t.metadata,
        columns: t.columns,
        rowStart,
        rowEnd,
        compressors,
        rowFormat: "object",
        onComplete: (rows) => {
          for (const r of rows) {
            const d = Number(r.depth);
            const p = String(r.path);
            if (ranges.some((rg) => rg.depth === d && inRange(p, rg))) out.push(r);
          }
        }
      });
    }
    return out;
  }
  function toNode(r, rootLabel) {
    const raw = String(r.path);
    const path = raw === "." ? "" : raw;
    return {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: r.kind === "dir" ? "dir" : "file",
      size: num(r.size),
      nChildren: Number(r.n_children ?? 0),
      ...r.n_desc != null ? { nDesc: Number(r.n_desc) } : {},
      mtime: num(r.mtime),
      ..."mtime_mean" in r ? { mtimeMean: num(r.mtime_mean) } : {}
    };
  }
  async function load(e, path, depth) {
    const { rootLabel } = await manifest();
    const t = await treeFile(e);
    const d = pathDepth(path);
    const ranges = [
      path ? { depth: d, lo: path, hi: path, hiInclusive: true } : { depth: 0, lo: ".", hi: ".", hiInclusive: true }
    ];
    for (let k = 1; k <= depth; k++) ranges.push(descendantRange(d + k, path));
    const rows = await readRanges(t, ranges);
    const nodes = rows.map((r) => toNode(r, rootLabel));
    const kids = /* @__PURE__ */ new Map();
    for (const n of nodes) {
      if (n.path === path) continue;
      const p = parentOf(n.path);
      const list = kids.get(p);
      if (list) list.push(n);
      else kids.set(p, [n]);
    }
    const snapshot = String(e.id);
    const out = /* @__PURE__ */ new Map();
    for (const n of nodes) {
      if (n.kind !== "dir" || pathDepth(n.path) >= d + depth) continue;
      out.set(n.path, { node: n, children: kids.get(n.path) ?? [], snapshot });
    }
    const self = nodes.find((n) => n.path === path);
    if (!self) throw new NotFoundError(path || "(root)");
    if (!out.has(path)) out.set(path, { node: self, children: [], snapshot });
    return out;
  }
  async function children(req = {}) {
    const path = (req.path ?? "").replace(/^\/+|\/+$/g, "");
    const e = await entryFor(req.snapshot);
    const key = (p) => `${e.id}\0${p}`;
    const hit = levels.get(key(path));
    if (hit) return hit;
    const loaded = load(e, path, Math.max(1, req.depth ?? 1));
    const mine = loaded.then((m) => m.get(path));
    mine.catch(() => {
    });
    levels.set(key(path), mine);
    try {
      const m = await loaded;
      for (const [p, level] of m) if (p !== path && !levels.has(key(p))) levels.set(key(p), Promise.resolve(level));
      return await mine;
    } catch (err) {
      levels.delete(key(path));
      throw err;
    }
  }
  async function snapshots() {
    const { entries } = await manifest();
    return entries.map((s) => ({ id: String(s.id), time: s.time, size: s.size }));
  }
  async function levelOrNull(path, snapshot) {
    try {
      return await children({ ...path !== void 0 ? { path } : {}, snapshot });
    } catch (err) {
      if (err instanceof Error && err.name === "NotFoundError") return null;
      throw err;
    }
  }
  async function diff(req) {
    const [a, b] = await Promise.all([levelOrNull(req.path, req.a), levelOrNull(req.path, req.b)]);
    if (!a && !b) throw new NotFoundError(req.path || "(root)");
    return diffLevels(a, b);
  }
  return {
    capabilities: { history: true, diff: true, scan: false, lazy: true },
    children,
    snapshots,
    diff
  };
}
export {
  SNAPSHOT_LAYOUT_VERSION,
  rowSpans,
  snapshotTreeSource
};
//# sourceMappingURL=snapshotTreeSource.js.map