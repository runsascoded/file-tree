/** Cloudflare Workers R2 binding-backed Store.
 *
 * Wraps a `R2Bucket` from the CFW runtime. Native binding — no HTTP, no
 * signing. Only callable from inside a Worker.
 *
 * Usage:
 *   import { R2Store } from '@rdub/file-tree/stores/r2'
 *   const store = R2Store(env.R2, { prefixes: ['raw/'] })
 */
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

export interface R2StoreOptions {
  /** Allow-list of key prefixes. Any list/get for paths outside these is
   *  rejected. Use `['']` to allow the whole bucket (escape-hatch). */
  prefixes?: string[]
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
  }
}
