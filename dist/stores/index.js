// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/r2.ts
function R2Store(bucket, opts = {}) {
  const allowedPrefixes = opts.prefixes;
  const checkPrefix = (path, label) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return;
    if (allowedPrefixes.some((p) => path === p || path.startsWith(p))) return;
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(", ")}`);
  };
  return {
    async list(prefix, opts2 = {}) {
      const p = prefix.endsWith("/") || prefix === "" ? prefix : `${prefix}/`;
      if (p === "" && allowedPrefixes && allowedPrefixes.length > 0 && !allowedPrefixes.some((ap) => ap === "")) {
        const entries2 = allowedPrefixes.map((ap) => ({ key: ap.endsWith("/") ? ap : `${ap}/`, isDir: true })).sort((a, b) => a.key.localeCompare(b.key));
        return { entries: entries2 };
      }
      checkPrefix(p, "list prefix");
      const result = await bucket.list({
        prefix: p,
        delimiter: "/",
        cursor: opts2.cursor,
        limit: opts2.limit ?? 1e3
      });
      const entries = [];
      for (const dir of result.delimitedPrefixes ?? []) {
        entries.push({ key: dir, isDir: true });
      }
      for (const obj of result.objects ?? []) {
        if (obj.key === p) continue;
        entries.push({
          key: obj.key,
          size: obj.size,
          lastModified: obj.uploaded.toISOString(),
          isDir: false
        });
      }
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.key.localeCompare(b.key);
      });
      const out = { entries };
      if (result.truncated && result.cursor) out.cursor = result.cursor;
      return out;
    },
    async get(path, range) {
      checkPrefix(path, "get path");
      const obj = await bucket.get(path, range ? { range: { offset: range.offset, length: range.length } } : void 0);
      if (!obj) throw new NotFoundError(path);
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const out = { bytes, totalSize: obj.size };
      if (obj.httpMetadata?.contentType) out.contentType = obj.httpMetadata.contentType;
      return out;
    },
    capabilities: { range: true }
  };
}

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

// src/stores/mock.ts
var TEXT = new TextEncoder();
var DEFAULT_PAGE_SIZE = 100;
var DEFAULT_LM = "2026-01-01T00:00:00.000Z";
function toFile(v, defaultLM) {
  if (typeof v === "string") return { bytes: TEXT.encode(v), lastModified: defaultLM };
  if (v instanceof Uint8Array) return { bytes: v, lastModified: defaultLM };
  return { ...v, lastModified: v.lastModified ?? defaultLM };
}
function MockStore(input, opts = {}) {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const defaultLM = opts.defaultLastModified ?? DEFAULT_LM;
  const files = new Map(
    Object.entries(input).map(([k, v]) => [k, toFile(v, defaultLM)])
  );
  return {
    async list(prefix, listOpts = {}) {
      const p = prefix === "" || prefix.endsWith("/") ? prefix : `${prefix}/`;
      const dirs = /* @__PURE__ */ new Set();
      const fileEntries = [];
      for (const [key, file] of files) {
        if (!key.startsWith(p)) continue;
        const rest = key.slice(p.length);
        if (rest.length === 0) continue;
        const slashIdx = rest.indexOf("/");
        if (slashIdx >= 0) {
          dirs.add(p + rest.slice(0, slashIdx) + "/");
        } else {
          const e = { key, size: file.bytes.byteLength, isDir: false };
          if (file.lastModified) e.lastModified = file.lastModified;
          fileEntries.push(e);
        }
      }
      const all = [
        ...Array.from(dirs).sort().map((key) => ({ key, isDir: true })),
        ...fileEntries.sort((a, b) => a.key.localeCompare(b.key))
      ];
      const offset = listOpts.cursor ? parseInt(atob(listOpts.cursor), 10) : 0;
      const limit = listOpts.limit ?? pageSize;
      const page = all.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      const result = { entries: page };
      if (nextOffset < all.length) result.cursor = btoa(String(nextOffset));
      return result;
    },
    async get(path, range) {
      const file = files.get(path);
      if (!file) throw new NotFoundError(path);
      const total = file.bytes.byteLength;
      const out = { bytes: file.bytes, totalSize: total };
      if (file.contentType) out.contentType = file.contentType;
      if (range) {
        const start = Math.max(0, range.offset);
        const end = Math.min(total, range.offset + range.length);
        out.bytes = file.bytes.slice(start, end);
      }
      return out;
    },
    capabilities: { range: true }
  };
}

// src/stores/multi.ts
function MultiStore(children) {
  const names = Object.keys(children);
  for (const n of names) {
    if (n === "" || n.includes("/")) {
      throw new Error(`MultiStore: invalid child name ${JSON.stringify(n)} (must be non-empty, no '/')`);
    }
  }
  const sortedNames = [...names].sort();
  function split(path) {
    const slashIdx = path.indexOf("/");
    const name = slashIdx < 0 ? path : path.slice(0, slashIdx);
    const child = children[name];
    if (!child) return null;
    const rest = slashIdx < 0 ? "" : path.slice(slashIdx + 1);
    return { name, child, rest };
  }
  return {
    async list(prefix, opts = {}) {
      if (prefix === "" || prefix === "/") {
        return {
          entries: sortedNames.map((name2) => ({ key: `${name2}/`, isDir: true }))
        };
      }
      const split1 = split(prefix.replace(/\/+$/, ""));
      if (!split1) {
        return { entries: [] };
      }
      const { name, child, rest } = split1;
      const childPrefix = rest === "" ? "" : rest.endsWith("/") ? rest : `${rest}/`;
      const r = await child.list(childPrefix, opts);
      const entries = r.entries.map((e) => ({ ...e, key: `${name}/${e.key}` }));
      const out = { entries };
      if (r.cursor) out.cursor = r.cursor;
      return out;
    },
    async get(path, range) {
      const s = split(path);
      if (!s) throw new NotFoundError(path);
      return s.child.get(s.rest, range);
    },
    capabilities: {
      range: names.length > 0 && names.every((n) => children[n].capabilities?.range === true)
    }
  };
}
export {
  HttpStore,
  MockStore,
  MultiStore,
  R2Store
};
//# sourceMappingURL=index.js.map