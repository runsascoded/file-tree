/** HTTP client Store: hits a server that exposes the file-tree HTTP API
 *  (see `@rdub/file-tree/server`). Used by browser-side code where you
 *  can't talk to the underlying storage directly.
 *
 * Usage:
 *   import { HttpStore } from '@rdub/file-tree/stores/http'
 *   const store = HttpStore('https://api.example.com/v1/files')
 */
import type { GetResult, ListOptions, ListResult, Range, Store } from '../types'
import { NotFoundError } from '../types'

export interface HttpStoreOptions {
  /** Extra headers to include on every request (auth tokens, etc.). */
  headers?: Record<string, string>
  /** Custom fetch impl, defaults to global. */
  fetch?: typeof globalThis.fetch
  /** When `true`, expose `getDownloadUrl(path)` that calls `/presign` on
   *  the backend. The server only mounts `/presign` when its underlying
   *  store can mint signed URLs, so consumers must opt in deliberately
   *  to avoid stalling the UI's download icon against a 404 endpoint. */
  presign?: boolean
  /** What the API is fronting, for the breadcrumb root —
   *  `r2://my-bucket/gbfs/`. A browser client can't discover this: it
   *  has an API base and no idea what's behind it. Supplied rather than
   *  fetched because it's a *label*, and a label that arrives a render
   *  late shows "root" and then jumps. */
  describe?: string
}

export function HttpStore(apiBase: string, opts: HttpStoreOptions = {}): Store {

  const base = apiBase.replace(/\/+$/, '')
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const headers = opts.headers ?? {}

  return {
    async list(prefix, listOpts: ListOptions = {}) {
      const params = new URLSearchParams({ prefix })
      if (listOpts.cursor) params.set('cursor', listOpts.cursor)
      if (listOpts.limit) params.set('limit', String(listOpts.limit))
      const res = await f(`${base}/list?${params}`, { headers })
      if (res.status === 404) throw new NotFoundError(prefix)
      if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`)
      return res.json() as Promise<ListResult>
    },

    describe() { return opts.describe },

    async get(path: string, range?: Range): Promise<GetResult> {
      const params = new URLSearchParams({ path })
      const reqHeaders: Record<string, string> = { ...headers }
      if (range) {
        reqHeaders['Range'] = `bytes=${range.offset}-${range.offset + range.length - 1}`
      }
      const res = await f(`${base}/get?${params}`, { headers: reqHeaders })
      if (res.status === 404) throw new NotFoundError(path)
      if (!res.ok && res.status !== 206) {
        throw new Error(`get ${path}: ${res.status} ${await res.text()}`)
      }
      const cr = res.headers.get('Content-Range')
      const totalSize = cr ? parseInt(cr.split('/')[1], 10) : undefined
      const contentType = res.headers.get('Content-Type') ?? undefined
      const bytes = new Uint8Array(await res.arrayBuffer())
      const out: GetResult = { bytes }
      if (totalSize != null && Number.isFinite(totalSize)) out.totalSize = totalSize
      if (contentType) out.contentType = contentType
      return out
    },

    capabilities: { range: true },

    getUrl(path: string): string {
      return `${base}/get?path=${encodeURIComponent(path)}`
    },

    // Opt-in via `presign: true`. The server only mounts `/presign` when
    // its store implements `getDownloadUrl`, so without the flag we'd be
    // probing an endpoint that doesn't exist — and a failing async URL
    // resolution causes `<FileTree>`'s download icon to render disabled
    // instead of falling back to `getUrl`'s proxying `/get` route.
    ...(opts.presign
      ? {
          async getDownloadUrl(path: string, dlOpts?: { expiresIn?: number }): Promise<string> {
            const params = new URLSearchParams({ path })
            if (dlOpts?.expiresIn != null) params.set('expires', String(dlOpts.expiresIn))
            const res = await f(`${base}/presign?${params}`, { headers })
            if (!res.ok) {
              throw new Error(`presign ${path}: ${res.status} ${await res.text()}`)
            }
            const body = await res.json() as { url?: string }
            if (typeof body.url !== 'string') throw new Error(`presign ${path}: malformed response`)
            return body.url
          },
        }
      : {}),
  }
}
