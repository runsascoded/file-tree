// src/stores/r2.ts
import { AwsV4Signer } from "aws4fetch";

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
    capabilities: { range: true },
    ...opts.publicBaseUrl ? {
      getUrl(path) {
        const base = opts.publicBaseUrl.replace(/\/+$/, "");
        const safeKey = path.split("/").map(encodeURIComponent).join("/");
        return `${base}/${safeKey}`;
      }
    } : {},
    ...opts.presign ? {
      async getDownloadUrl(path, dlOpts) {
        checkPrefix(path, "getDownloadUrl path");
        return presignR2Url(opts.presign, path, dlOpts?.expiresIn);
      }
    } : {}
  };
}
async function presignR2Url(presign, path, expiresIn) {
  const endpoint = presign.endpoint.replace(/\/+$/, "");
  const safeKey = path.split("/").map(encodeURIComponent).join("/");
  const basename = path.split("/").pop() || path;
  const search = new URLSearchParams({
    "X-Amz-Expires": String(expiresIn ?? presign.expiresIn ?? 3600),
    "response-content-disposition": `attachment; filename="${basename.replace(/"/g, '\\"')}"`
  });
  const url = `${endpoint}/${presign.bucket}/${safeKey}?${search}`;
  const signer = new AwsV4Signer({
    method: "GET",
    url,
    accessKeyId: presign.accessKeyId,
    secretAccessKey: presign.secretAccessKey,
    service: "s3",
    region: presign.region ?? "auto",
    signQuery: true
  });
  const signed = await signer.sign();
  return signed.url.toString();
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
    capabilities: { range: true },
    getUrl(path) {
      return `${base}/get?path=${encodeURIComponent(path)}`;
    },
    // Opt-in via `presign: true`. The server only mounts `/presign` when
    // its store implements `getDownloadUrl`, so without the flag we'd be
    // probing an endpoint that doesn't exist — and a failing async URL
    // resolution causes `<FileTree>`'s download icon to render disabled
    // instead of falling back to `getUrl`'s proxying `/get` route.
    ...opts.presign ? {
      async getDownloadUrl(path, dlOpts) {
        const params = new URLSearchParams({ path });
        if (dlOpts?.expiresIn != null) params.set("expires", String(dlOpts.expiresIn));
        const res = await f(`${base}/presign?${params}`, { headers });
        if (!res.ok) {
          throw new Error(`presign ${path}: ${res.status} ${await res.text()}`);
        }
        const body = await res.json();
        if (typeof body.url !== "string") throw new Error(`presign ${path}: malformed response`);
        return body.url;
      }
    } : {}
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
    },
    // Only expose `getUrl` if *every* child can produce one — that way
    // the UI's "is download supported here?" check is a simple
    // `typeof store.getUrl === 'function'` instead of a per-path probe.
    ...names.length > 0 && names.every((n) => typeof children[n].getUrl === "function") ? {
      getUrl(path) {
        const s = split(path);
        if (!s) throw new Error(`MultiStore.getUrl: no child for ${JSON.stringify(path)}`);
        return s.child.getUrl(s.rest);
      }
    } : {},
    // Same all-or-nothing rule as `getUrl`: only expose if every child
    // can mint a URL on demand. Async-presigning store + binding-only
    // sibling would otherwise have to be a per-path probe at the UI.
    ...names.length > 0 && names.every((n) => typeof children[n].getDownloadUrl === "function") ? {
      async getDownloadUrl(path, opts) {
        const s = split(path);
        if (!s) throw new Error(`MultiStore.getDownloadUrl: no child for ${JSON.stringify(path)}`);
        return s.child.getDownloadUrl(s.rest, opts);
      }
    } : {}
  };
}

// src/stores/s3.ts
import { AwsClient, AwsV4Signer as AwsV4Signer2 } from "aws4fetch";

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
  const signer = opts.accessKeyId && opts.secretAccessKey ? new AwsClient({
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
        const signer2 = new AwsV4Signer2({
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

// src/stores/gcs.ts
import { AwsClient as AwsClient2, AwsV4Signer as AwsV4Signer3 } from "aws4fetch";
var DEFAULT_ENDPOINT = "https://storage.googleapis.com";
var DEFAULT_REGION = "auto";
function GcsStore(opts) {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const region = opts.region ?? DEFAULT_REGION;
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const bearer = opts.getToken;
  const hmacSigner = !bearer && opts.accessKeyId && opts.secretAccessKey ? new AwsClient2({
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
        const signer = new AwsV4Signer3({
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
  GcsStore,
  HttpStore,
  MockStore,
  MultiStore,
  R2Store,
  S3Store
};
//# sourceMappingURL=index.js.map