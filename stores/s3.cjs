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

// src/stores/s3.ts
var s3_exports = {};
__export(s3_exports, {
  S3Store: () => S3Store
});
module.exports = __toCommonJS(s3_exports);
var import_aws4fetch = require("aws4fetch");

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

// src/stores/s3.ts
function S3Store(opts) {
  const region = opts.region ?? "us-east-1";
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const signer = opts.accessKeyId && opts.secretAccessKey ? new import_aws4fetch.AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    ...opts.sessionToken ? { sessionToken: opts.sessionToken } : {},
    service: "s3",
    region
  }) : void 0;
  const request = signer ? (url, init) => signer.fetch(url, init) : (url, init) => f(url, init);
  const core = xmlObjectStore({
    bucket: opts.bucket,
    region,
    ...opts.endpoint ? { endpoint: opts.endpoint } : {},
    request,
    ...opts.prefixes ? { allowedPrefixes: opts.prefixes } : {}
  });
  return {
    list: core.list,
    get: core.get,
    capabilities: { range: true },
    // Names the bucket in the breadcrumb root, which otherwise reads
    // "root" and hides the one thing the page can't otherwise tell you.
    describe: () => `s3://${opts.bucket}` + (opts.prefixes?.length === 1 ? `/${opts.prefixes[0]}` : "/"),
    // Static URL works for unsigned (public) buckets only — signed
    // buckets need SigV4 presigning, surfaced via `getDownloadUrl` below.
    ...signer ? {} : { getUrl: (p) => core.buildUrl(p) },
    // SigV4 presigned download URL, for signed buckets. Browser-side use
    // case: a user pastes their own access keys at `/s3` or `/r2` to
    // browse a private bucket — `<FileTree>` calls this when the user
    // clicks the download icon, getting a short-lived URL the browser
    // GETs directly. Mirrors `R2Store`'s presign path.
    ...opts.accessKeyId && opts.secretAccessKey ? {
      async getDownloadUrl(path, dlOpts) {
        core.checkPrefix(path, "getDownloadUrl path");
        const basename = path.split("/").pop() || path;
        const search = new URLSearchParams({
          "X-Amz-Expires": String(dlOpts?.expiresIn ?? opts.presignExpiresIn ?? 3600),
          "response-content-disposition": `attachment; filename="${basename.replace(/"/g, '\\"')}"`
        });
        const signer2 = new import_aws4fetch.AwsV4Signer({
          method: "GET",
          url: core.buildUrl(path, search.toString()),
          accessKeyId: opts.accessKeyId,
          secretAccessKey: opts.secretAccessKey,
          ...opts.sessionToken ? { sessionToken: opts.sessionToken } : {},
          service: "s3",
          region,
          signQuery: true
        });
        const signed = await signer2.sign();
        return signed.url.toString();
      }
    } : {}
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  S3Store
});
//# sourceMappingURL=s3.cjs.map