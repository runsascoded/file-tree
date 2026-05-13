/** S3-compatible `Store`. Browser- and Worker-friendly: uses `fetch` +
 *  `crypto.subtle` via `aws4fetch` for SigV4 signing — no AWS SDK.
 *
 * Works against:
 * - AWS S3 (`endpoint` omitted; default `https://<bucket>.s3.<region>.amazonaws.com`)
 * - Cloudflare R2 S3-compatible API (`endpoint: 'https://<account>.r2.cloudflarestorage.com'`)
 * - MinIO / LocalStack / any S3-compatible service (`endpoint: '<your-url>'`)
 *
 * Two auth modes:
 * - **Public bucket**: omit `accessKeyId`/`secretAccessKey`. Requests are
 *   unsigned. Useful for AWS open-data buckets, R2 `*.r2.dev` URLs,
 *   etc.
 * - **Signed**: pass `accessKeyId` + `secretAccessKey` (and optional
 *   `sessionToken`). Used for private buckets, R2 with R2 access keys,
 *   etc.
 *
 * Usage:
 *   import { S3Store } from '@rdub/file-tree/stores/s3'
 *
 *   // Browser-direct, public:
 *   const store = S3Store({ bucket: 'open-data-bucket' })
 *
 *   // Server-proxy (CFW with env-var creds):
 *   const store = S3Store({
 *     bucket: env.S3_BUCKET,
 *     region: env.S3_REGION ?? 'us-east-1',
 *     accessKeyId: env.S3_ACCESS_KEY_ID,
 *     secretAccessKey: env.S3_SECRET_ACCESS_KEY,
 *     prefixes: ['data/'],
 *   })
 *   const handlers = createHandlers(store, { basePath: '/api/files' })
 *
 *   // R2 via S3-compatible API:
 *   const store = S3Store({
 *     bucket: 'my-r2-bucket',
 *     endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
 *     region: 'auto',
 *     accessKeyId: env.R2_ACCESS_KEY_ID,
 *     secretAccessKey: env.R2_SECRET_ACCESS_KEY,
 *   })
 */
import { AwsClient } from 'aws4fetch'
import type { Entry, GetResult, ListOptions, ListResult, Range, Store } from '../types'
import { NotFoundError } from '../types'

export interface S3StoreOptions {
  /** Bucket name. Required. */
  bucket: string
  /** AWS region. Default `'us-east-1'`. Use `'auto'` for R2. */
  region?: string
  /** S3 endpoint override. Default builds the AWS virtual-hosted-style
   *  URL (`https://<bucket>.s3.<region>.amazonaws.com`). Set to an
   *  R2/MinIO/LocalStack endpoint to target a compatible service. When
   *  set, requests use path-style URLs (`<endpoint>/<bucket>/<key>`). */
  endpoint?: string
  /** SigV4 access key. Omit for public/unsigned access. */
  accessKeyId?: string
  /** SigV4 secret. Omit for public/unsigned access. */
  secretAccessKey?: string
  /** Optional STS session token (for temporary credentials). */
  sessionToken?: string
  /** Allow-list of key prefixes. Same semantics as `R2Store.prefixes`:
   *  empty-prefix `list('')` synthesizes a virtual root over these. */
  prefixes?: string[]
  /** Custom `fetch` impl. Defaults to global. */
  fetch?: typeof globalThis.fetch
}

/** Build the request URL for a given S3 path under this store.
 *  - With `endpoint` set: path-style (`<endpoint>/<bucket>/<key>`).
 *  - Without `endpoint`: virtual-hosted-style
 *    (`https://<bucket>.s3.<region>.amazonaws.com/<key>`). */
function buildUrl(opts: { bucket: string; region: string; endpoint?: string }, key: string, search?: string): string {
  const trail = search ? `?${search}` : ''
  const safeKey = key.split('/').map(encodeURIComponent).join('/')
  if (opts.endpoint) {
    const base = opts.endpoint.replace(/\/+$/, '')
    return `${base}/${opts.bucket}/${safeKey}${trail}`
  }
  return `https://${opts.bucket}.s3.${opts.region}.amazonaws.com/${safeKey}${trail}`
}

/** Minimal XML extractor for ListObjectsV2's flat structure. Avoids
 *  pulling in a full XML parser — S3's list response is regular enough
 *  that we can walk it with a tag-aware string scan. Returns the inner
 *  text of every occurrence of `<tag>...</tag>`. */
function extractAll(xml: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  for (const m of xml.matchAll(re)) out.push(decodeXmlEntities(m[1]))
  return out
}

function extractFirst(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? decodeXmlEntities(m[1]) : undefined
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Pull the per-`<Contents>` block fields out of a ListObjectsV2 body.
 *  Each block looks like:
 *    <Contents><Key>...</Key><LastModified>...</LastModified><Size>...</Size>...</Contents> */
function parseContents(xml: string): Array<{ key: string; size: number; lastModified: string }> {
  const out: Array<{ key: string; size: number; lastModified: string }> = []
  for (const block of extractAll(xml, 'Contents')) {
    const key = extractFirst(block, 'Key')
    if (!key) continue
    const sizeStr = extractFirst(block, 'Size') ?? '0'
    const lastModified = extractFirst(block, 'LastModified') ?? ''
    out.push({ key, size: parseInt(sizeStr, 10), lastModified })
  }
  return out
}

function parseCommonPrefixes(xml: string): string[] {
  const out: string[] = []
  for (const block of extractAll(xml, 'CommonPrefixes')) {
    const prefix = extractFirst(block, 'Prefix')
    if (prefix) out.push(prefix)
  }
  return out
}

export function S3Store(opts: S3StoreOptions): Store {
  const region = opts.region ?? 'us-east-1'
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const allowedPrefixes = opts.prefixes
  const urlOpts = { bucket: opts.bucket, region, endpoint: opts.endpoint }

  const signer = opts.accessKeyId && opts.secretAccessKey
    ? new AwsClient({
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        ...(opts.sessionToken ? { sessionToken: opts.sessionToken } : {}),
        service: 's3',
        region,
      })
    : undefined

  async function request(url: string, init?: RequestInit): Promise<Response> {
    if (!signer) return f(url, init)
    // aws4fetch's `.fetch` signs then dispatches. We pass through the
    // user-supplied fetch only when unsigned — aws4fetch always uses
    // global fetch internally, which is fine for both browser and CFW.
    return signer.fetch(url, init)
  }

  const checkPrefix = (path: string, label: string) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return
    if (allowedPrefixes.some(p => path === p || path.startsWith(p))) return
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(', ')}`)
  }

  return {
    async list(prefix, listOpts: ListOptions = {}): Promise<ListResult> {
      const p = prefix.endsWith('/') || prefix === '' ? prefix : `${prefix}/`
      // Scoped-bucket virtual root (parallels `R2Store`): listing `""`
      // with allowed prefixes returns a synthetic dir per prefix.
      if (p === '' && allowedPrefixes && allowedPrefixes.length > 0 && !allowedPrefixes.some(ap => ap === '')) {
        const entries: Entry[] = allowedPrefixes
          .map(ap => ({ key: ap.endsWith('/') ? ap : `${ap}/`, isDir: true }))
          .sort((a, b) => a.key.localeCompare(b.key))
        return { entries }
      }
      checkPrefix(p, 'list prefix')

      const params = new URLSearchParams({ 'list-type': '2', delimiter: '/' })
      if (p) params.set('prefix', p)
      if (listOpts.cursor) params.set('continuation-token', listOpts.cursor)
      params.set('max-keys', String(listOpts.limit ?? 1000))

      const url = buildUrl(urlOpts, '', params.toString())
      const res = await request(url)
      if (!res.ok) throw new Error(`S3 list ${p}: ${res.status} ${await res.text()}`)
      const xml = await res.text()

      const dirs = parseCommonPrefixes(xml).map(prefix => ({ key: prefix, isDir: true } as Entry))
      const files: Entry[] = []
      for (const o of parseContents(xml)) {
        if (o.key === p) continue  // skip zero-byte "directory marker"
        files.push({
          key: o.key,
          size: o.size,
          lastModified: o.lastModified,
          isDir: false,
        })
      }
      const entries: Entry[] = [...dirs, ...files]
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.key.localeCompare(b.key)
      })
      const out: ListResult = { entries }
      const isTruncated = (extractFirst(xml, 'IsTruncated') ?? 'false').trim() === 'true'
      const nextToken = extractFirst(xml, 'NextContinuationToken')
      if (isTruncated && nextToken) out.cursor = nextToken
      return out
    },

    async get(path: string, range?: Range): Promise<GetResult> {
      checkPrefix(path, 'get path')
      const url = buildUrl(urlOpts, path)
      const headers: Record<string, string> = {}
      if (range) headers['Range'] = `bytes=${range.offset}-${range.offset + range.length - 1}`
      const res = await request(url, { headers })
      if (res.status === 404) throw new NotFoundError(path)
      if (!res.ok && res.status !== 206) {
        throw new Error(`S3 get ${path}: ${res.status} ${await res.text()}`)
      }
      const cr = res.headers.get('Content-Range')
      // 206 + no `Content-Range` (common: AWS S3 default CORS strips
      // it) means we can't know the total size from this response —
      // `Content-Length` is the partial length, not the full file's.
      // Only trust `Content-Length` for 200 responses.
      const totalSize = cr
        ? parseInt(cr.split('/')[1], 10)
        : res.status === 200
          ? parseInt(res.headers.get('Content-Length') ?? '', 10)
          : NaN
      const bytes = new Uint8Array(await res.arrayBuffer())
      const out: GetResult = { bytes }
      if (Number.isFinite(totalSize)) out.totalSize = totalSize
      const ct = res.headers.get('Content-Type')
      if (ct) out.contentType = ct
      return out
    },

    capabilities: { range: true },

    // Direct browser GET only works for unsigned (public) buckets;
    // signed access requires SigV4 presigning, which aws4fetch doesn't
    // surface as a query-string URL. Consumers of signed `S3Store` who
    // want download links should proxy through `createHandlers()` and
    // expose an `HttpStore` to the browser.
    ...(signer ? {} : { getUrl: (p: string) => buildUrl(urlOpts, p) }),
  }
}
