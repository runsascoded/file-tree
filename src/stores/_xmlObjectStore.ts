/** Shared internals for S3-XML-shaped object stores (`S3Store`, `GcsStore`).
 *  Not exported publicly — consumers reach for a concrete store.
 *
 *  The XML ListObjectsV2 API + HTTP Range GET is the same wire shape
 *  across AWS S3 and GCS's S3-interoperability endpoint. Auth differs:
 *  S3 uses SigV4 (via `aws4fetch`); GCS uses either SigV4 (HMAC interop
 *  keys) or an OAuth bearer token. Each store constructs its own
 *  `request(url, init?)` that signs (or doesn't) and hands it here.
 *  This module handles URL shape (virtual-hosted-style vs path-style),
 *  ListObjectsV2 XML parsing, and ranged GET → `GetResult`. */
import type { Entry, GetResult, ListOptions, ListResult, Range } from '../types'
import { NotFoundError } from '../types'

export interface XmlObjectStoreOptions {
  /** Bucket name. */
  bucket: string
  /** Region string used in AWS virtual-hosted-style URLs. Ignored when
   *  `endpoint` is set (path-style). SigV4 credential-scope region is
   *  the caller's concern (via the `request` fn); this is URL-only. */
  region: string
  /** Endpoint override. When set → path-style
   *  (`<endpoint>/<bucket>/<key>`); when omitted → AWS
   *  virtual-hosted-style (`https://<bucket>.s3.<region>.amazonaws.com/<key>`). */
  endpoint?: string
  /** Fetch wrapper that has already applied auth (SigV4 signing,
   *  Bearer header, or nothing). Called with a fully-built URL. */
  request: (url: string, init?: RequestInit) => Promise<Response>
  /** Optional allow-list of key prefixes. When set, `list('')`
   *  synthesizes a virtual root of one dir per allowed prefix; `get`
   *  and any other `list` reject paths outside the allow-list. */
  allowedPrefixes?: string[]
}

export interface XmlObjectStoreMethods {
  list(prefix: string, opts?: ListOptions): Promise<ListResult>
  get(path: string, range?: Range): Promise<GetResult>
  /** Exposed so stores can build their own URLs for `getUrl` /
   *  presigning without duplicating the virtual-hosted-vs-path-style
   *  logic. */
  buildUrl(key: string, search?: string): string
  /** Exposed so stores can enforce the allow-list before minting a
   *  presigned URL (which happens outside `list`/`get`). */
  checkPrefix(path: string, label: string): void
}

/** Build the request URL for a given key under this store.
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
 *  pulling in a full XML parser — the list response is regular enough
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

export function xmlObjectStore(opts: XmlObjectStoreOptions): XmlObjectStoreMethods {
  const urlOpts = { bucket: opts.bucket, region: opts.region, endpoint: opts.endpoint }
  const allowedPrefixes = opts.allowedPrefixes

  const checkPrefix = (path: string, label: string) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return
    if (allowedPrefixes.some(p => path === p || path.startsWith(p))) return
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(', ')}`)
  }

  return {
    buildUrl: (key, search) => buildUrl(urlOpts, key, search),
    checkPrefix,

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
      const res = await opts.request(url)
      if (!res.ok) throw new Error(`list ${p}: ${res.status} ${await res.text()}`)
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
      const res = await opts.request(url, { headers })
      if (res.status === 404) throw new NotFoundError(path)
      if (!res.ok && res.status !== 206) {
        throw new Error(`get ${path}: ${res.status} ${await res.text()}`)
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
  }
}
