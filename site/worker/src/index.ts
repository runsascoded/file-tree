/** HttpDemo backend Worker.
 *
 * Exposes ctbk + nj-crashes buckets through a single `MultiStore` at
 * `/v1/files/*`. The companion `<HttpDemo>` route in `site/` points at
 * this worker (default `http://localhost:8732/v1/files`).
 *
 * Each child bucket is scoped via `R2Store.prefixes` to the same subset
 * the real consumer apps expose (gbfs/, avail/ for ctbk; raw/ for
 * crashes), so this demo worker can't reveal anything its parent apps
 * don't already serve.
 */
import { R2Store } from '@rdub/file-tree/stores/r2'
import { MultiStore } from '@rdub/file-tree/stores/multi'
import { createHandlers } from '@rdub/file-tree/server'

interface Env {
  CTBK: R2Bucket
  NJ_CRASHES: R2Bucket
  DEMO: R2Bucket
  CORS_ORIGIN?: string
}

const BASE_PATH = '/v1/files'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const corsOrigin = env.CORS_ORIGIN ?? '*'

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

    if (url.pathname.startsWith(BASE_PATH)) {
      const store = MultiStore({
        demo: R2Store(env.DEMO, { prefixes: [''] }),
        ctbk: R2Store(env.CTBK, { prefixes: ['gbfs/', 'avail/'] }),
        crashes: R2Store(env.NJ_CRASHES, { prefixes: ['raw/'] }),
      })
      const handlers = createHandlers(store, {
        basePath: BASE_PATH,
        corsOrigin,
      })
      const resp = await handlers.handle(request)
      if (resp) return resp
    }

    return new Response('not found', { status: 404, headers: { 'Access-Control-Allow-Origin': corsOrigin } })
  },
} satisfies ExportedHandler<Env>
