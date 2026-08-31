/** Server-side HTTP handlers that expose any `Store` over HTTP.
 *
 * Wire these into your CFW (or Node) router. The companion `HttpStore`
 * client (`@rdub/file-tree/stores/http`) speaks to this protocol.
 *
 * Endpoints (all GET):
 *   /list?prefix=<p>&cursor=<c>&limit=<n>     → ListResult JSON
 *   /get?path=<p>                              → object bytes (Range honored)
 *   /presign?path=<p>&expires=<s>              → { url } JSON
 *     Only mounted when the underlying store implements `getDownloadUrl`.
 *     `expires` is forwarded to the store (caller hint); stores that
 *     ignore it use their built-in default.
 */
import type { Store } from '../types'

/** The parts of Cloudflare's `ExecutionContext` a handler can use.
 *
 *  Structural on purpose: a Worker passes its `ctx` straight through,
 *  and a Node or test caller passes nothing. */
export interface HandlerContext {
  /** Keep `p` alive past the response — cache writes, metrics. */
  waitUntil?(p: Promise<unknown>): void
}

export interface Handlers {
  /** Try to handle `request`. Returns `null` if the URL doesn't match a
   *  file-tree endpoint, so callers can chain other routes. */
  handle(request: Request, ctx?: HandlerContext): Promise<Response | null>
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
  const corsHeaders: Record<string, string> = cors
    ? {
        'Access-Control-Allow-Origin': cors,
        // `Content-Range` is NOT CORS-safelisted: without exposing it,
        // browser clients can't read the total size off a 206 — the
        // `HttpStore` → `asyncBufferFromStore` chain then falls back to
        // `bytes.byteLength` of a 1-byte probe and hyparquet trips
        // `RangeError: Offset is outside the bounds of the DataView`.
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Content-Type, Content-Disposition',
      }
    : {}

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

      if (path === '/presign') {
        if (typeof store.getDownloadUrl !== 'function') {
          return jsonResponse({ error: 'presign not supported by this store' }, 404, corsHeaders)
        }
        const p = url.searchParams.get('path')
        if (!p) return jsonResponse({ error: 'path required' }, 400, corsHeaders)
        const expStr = url.searchParams.get('expires')
        const opts = expStr ? { expiresIn: parseInt(expStr, 10) } : undefined
        try {
          const signed = await store.getDownloadUrl(p, opts)
          return jsonResponse({ url: signed }, 200, corsHeaders)
        } catch (e) {
          return errorResponse(e, corsHeaders)
        }
      }

      if (path === '/get') {
        const p = url.searchParams.get('path')
        if (!p) return jsonResponse({ error: 'path required' }, 400, corsHeaders)
        if (request.method === 'HEAD') {
          // Size probe (`asyncBufferFromStore` prefers HEAD): answer via a
          // 1-byte ranged read — `Store` has no `head`, and falling through
          // to a full-object GET both wastes bandwidth and can exceed
          // worker limits on multi-hundred-MB objects.
          try {
            const probe = await store.get(p, { offset: 0, length: 1 })
            const size = probe.totalSize ?? probe.bytes.byteLength
            const headers = new Headers(corsHeaders)
            if (probe.contentType) headers.set('Content-Type', probe.contentType)
            headers.set('Content-Length', String(size))
            headers.set('Accept-Ranges', 'bytes')
            return new Response(null, { status: 200, headers })
          } catch (e) {
            return errorResponse(e, corsHeaders)
          }
        }
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
