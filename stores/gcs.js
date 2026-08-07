// src/stores/gcs.ts
import { AwsClient, AwsV4Signer } from "aws4fetch";

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/_xmlObjectStore.ts
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
function xmlObjectStore(opts) {
  const urlOpts = { bucket: opts.bucket, region: opts.region, endpoint: opts.endpoint };
  const allowedPrefixes = opts.allowedPrefixes;
  const checkPrefix = (path, label) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return;
    if (allowedPrefixes.some((p) => path === p || path.startsWith(p))) return;
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(", ")}`);
  };
  return {
    buildUrl: (key, search) => buildUrl(urlOpts, key, search),
    checkPrefix,
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
      const res = await opts.request(url);
      if (!res.ok) throw new Error(`list ${p}: ${res.status} ${await res.text()}`);
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
      const res = await opts.request(url, { headers });
      if (res.status === 404) throw new NotFoundError(path);
      if (!res.ok && res.status !== 206) {
        throw new Error(`get ${path}: ${res.status} ${await res.text()}`);
      }
      const cr = res.headers.get("Content-Range");
      const totalSize = cr ? parseInt(cr.split("/")[1], 10) : res.status === 200 ? parseInt(res.headers.get("Content-Length") ?? "", 10) : NaN;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const out = { bytes };
      if (Number.isFinite(totalSize)) out.totalSize = totalSize;
      const ct = res.headers.get("Content-Type");
      if (ct) out.contentType = ct;
      return out;
    }
  };
}

// src/stores/gcs.ts
var DEFAULT_ENDPOINT = "https://storage.googleapis.com";
var DEFAULT_REGION = "auto";
function GcsStore(opts) {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const region = opts.region ?? DEFAULT_REGION;
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const bearer = opts.getToken;
  const hmacSigner = !bearer && opts.accessKeyId && opts.secretAccessKey ? new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: "s3",
    // GCS's S3-compat API accepts SigV4 with `service: s3`
    region
  }) : void 0;
  const request = bearer ? async (url, init) => {
    const token = await bearer();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return f(url, { ...init, headers });
  } : hmacSigner ? (url, init) => hmacSigner.fetch(url, init) : (url, init) => f(url, init);
  const core = xmlObjectStore({
    bucket: opts.bucket,
    region,
    endpoint,
    request,
    ...opts.prefixes ? { allowedPrefixes: opts.prefixes } : {}
  });
  return {
    list: core.list,
    get: core.get,
    capabilities: { range: true },
    // Unsigned/public: browser can hit the URL directly. Bearer & HMAC
    // both need per-request auth (bearer can't go in a URL safely;
    // HMAC uses presign via `getDownloadUrl`).
    ...bearer || hmacSigner ? {} : { getUrl: (p) => core.buildUrl(p) },
    // SigV4 presigned download URL — HMAC mode only. GCS honors
    // V4 query signing when the credential scope matches the HMAC key.
    // Bearer mode intentionally omits this: bearer tokens can't be
    // embedded in a signed URL, so the proxy `get` path serves
    // downloads instead.
    ...hmacSigner ? {
      async getDownloadUrl(path, dlOpts) {
        core.checkPrefix(path, "getDownloadUrl path");
        const basename = path.split("/").pop() || path;
        const search = new URLSearchParams({
          "X-Amz-Expires": String(dlOpts?.expiresIn ?? opts.presignExpiresIn ?? 3600),
          "response-content-disposition": `attachment; filename="${basename.replace(/"/g, '\\"')}"`
        });
        const signer = new AwsV4Signer({
          method: "GET",
          url: core.buildUrl(path, search.toString()),
          accessKeyId: opts.accessKeyId,
          secretAccessKey: opts.secretAccessKey,
          service: "s3",
          region,
          signQuery: true
        });
        const signed = await signer.sign();
        return signed.url.toString();
      }
    } : {}
  };
}
export {
  GcsStore
};
//# sourceMappingURL=gcs.js.map