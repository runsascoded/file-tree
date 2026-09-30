/** The demo site's edge: one Worker serving
 *
 *   - `/v1/files/*` — the file-tree HTTP protocol over a `MultiStore` of
 *     R2 buckets (what `<HttpDemo>` at `/http` browses);
 *   - `/og/<mount>/<splat>.<png|svg>` — per-path share cards
 *     (`@rdub/file-tree/og`, rasterized with resvg-wasm);
 *   - everything else — the built SPA (`site/dist`, the `[assets]`
 *     binding), with per-path `og:*` tags stamped into its HTML so an
 *     unfurler (which never runs the JS) sees a card for the path.
 *
 *  See `specs/done/cfw-og-images.md` (the as-built spec) and `README.md`.
 */
import { createHandlers } from '@rdub/file-tree/server'
import type { Env } from './env'
import { serveOgImage, stampHtml } from './og'
import { parseOgImagePath } from './routes'
import { r2DemoStore } from './stores'

const BASE_PATH = '/v1/files'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const corsOrigin = env.CORS_ORIGIN ?? '*'

    if (url.pathname.startsWith(BASE_PATH)) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '86400',
          },
        })
      }
      const handlers = createHandlers(r2DemoStore(env), { basePath: BASE_PATH, corsOrigin })
      const resp = await handlers.handle(request)
      if (resp) return resp
      return new Response('not found', { status: 404, headers: { 'Access-Control-Allow-Origin': corsOrigin } })
    }

    const og = parseOgImagePath(url.pathname)
    if (og && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveOgImage(request, og, env, ctx)
    }

    // The SPA. `not_found_handling = "single-page-application"` answers
    // a navigation to any route with `index.html`; stamp its `<head>`.
    const res = await env.ASSETS.fetch(request)
    if ((res.headers.get('content-type') ?? '').startsWith('text/html')) {
      return stampHtml(request, res)
    }
    return res
  },
} satisfies ExportedHandler<Env>
