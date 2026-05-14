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
import { R2Store, type R2PresignOptions } from '@rdub/file-tree/stores/r2'
import { MultiStore } from '@rdub/file-tree/stores/multi'
import { createHandlers } from '@rdub/file-tree/server'

interface Env {
  CTBK: R2Bucket
  NJ_CRASHES: R2Bucket
  DEMO: R2Bucket
  CORS_ORIGIN?: string
  /** R2 S3-compatible endpoint, `https://<account>.r2.cloudflarestorage.com`.
   *  All three buckets share an account, so one endpoint covers them all. */
  R2_S3_ENDPOINT?: string
  /** Account-scoped S3 API token (R2 dashboard → Manage API Tokens). When
   *  set alongside `R2_S3_ENDPOINT`, the worker mints presigned URLs so
   *  downloads stream directly from R2 (no worker in the data path). */
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  /** Override presign URL lifetime in seconds. Default `3600` (1h). */
  R2_PRESIGN_EXPIRES?: string
}

const BASE_PATH = '/v1/files'

function presignFor(env: Env, bucketName: string): R2PresignOptions | undefined {
  if (!env.R2_S3_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return undefined
  const expiresIn = env.R2_PRESIGN_EXPIRES ? parseInt(env.R2_PRESIGN_EXPIRES, 10) : undefined
  return {
    endpoint: env.R2_S3_ENDPOINT,
    bucket: bucketName,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    ...(expiresIn ? { expiresIn } : {}),
  }
}

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
        demo: R2Store(env.DEMO, {
          prefixes: [''],
          ...(presignFor(env, 'file-tree-demo') ? { presign: presignFor(env, 'file-tree-demo')! } : {}),
        }),
        ctbk: R2Store(env.CTBK, {
          prefixes: ['gbfs/', 'avail/'],
          ...(presignFor(env, 'ctbk') ? { presign: presignFor(env, 'ctbk')! } : {}),
        }),
        crashes: R2Store(env.NJ_CRASHES, {
          prefixes: ['raw/'],
          ...(presignFor(env, 'nj-crashes') ? { presign: presignFor(env, 'nj-crashes')! } : {}),
        }),
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
