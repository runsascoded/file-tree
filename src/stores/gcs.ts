/** Google Cloud Storage `Store`. Uses GCS's **S3-interoperability XML
 *  API** at `https://storage.googleapis.com` — same wire shape as
 *  ListObjectsV2 + ranged GetObject, so we share `S3Store`'s XML +
 *  Range core (`_xmlObjectStore.ts`) and just switch auth.
 *
 * Three auth modes:
 * - **Unsigned (public bucket)** — omit all creds. `getUrl` returns a
 *   static `https://storage.googleapis.com/<bucket>/<key>` URL.
 * - **HMAC (SigV4)** — pass GCS HMAC interop `accessKeyId` +
 *   `secretAccessKey` (project-scoped, `Storage > Settings >
 *   Interoperability` in the console). Same SigV4 code path as
 *   `S3Store`; `getDownloadUrl` mints SigV4 query-signed URLs.
 * - **Bearer OAuth** — pass a `getToken()` returning a short-lived
 *   OAuth access token (from ADC in a server, workload-identity in
 *   GCE/Cloud Run, or a service-account-JWT → OAuth exchange). No
 *   Google SDK or JWT helper is bundled; token minting stays the
 *   consumer's concern. `getDownloadUrl` is omitted in bearer mode
 *   (bearer can't be embedded in a signed URL) — the proxy `get` path
 *   serves downloads.
 *
 * Usage:
 *   import { GcsStore } from '@rdub/file-tree/stores/gcs'
 *
 *   // Public bucket, browser-direct:
 *   const store = GcsStore({ bucket: 'my-public-bucket' })
 *
 *   // Private bucket via HMAC interop keys (server or browser):
 *   const store = GcsStore({
 *     bucket: 'my-private-bucket',
 *     accessKeyId: env.GCS_ACCESS_KEY_ID,     // GOOG1E...
 *     secretAccessKey: env.GCS_SECRET_ACCESS_KEY,
 *   })
 *
 *   // Private bucket via ADC/OAuth (server-side, e.g. Cloud Run):
 *   import { GoogleAuth } from 'google-auth-library'   // consumer's dep
 *   const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] })
 *   const store = GcsStore({
 *     bucket: 'my-private-bucket',
 *     getToken: async () => (await (await auth.getClient()).getAccessToken()).token!,
 *   })
 */
import { AwsClient, AwsV4Signer } from 'aws4fetch'
import type { Store } from '../types'
import { xmlObjectStore } from './_xmlObjectStore'

export interface GcsStoreOptions {
  /** Bucket name. Required. */
  bucket: string
  /** GCS HMAC interop access-key id (`GOOG1E...`). Omit for unsigned
   *  (public bucket) or bearer mode. */
  accessKeyId?: string
  /** GCS HMAC interop secret. Omit for unsigned or bearer mode. */
  secretAccessKey?: string
  /** OAuth bearer token provider. Called for every outbound request;
   *  return a valid `access_token`. When set, takes precedence over
   *  HMAC creds. Caller is responsible for caching/refreshing tokens
   *  (file-tree does not bundle a Google auth SDK). */
  getToken?: () => string | Promise<string>
  /** Allow-list of key prefixes (same semantics as `S3Store.prefixes`). */
  prefixes?: string[]
  /** Endpoint override. Default `https://storage.googleapis.com`. */
  endpoint?: string
  /** SigV4 credential-scope region for HMAC signing. Default `'auto'`.
   *  Not used for URL construction (GCS is single-endpoint), only for
   *  the SigV4 credential scope. */
  region?: string
  /** Custom `fetch` impl. Defaults to global. */
  fetch?: typeof globalThis.fetch
  /** Default presigned-URL lifetime in seconds. HMAC mode only. */
  presignExpiresIn?: number
}

const DEFAULT_ENDPOINT = 'https://storage.googleapis.com'
const DEFAULT_REGION = 'auto'

export function GcsStore(opts: GcsStoreOptions): Store {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT
  const region = opts.region ?? DEFAULT_REGION
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis)

  // Auth precedence: bearer > HMAC > unsigned.
  const bearer = opts.getToken
  const hmacSigner = !bearer && opts.accessKeyId && opts.secretAccessKey
    ? new AwsClient({
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        service: 's3',   // GCS's S3-compat API accepts SigV4 with `service: s3`
        region,
      })
    : undefined

  const request = bearer
    ? async (url: string, init?: RequestInit) => {
        const token = await bearer()
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        return f(url, { ...init, headers })
      }
    : hmacSigner
      ? (url: string, init?: RequestInit) => hmacSigner.fetch(url, init)
      : (url: string, init?: RequestInit) => f(url, init)

  const core = xmlObjectStore({
    bucket: opts.bucket,
    region,
    endpoint,
    request,
    ...(opts.prefixes ? { allowedPrefixes: opts.prefixes } : {}),
  })

  return {
    list: core.list,
    get: core.get,
    capabilities: { range: true },

    // Unsigned/public: browser can hit the URL directly. Bearer & HMAC
    // both need per-request auth (bearer can't go in a URL safely;
    // HMAC uses presign via `getDownloadUrl`).
    ...(bearer || hmacSigner ? {} : { getUrl: (p: string) => core.buildUrl(p) }),

    // SigV4 presigned download URL — HMAC mode only. GCS honors
    // V4 query signing when the credential scope matches the HMAC key.
    // Bearer mode intentionally omits this: bearer tokens can't be
    // embedded in a signed URL, so the proxy `get` path serves
    // downloads instead.
    ...(hmacSigner
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
