# Spec: presigned download URLs (skip the worker on object reads)

> Status: **done** (2026-05-13). All three phases landed in one pass; spec
> is preserved here as the design rationale, with notes inline calling
> out any divergences from the original v1 draft.
>
> Follow-up to the `Content-Disposition` fix on `/get` (commit `32285f3`):
> that fix makes downloads name correctly, but the bytes still proxy
> through the worker. This spec moves the data path off the worker
> entirely.

## Problem

Current `/get` route in `src/server/index.ts:52` reads the object via
`store.get(path)` and proxies the bytes back to the browser. For R2
bindings inside a CFW that means:

- every byte hits worker memory (capped ~128MB) before reaching the client
- CPU/wall-time billed against the worker
- big objects either fail (OOM) or stream slowly (worker stream → response)

R2 (and S3) support **presigned URLs** — short-lived signed URLs that
let the browser GET directly from `<account>.r2.cloudflarestorage.com`.
The worker mints the URL; the data path is the browser ↔ cloud
storage, with no worker in the middle.

The `Store` interface already has `getUrl?(path)` for this purpose,
but:

1. It's synchronous (returns `string`) — presigning is async (needs to
   call out to compute a signature).
2. R2 binding has no presign hook. R2 presigning requires the S3-compat
   API + access-key signing (e.g. via `aws4fetch`).
3. `HttpStore.getUrl` returns the proxying `/get?path=...` URL, so the
   default behavior is what we have today.

## Design

### Phase 1 — async `getDownloadUrl`

Add a new optional `Store` method:

```ts
interface Store {
  // … existing fields …

  /** Like `getUrl(path)` but async — for stores that mint URLs
   *  on demand (presigning, redirects). The returned URL points
   *  directly at the underlying storage, bypassing any proxy.
   *  Implementations should set a `response-content-disposition`
   *  query param (or equivalent) so the saved file is named after
   *  the object basename, regardless of origin. */
  getDownloadUrl?(path: string): Promise<string>
}
```

`FileTree.tsx` precedence:
1. `getDownloadUrl` (async) — preferred when present.
2. `getUrl` (sync) — fallback for stores that have a static URL.
3. No anchor — render nothing (current `null` behavior).

UI: replace the sync `downloadHref = store.getUrl(parsed.path)` with a
`useEffect`-loaded state. Show the icon as soon as we know one of the
above resolves; render with no `href` (or a spinner) until then.

### Phase 2 — server endpoint `/presign`

`createHandlers()` grows a new optional endpoint:

```
GET /presign?path=<p>&expires=<seconds>  → { url: "https://..." }
```

Only mounted when the underlying store implements `getDownloadUrl`.
`HttpStore` adds a matching client-side `getDownloadUrl(path)` that
calls `/presign` and returns `result.url`.

Phase 2 also wires R2 presigning:

- Add a new store option (or a sibling factory) that takes R2 S3-compat
  credentials (`accessKeyId`, `secretAccessKey`, `endpoint`) and an
  expires-in default. Internally uses `aws4fetch` (already a candidate
  dep — used by `S3Store`'s signer path).
- `getDownloadUrl(path)` SigV4-presigns a `GET https://<endpoint>/<bucket>/<path>`
  with `response-content-disposition=attachment; filename="<basename>"`
  in the query string.

### Phase 3 — `R2Store` integration

Default `R2Store` (binding-only) stays unchanged — no creds, no
presign. Add a thin wrapper:

```ts
R2Store(bucket, {
  prefixes: ['gbfs/'],
  presign: {
    endpoint: env.R2_S3_ENDPOINT,  // https://<account>.r2.cloudflarestorage.com
    bucket:   env.R2_BUCKET_NAME,
    accessKeyId:     env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresIn:       3600,  // default
  },
})
```

When `presign` is provided, `R2Store` gains `getDownloadUrl`. Without
it, the store still works — downloads simply proxy through `/get` as
they do today.

## Migration

Each phase is reversible until its successor ships.

1. **Land async `getDownloadUrl` in `Store`** (interface + `FileTree.tsx`).
   No store implements it yet — UI behavior unchanged (`getUrl` still
   wins). Lib-only commit; no consumer changes required.
2. **Add `/presign` endpoint + `HttpStore.getDownloadUrl`.** Still
   no-op until a real store implements `getDownloadUrl` server-side.
3. **Wire R2 presign**: new R2 creds option in `R2Store`. Consumers
   opt in by passing creds.
4. **Consumer cut-over** (ctbk + any other downstream): plumb R2
   creds into the worker, pass `presign: { ... }` to `R2Store`. Verify
   anchor `href` points at `<account>.r2.cloudflarestorage.com` and
   the proxy `/get` is no longer hit for downloads.

## Out of scope (this spec)

- **Streaming reads** through `/get` — the in-memory buffering issue
  applies to range reads from `parquetRead` and friends too, but that
  path is read-modify-respond at small (64KB–1MB) chunks where the
  proxy is fine. Direct-streaming there is a separate concern (and
  may want to keep the worker in the path for auth/CORS reasons).
- **Public buckets / custom domains** — alternative to presigning;
  simpler but irrevocable and requires the bucket to be world-readable.
  Worth exposing as `R2Store({ publicBaseUrl: 'https://files.example.com' })`
  → trivial sync `getUrl`. Add later if a consumer wants it; doesn't
  conflict with this spec.
- **S3Store presign** — `S3Store` already has a signer hook
  (`src/stores/s3.ts:243`) but currently omits `getUrl` when signing
  is required. Same async-`getDownloadUrl` shape applies; defer to a
  follow-up since R2 is the immediate need.

## Open questions

- **Worker-side caching of presigned URLs**: presigning is cheap
  (~µs of SigV4), so probably not worth a cache. If it matters,
  a short LRU keyed by `(path, expires-bucket)` is sf.
- **Default expiry**: 1h matches typical signed-URL usage. Configurable
  per-call via a query param on `/presign`. UI doesn't need to expose
  this — the anchor is generated on-demand from the current view.
- **CORS** on the R2 S3 endpoint: CF R2 buckets need a CORS policy to
  serve cross-origin GETs. Document this in the README under "Setup
  for presigned downloads."

## Divergences from the v1 draft

- `getDownloadUrl` signature is `(path, opts?: { expiresIn?: number }) => Promise<string>` —
  the spec proposed taking only `path`, but `/presign` accepts `expires`,
  so the Store method forwards that through. UI still calls with no opts;
  callers that want a non-default lifetime can override per-call.
- `HttpStore.getDownloadUrl` is **opt-in** via `HttpStore(base, { presign: true })`.
  Without the flag, the method is omitted entirely. Rationale: the server
  only mounts `/presign` when its underlying store implements
  `getDownloadUrl`, so unconditionally probing the endpoint would cause
  the UI's download icon to render disabled (stuck on null async URL)
  against any backend that doesn't presign. Opt-in keeps the precedence
  rule (async → sync fallback) honest.
- `R2Store` presign uses `AwsV4Signer` directly (not `AwsClient.sign()`)
  for explicit `signQuery: true`. URL params on the unsigned URL
  (`X-Amz-Expires`, `response-content-disposition`) are part of the
  canonical query string, so they get baked into the signature.
- Tests: `test/http-store.test.ts` (new, 7 tests), `test/r2-store.test.ts`
  (+5 presign tests), `test/multi-store.test.ts` (+1 delegation test).

## References

- `src/types.ts:67-68` — existing sync `getUrl?(path)` hook
- `src/react/FileTree.tsx:104` — current consumer
- `src/server/index.ts:52` — `/get` proxy (data-path bottleneck)
- `src/stores/s3.ts:239-243` — prior art: skip `getUrl` when signer is set
- Cloudflare R2 docs: "Presigned URLs" — uses S3 API + aws4fetch
- `aws4fetch` — SigV4 in workers; already candidate dep
