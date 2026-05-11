/** S3 proxy Cloudflare Worker — reference implementation.
 *
 *  Wraps an S3 (or any S3-compatible — R2-via-S3-API, MinIO, etc.)
 *  bucket with `S3Store` + `createHandlers`, exposing the file-tree
 *  HTTP protocol at `/v1/files/*`. A browser `HttpStore` on the
 *  consuming site then talks to it as if it were any other file-tree
 *  backend.
 *
 *  Setup:
 *  1. Copy this dir into your repo.
 *  2. Set the four secrets via `wrangler secret put`:
 *       wrangler secret put S3_BUCKET
 *       wrangler secret put S3_REGION
 *       wrangler secret put S3_ACCESS_KEY_ID
 *       wrangler secret put S3_SECRET_ACCESS_KEY
 *     (or hardcode `S3_BUCKET` + `S3_REGION` as `[vars]` in
 *     `wrangler.toml` if they're non-secret.)
 *  3. (Optional) Set `S3_ENDPOINT` for R2/MinIO/LocalStack.
 *  4. `wrangler deploy`.
 *  5. In your site, `HttpStore('https://<worker>.workers.dev/v1/files')`.
 */
import { S3Store } from '@rdub/file-tree/stores/s3'
import { createHandlers } from '@rdub/file-tree/server'

interface Env {
  S3_BUCKET: string
  S3_REGION: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  /** Optional S3-compatible endpoint (R2, MinIO, etc.). Leave unset
   *  for real AWS S3. */
  S3_ENDPOINT?: string
  /** Optional comma-separated allow-list of key prefixes; restricts
   *  which subtrees this proxy will expose. */
  S3_PREFIXES?: string
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
      const store = S3Store({
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        ...(env.S3_PREFIXES ? { prefixes: env.S3_PREFIXES.split(',').map(s => s.trim()) } : {}),
      })
      const handlers = createHandlers(store, { basePath: BASE_PATH, corsOrigin })
      const resp = await handlers.handle(request)
      if (resp) return resp
    }

    return new Response('not found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
    })
  },
} satisfies ExportedHandler<Env>
