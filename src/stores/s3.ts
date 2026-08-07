/** S3-compatible `Store`. Browser- and Worker-friendly: uses `fetch` +
 *  `crypto.subtle` via `aws4fetch` for SigV4 signing — no AWS SDK.
 *
 * Works against:
 * - AWS S3 (`endpoint` omitted; default `https://<bucket>.s3.<region>.amazonaws.com`)
 * - Cloudflare R2 S3-compatible API (`endpoint: 'https://<account>.r2.cloudflarestorage.com'`)
 * - MinIO / LocalStack / any S3-compatible service (`endpoint: '<your-url>'`)
 *
 * Two auth modes:
 * - **Public bucket**: omit `accessKeyId`/`secretAccessKey`. Requests are
 *   unsigned. Useful for AWS open-data buckets, R2 `*.r2.dev` URLs,
 *   etc.
 * - **Signed**: pass `accessKeyId` + `secretAccessKey` (and optional
 *   `sessionToken`). Used for private buckets, R2 with R2 access keys,
 *   etc.
 *
 * Usage:
 *   import { S3Store } from '@rdub/file-tree/stores/s3'
 *
 *   // Browser-direct, public:
 *   const store = S3Store({ bucket: 'open-data-bucket' })
 *
 *   // Server-proxy (CFW with env-var creds):
 *   const store = S3Store({
 *     bucket: env.S3_BUCKET,
 *     region: env.S3_REGION ?? 'us-east-1',
 *     accessKeyId: env.S3_ACCESS_KEY_ID,
 *     secretAccessKey: env.S3_SECRET_ACCESS_KEY,
 *     prefixes: ['data/'],
 *   })
 *   const handlers = createHandlers(store, { basePath: '/api/files' })
 *
 *   // R2 via S3-compatible API:
 *   const store = S3Store({
 *     bucket: 'my-r2-bucket',
 *     endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
 *     region: 'auto',
 *     accessKeyId: env.R2_ACCESS_KEY_ID,
 *     secretAccessKey: env.R2_SECRET_ACCESS_KEY,
 *   })
 */
import { AwsClient, AwsV4Signer } from 'aws4fetch'
import type { Store } from '../types'
import { xmlObjectStore } from './_xmlObjectStore'

export interface S3StoreOptions {
  /** Bucket name. Required. */
  bucket: string
  /** AWS region. Default `'us-east-1'`. Use `'auto'` for R2. */
  region?: string
  /** S3 endpoint override. Default builds the AWS virtual-hosted-style
   *  URL (`https://<bucket>.s3.<region>.amazonaws.com`). Set to an
   *  R2/MinIO/LocalStack endpoint to target a compatible service. When
   *  set, requests use path-style URLs (`<endpoint>/<bucket>/<key>`). */
  endpoint?: string
  /** SigV4 access key. Omit for public/unsigned access. */
  accessKeyId?: string
  /** SigV4 secret. Omit for public/unsigned access. */
  secretAccessKey?: string
  /** Optional STS session token (for temporary credentials). */
  sessionToken?: string
  /** Allow-list of key prefixes. Same semantics as `R2Store.prefixes`:
   *  empty-prefix `list('')` synthesizes a virtual root over these. */
  prefixes?: string[]
  /** Custom `fetch` impl. Defaults to global. */
  fetch?: typeof globalThis.fetch
  /** Default presigned-URL lifetime in seconds (for `getDownloadUrl`).
   *  Defaults to `3600` (1h). Per-call override via the `expiresIn` arg.
   *  Ignored for unsigned (public) stores, which return static URLs. */
  presignExpiresIn?: number
}

export function S3Store(opts: S3StoreOptions): Store {
  const region = opts.region ?? 'us-east-1'
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis)

  const signer = opts.accessKeyId && opts.secretAccessKey
    ? new AwsClient({
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        ...(opts.sessionToken ? { sessionToken: opts.sessionToken } : {}),
        service: 's3',
        region,
      })
    : undefined

  // aws4fetch's `.fetch` signs then dispatches. We pass through the
  // user-supplied fetch only when unsigned — aws4fetch always uses
  // global fetch internally, which is fine for both browser and CFW.
  const request = signer
    ? (url: string, init?: RequestInit) => signer.fetch(url, init)
    : (url: string, init?: RequestInit) => f(url, init)

  const core = xmlObjectStore({
    bucket: opts.bucket,
    region,
    ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    request,
    ...(opts.prefixes ? { allowedPrefixes: opts.prefixes } : {}),
  })

  return {
    list: core.list,
    get: core.get,
    capabilities: { range: true },

    // Static URL works for unsigned (public) buckets only — signed
    // buckets need SigV4 presigning, surfaced via `getDownloadUrl` below.
    ...(signer ? {} : { getUrl: (p: string) => core.buildUrl(p) }),

    // SigV4 presigned download URL, for signed buckets. Browser-side use
    // case: a user pastes their own access keys at `/s3` or `/r2` to
    // browse a private bucket — `<FileTree>` calls this when the user
    // clicks the download icon, getting a short-lived URL the browser
    // GETs directly. Mirrors `R2Store`'s presign path.
    ...(opts.accessKeyId && opts.secretAccessKey
      ? {
          async getDownloadUrl(path: string, dlOpts?: { expiresIn?: number }): Promise<string> {
            core.checkPrefix(path, 'getDownloadUrl path')
            const basename = path.split('/').pop() || path
            const search = new URLSearchParams({
              'X-Amz-Expires': String(dlOpts?.expiresIn ?? opts.presignExpiresIn ?? 3600),
              'response-content-disposition': `attachment; filename="${basename.replace(/"/g, '\\"')}"`,
            })
            const signer = new AwsV4Signer({
              method: 'GET',
              url: core.buildUrl(path, search.toString()),
              accessKeyId: opts.accessKeyId!,
              secretAccessKey: opts.secretAccessKey!,
              ...(opts.sessionToken ? { sessionToken: opts.sessionToken } : {}),
              service: 's3',
              region,
              signQuery: true,
            })
            const signed = await signer.sign()
            return signed.url.toString()
          },
        }
      : {}),
  }
}
