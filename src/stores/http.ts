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
  }
}
