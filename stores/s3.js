// src/stores/s3.ts
import { AwsClient } from "aws4fetch";

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/s3.ts
function buildUrl(opts, key, search) {
  const trail = search ? `?${search}` : "";
  const safeKey = key.split("/").map(encodeURIComponent).join("/");
  if (opts.endpoint) {
    const base = opts.endpoint.replace(/\/+$/, "");
    return `${base}/${opts.bucket}/${safeKey}${trail}`;
  }
  return `https://${opts.bucket}.s3.${opts.region}.amazonaws.com/${safeKey}${trail}`;
}
function extractAll(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  for (const m of xml.matchAll(re)) out.push(decodeXmlEntities(m[1]));
  return out;
}
function extractFirst(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXmlEntities(m[1]) : void 0;
}
function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function parseContents(xml) {
  const out = [];
  for (const block of extractAll(xml, "Contents")) {
    const key = extractFirst(block, "Key");
    if (!key) continue;
    const sizeStr = extractFirst(block, "Size") ?? "0";
    const lastModified = extractFirst(block, "LastModified") ?? "";
    out.push({ key, size: parseInt(sizeStr, 10), lastModified });
  }
  return out;
}
function parseCommonPrefixes(xml) {
  const out = [];
  for (const block of extractAll(xml, "CommonPrefixes")) {
    const prefix = extractFirst(block, "Prefix");
    if (prefix) out.push(prefix);
  }
  return out;
}
function S3Store(opts) {
  const region = opts.region ?? "us-east-1";
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const allowedPrefixes = opts.prefixes;
  const urlOpts = { bucket: opts.bucket, region, endpoint: opts.endpoint };
  const signer = opts.accessKeyId && opts.secretAccessKey ? new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    ...opts.sessionToken ? { sessionToken: opts.sessionToken } : {},
    service: "s3",
    region
  }) : void 0;
  async function request(url, init) {
    if (!signer) return f(url, init);
    return signer.fetch(url, init);
  }
  const checkPrefix = (path, label) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return;
    if (allowedPrefixes.some((p) => path === p || path.startsWith(p))) return;
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(", ")}`);
  };
  return {
    async list(prefix, listOpts = {}) {
      const p = prefix.endsWith("/") || prefix === "" ? prefix : `${prefix}/`;
      if (p === "" && allowedPrefixes && allowedPrefixes.length > 0 && !allowedPrefixes.some((ap) => ap === "")) {
        const entries2 = allowedPrefixes.map((ap) => ({ key: ap.endsWith("/") ? ap : `${ap}/`, isDir: true })).sort((a, b) => a.key.localeCompare(b.key));
        return { entries: entries2 };
      }
      checkPrefix(p, "list prefix");
      const params = new URLSearchParams({ "list-type": "2", delimiter: "/" });
      if (p) params.set("prefix", p);
      if (listOpts.cursor) params.set("continuation-token", listOpts.cursor);
      params.set("max-keys", String(listOpts.limit ?? 1e3));
      const url = buildUrl(urlOpts, "", params.toString());
      const res = await request(url);
      if (!res.ok) throw new Error(`S3 list ${p}: ${res.status} ${await res.text()}`);
      const xml = await res.text();
      const dirs = parseCommonPrefixes(xml).map((prefix2) => ({ key: prefix2, isDir: true }));
      const files = [];
      for (const o of parseContents(xml)) {
        if (o.key === p) continue;
        files.push({
          key: o.key,
          size: o.size,
          lastModified: o.lastModified,
          isDir: false
        });
      }
      const entries = [...dirs, ...files];
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.key.localeCompare(b.key);
      });
      const out = { entries };
      const isTruncated = (extractFirst(xml, "IsTruncated") ?? "false").trim() === "true";
      const nextToken = extractFirst(xml, "NextContinuationToken");
      if (isTruncated && nextToken) out.cursor = nextToken;
      return out;
    },
    async get(path, range) {
      checkPrefix(path, "get path");
      const url = buildUrl(urlOpts, path);
      const headers = {};
      if (range) headers["Range"] = `bytes=${range.offset}-${range.offset + range.length - 1}`;
      const res = await request(url, { headers });
      if (res.status === 404) throw new NotFoundError(path);
      if (!res.ok && res.status !== 206) {
        throw new Error(`S3 get ${path}: ${res.status} ${await res.text()}`);
      }
      const cr = res.headers.get("Content-Range");
      const totalSize = cr ? parseInt(cr.split("/")[1], 10) : res.status === 200 ? parseInt(res.headers.get("Content-Length") ?? "", 10) : NaN;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const out = { bytes };
      if (Number.isFinite(totalSize)) out.totalSize = totalSize;
      const ct = res.headers.get("Content-Type");
      if (ct) out.contentType = ct;
      return out;
    },
    capabilities: { range: true },
    // Direct browser GET only works for unsigned (public) buckets;
    // signed access requires SigV4 presigning, which aws4fetch doesn't
    // surface as a query-string URL. Consumers of signed `S3Store` who
    // want download links should proxy through `createHandlers()` and
    // expose an `HttpStore` to the browser.
    ...signer ? {} : { getUrl: (p) => buildUrl(urlOpts, p) }
  };
}
export {
  S3Store
};
//# sourceMappingURL=s3.js.map