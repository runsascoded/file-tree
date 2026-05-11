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
export {
  R2Store
};
//# sourceMappingURL=r2.js.map