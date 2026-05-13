/** Server-side HTTP handlers that expose any `Store` over HTTP.
 *
 * Wire these into your CFW (or Node) router. The companion `HttpStore`
 * client (`@rdub/file-tree/stores/http`) speaks to this protocol.
 *
 * Endpoints (all GET):
 *   /list?prefix=<p>&cursor=<c>&limit=<n>     → ListResult JSON
 *   /get?path=<p>                              → object bytes (Range honored)
 */
import type { Store } from '../types'

export interface Handlers {
  /** Try to handle `request`. Returns `null` if the URL doesn't match a
   *  file-tree endpoint, so callers can chain other routes. */
  handle(request: Request): Promise<Response | null>
}

export interface CreateHandlersOptions {
  /** Path under which the endpoints live. Defaults to `/`. The `/list`,
   *  `/get` endpoints are appended to this base. */
  basePath?: string
  /** CORS origin to advertise. Defaults to `*`. Set to `null` to skip
   *  CORS headers. */
  corsOrigin?: string | null
}

export function createHandlers(store: Store, opts: CreateHandlersOptions = {}): Handlers {
  const base = (opts.basePath ?? '').replace(/\/+$/, '')
  const cors = opts.corsOrigin === undefined ? '*' : opts.corsOrigin
  const corsHeaders: Record<string, string> = cors ? { 'Access-Control-Allow-Origin': cors } : {}

  return {
    async handle(request: Request): Promise<Response | null> {
      const url = new URL(request.url)
      const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null
      if (path == null) return null

      if (path === '/list') {
        const prefix = url.searchParams.get('prefix') ?? ''
        const cursor = url.searchParams.get('cursor') ?? undefined
        const limitStr = url.searchParams.get('limit')
        const limit = limitStr ? parseInt(limitStr, 10) : undefined
        try {
          const opts = cursor !== undefined || limit !== undefined ? { cursor, limit } : undefined
          const result = await store.list(prefix, opts)
          return jsonResponse(result, 200, corsHeaders)
        } catch (e) {
          return errorResponse(e, corsHeaders)
        }
      }

      if (path === '/get') {
        const p = url.searchParams.get('path')
        if (!p) return jsonResponse({ error: 'path required' }, 400, corsHeaders)
        const rangeHeader = request.headers.get('Range')
        const range = parseRange(rangeHeader)
        try {
          const result = await store.get(p, range ?? undefined)
          const headers = new Headers(corsHeaders)
          if (result.contentType) headers.set('Content-Type', result.contentType)
          headers.set('Content-Length', String(result.bytes.byteLength))
          // Suggest the object basename to user agents — browsers ignore the
          // `download` attribute on cross-origin anchors, so without this
          // header the saved file is named after the URL path (e.g. `get`).
          const basename = p.split('/').pop() || p
          headers.set('Content-Disposition', `attachment; filename="${basename.replace(/"/g, '\\"')}"`)
          if (range && result.totalSize != null) {
            headers.set('Content-Range', `bytes ${range.offset}-${range.offset + result.bytes.byteLength - 1}/${result.totalSize}`)
            return new Response(result.bytes as BodyInit, { status: 206, headers })
          }
          return new Response(result.bytes as BodyInit, { status: 200, headers })
        } catch (e) {
          return errorResponse(e, corsHeaders)
        }
      }

      return null
    },
  }
}

function jsonResponse(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

function errorResponse(e: unknown, extra: Record<string, string>): Response {
  // Use `name === 'NotFoundError'` rather than `instanceof`: subpath exports
  // each carry their own copy of `../types`, so the `NotFoundError` thrown
  // from a store impl isn't `instanceof` this module's `NotFoundError`.
  if (e instanceof Error && e.name === 'NotFoundError') {
    return jsonResponse({ error: e.message }, 404, extra)
  }
  const msg = e instanceof Error ? e.message : String(e)
  return jsonResponse({ error: msg }, 500, extra)
}

function parseRange(h: string | null): { offset: number; length: number } | null {
  if (!h) return null
  const m = h.match(/^bytes=(\d+)-(\d+)$/)
  if (!m) return null
  const offset = parseInt(m[1], 10)
  const end = parseInt(m[2], 10)
  return { offset, length: end - offset + 1 }
}
