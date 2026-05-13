/** Cloudflare Workers R2 binding-backed Store.
 *
 * Wraps a `R2Bucket` from the CFW runtime. Native binding — no HTTP, no
 * signing. Only callable from inside a Worker.
 *
 * Usage:
 *   import { R2Store } from '@rdub/file-tree/stores/r2'
 *   const store = R2Store(env.R2, { prefixes: ['raw/'] })
 *
 * For presigned downloads (browser GETs go direct to R2, bypassing the
 * worker data path), pass `presign: { endpoint, bucket, accessKeyId,
 * secretAccessKey }`. Then `getDownloadUrl(path)` mints a short-lived
 * SigV4 URL.
 */
import { AwsV4Signer } from 'aws4fetch'
import type { Entry, GetResult, ListOptions, ListResult, Range, Store } from '../types'
import { NotFoundError } from '../types'

/** Cloudflare's `R2Bucket` shape — minimal subset we use. Avoid pulling in
 *  `@cloudflare/workers-types` as a dep so non-CFW consumers can install
 *  the package without a phantom type. Exported for tests / mock impls. */
export interface R2Bucket {
  list(opts: { prefix?: string; delimiter?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; size: number; uploaded: Date; httpMetadata?: { contentType?: string } }>
    delimitedPrefixes?: string[]
    truncated: boolean
    cursor?: string
  }>
  get(key: string, opts?: { range?: { offset: number; length: number } }): Promise<{
    body: ReadableStream<Uint8Array>
    arrayBuffer: () => Promise<ArrayBuffer>
    size: number
    httpMetadata?: { contentType?: string }
  } | null>
}

export interface R2PresignOptions {
  /** R2 S3-compatible endpoint, e.g. `https://<account>.r2.cloudflarestorage.com`. */
  endpoint: string
  /** Bucket name (used in the path-style URL the signer presigns). */
  bucket: string
  /** R2 access-key ID (S3-compat). */
  accessKeyId: string
  /** R2 secret access key (S3-compat). */
  secretAccessKey: string
  /** Default URL lifetime in seconds. Default `3600` (1h). Per-call
   *  override via `getDownloadUrl(path, { expiresIn })`. */
  expiresIn?: number
  /** Region passed to SigV4. R2 ignores it; default `'auto'`. */
  region?: string
}

export interface R2StoreOptions {
  /** Allow-list of key prefixes. Any list/get for paths outside these is
   *  rejected. Use `['']` to allow the whole bucket (escape-hatch). */
  prefixes?: string[]
  /** S3-compatible credentials enabling `getDownloadUrl()` (presigned
   *  GETs). When set, the worker can mint URLs the browser uses to
   *  stream bytes directly from R2 — no proxying through `/get`. */
  presign?: R2PresignOptions
}

export function R2Store(bucket: R2Bucket, opts: R2StoreOptions = {}): Store {
  const allowedPrefixes = opts.prefixes
  const checkPrefix = (path: string, label: string) => {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return
    if (allowedPrefixes.some(p => path === p || path.startsWith(p))) return
    throw new Error(`${label} ${JSON.stringify(path)} not under any allowed prefix: ${allowedPrefixes.join(', ')}`)
  }

  return {
    async list(prefix, opts: ListOptions = {}) {
      const p = prefix.endsWith('/') || prefix === '' ? prefix : `${prefix}/`
      // Scoped-bucket virtual root: when the store is restricted to a set
      // of prefixes and the caller asks to list `''`, synthesize a
      // directory entry per allowed prefix instead of erroring. Lets the
      // UI navigate from "(bucket root)" → an allowed subtree without
      // requiring callers to know the scope a priori.
      if (p === '' && allowedPrefixes && allowedPrefixes.length > 0 && !allowedPrefixes.some(ap => ap === '')) {
        const entries: Entry[] = allowedPrefixes
          .map(ap => ({ key: ap.endsWith('/') ? ap : `${ap}/`, isDir: true }))
          .sort((a, b) => a.key.localeCompare(b.key))
        return { entries }
      }
      checkPrefix(p, 'list prefix')
      const result = await bucket.list({
        prefix: p,
        delimiter: '/',
        cursor: opts.cursor,
        limit: opts.limit ?? 1000,
      })
      const entries: Entry[] = []
      for (const dir of result.delimitedPrefixes ?? []) {
        entries.push({ key: dir, isDir: true })
      }
      for (const obj of result.objects ?? []) {
        if (obj.key === p) continue  // self-as-zero-byte-object pattern (R2 console)
        entries.push({
          key: obj.key,
          size: obj.size,
          lastModified: obj.uploaded.toISOString(),
          isDir: false,
        })
      }
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.key.localeCompare(b.key)
      })
      const out: ListResult = { entries }
      if (result.truncated && result.cursor) out.cursor = result.cursor
      return out
    },

    async get(path: string, range?: Range): Promise<GetResult> {
      checkPrefix(path, 'get path')
      const obj = await bucket.get(path, range ? { range: { offset: range.offset, length: range.length } } : undefined)
      if (!obj) throw new NotFoundError(path)
      const bytes = new Uint8Array(await obj.arrayBuffer())
      const out: GetResult = { bytes, totalSize: obj.size }
      if (obj.httpMetadata?.contentType) out.contentType = obj.httpMetadata.contentType
      return out
    },

    capabilities: { range: true },

    ...(opts.presign
      ? {
          async getDownloadUrl(path: string, dlOpts?: { expiresIn?: number }): Promise<string> {
            checkPrefix(path, 'getDownloadUrl path')
            return presignR2Url(opts.presign!, path, dlOpts?.expiresIn)
          },
        }
      : {}),
  }
}

async function presignR2Url(presign: R2PresignOptions, path: string, expiresIn?: number): Promise<string> {
  const endpoint = presign.endpoint.replace(/\/+$/, '')
  const safeKey = path.split('/').map(encodeURIComponent).join('/')
  const basename = path.split('/').pop() || path
  // SigV4 quirk: `X-Amz-Expires` must be in the canonical query string,
  // so we put it on the URL we hand to the signer. Same for
  // `response-content-disposition` — having it presigned guarantees the
  // R2 response carries the header without us round-tripping a HEAD.
  const search = new URLSearchParams({
    'X-Amz-Expires': String(expiresIn ?? presign.expiresIn ?? 3600),
    'response-content-disposition': `attachment; filename="${basename.replace(/"/g, '\\"')}"`,
  })
  const url = `${endpoint}/${presign.bucket}/${safeKey}?${search}`
  const signer = new AwsV4Signer({
    method: 'GET',
    url,
    accessKeyId: presign.accessKeyId,
    secretAccessKey: presign.secretAccessKey,
    service: 's3',
    region: presign.region ?? 'auto',
    signQuery: true,
  })
  const signed = await signer.sign()
  return signed.url.toString()
}
