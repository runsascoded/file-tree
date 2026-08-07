# Spec: a first-class `gcs` store (Google Cloud Storage)

> **Status:** implemented (2026-08-06). All three phases landed together — shared XML core extracted from `S3Store` (option (a)), `GcsStore` layered on top with unsigned / HMAC / bearer auth. **Phase 0 open item:** HMAC/SigV4 live probe against real GCS with real HMAC keys still pending (bearer was already verified live during spec authoring). Motivated by `marin-gcs-usage` (private, Ryan/OA), which drops dated per-object listing parquet into a GCS bucket and wants file-tree to browse the shards (parquet preview) — see that repo's `specs/scan-browser.md`. Written from an internals survey + a live probe against a real GCS bucket (below).

## Implementation notes (2026-08-06)

- **Option (a) shipped**: `src/stores/_xmlObjectStore.ts` factored out of `s3.ts`, parameterized by `{ bucket, region, endpoint?, request, allowedPrefixes? }`. Contains the XML scanners, `buildUrl` (path-style ↔ virtual-hosted-style), `list`, and ranged `get`. `S3Store` and `GcsStore` are both thin configs over it (~130 lines each including doc comments).
- **Auth precedence in `GcsStore`**: `getToken` (bearer) > `accessKeyId`+`secretAccessKey` (HMAC/SigV4) > unsigned. `getUrl` exposed only in unsigned mode; `getDownloadUrl` exposed only in HMAC mode (SigV4 presign).
- **Tests**: `test/gcs-store.test.ts` runs conformance 3× (unsigned + bearer + HMAC/live-signed against a stubbed global fetch) — 42 test cases total. Fake-fetch pattern mirrors `test/s3-store.test.ts` and additionally handles the aws4fetch-passes-a-`Request`-not-a-URL wrinkle.
- **Not extracted**: SigV4 presign (`getDownloadUrl`) is ~20 lines and stayed duplicated in each store. Worth folding into `_xmlObjectStore` in a follow-up if a third HMAC-signed store ever lands.
- **Consumers**: `~/c/hccs/{crashes,ctbk}` typecheck / test green against the refactored `S3Store`. Full 122/122 vitest suite passes.

## Problem

file-tree has `r2`, `s3`, `http`, `mock`, `multi` stores but no Google Cloud Storage. GCS-resident data (the immediate consumer's ~588M-object daily listings, but also any GCS estate) can't be browsed without a hand-rolled adapter.

**Key finding — the gap is smaller than it looks.** GCS exposes an **S3-compatible XML API** at `https://storage.googleapis.com`, and `S3Store`'s `endpoint` option already switches to path-style `<endpoint>/<bucket>/<key>` (`src/stores/s3.ts:77-85`). A live probe against a real bucket confirms full shape-compatibility with `S3Store`'s ListObjectsV2 parser and range machinery:

```
GET /<bucket>?list-type=2&delimiter=/&prefix=listing/&max-keys=5
→ <ListBucketResult xmlns='http://doc.s3.amazonaws.com/2006-03-01'>
    <NextContinuationToken>…</NextContinuationToken><IsTruncated>true</IsTruncated>
    <CommonPrefixes><Prefix>listing/2026-07-30/</Prefix></CommonPrefixes> … </ListBucketResult>
GET /<bucket>/<key>  Range: bytes=0-99
→ 206  content-range: bytes 0-99/4408479  accept-ranges: bytes
```

So `S3Store({ endpoint: 'https://storage.googleapis.com', bucket, region: 'auto', accessKeyId, secretAccessKey })` **already works against GCS today** (with GCS HMAC interop keys). This spec therefore is **not** "write a GCS client from scratch" — it is:

1. **DX + discoverability** — a `@rdub/file-tree/stores/gcs` subpath with a `GcsStore(opts)` whose option names and defaults are GCS-native (no one should have to know GCS speaks S3).
2. **A home for GCS quirks** — endpoint/region defaults, the `x-goog-*` headers, `list-type=2` parity notes, all in one tested place.
3. **A native auth mode that doesn't require HMAC keys** — OAuth2 **bearer** tokens (service-account / ADC / workload identity), verified below to work against the same XML API. HMAC "interoperability" keys are a per-project opt-in credential many GCS estates would rather not provision; bearer uses the identity the caller already has.

The probe used bearer auth (`Authorization: Bearer <ADC token>`) and returned the identical XML + `206`/`Content-Range` shown above — so **both auth modes are validated against the real API**, only HMAC/SigV4-specifics remain to confirm (see Open questions / Phase 0).

## Design

`GcsStore` is `S3Store`'s XML-list + range-get + presign core with a GCS endpoint and a **pluggable auth strategy** (SigV4-HMAC | Bearer | unsigned). It satisfies the same `Store` contract (`src/types.ts:51-97`) and passes the same conformance suite (`src/test/conformance.ts:64-149`).

### Phase 0 — validate against real GCS (throwaway, before any code)

A 30-line script (curl or a vitest against a real bucket, gated on creds) confirming, for **both** auth modes:
- `list-type=2` + `delimiter` + `continuation-token` paginate and emit `CommonPrefixes`/`Contents`/`NextContinuationToken` (bearer: **confirmed**; HMAC: **TODO**).
- `<Contents>` include `<LastModified>` and `<Size>` (conformance case 4 needs `lastModified` matching `^\d{4}-\d{2}-\d{2}T`). GCS XML ListObjects does emit these per-object — confirm.
- Range `get` → `206` + `Content-Range` (**confirmed** bearer).
- **HMAC/SigV4 region scope**: does GCS accept `region: 'auto'` in the SigV4 credential scope, or does it require a real location? This is the one unknown that gates the HMAC path (see Open questions).

### Phase 1 — `GcsStore`, HMAC (SigV4) auth — reuse the proven core

`GcsStore` presets GCS defaults and delegates to the existing SigV4 request+parse path (`src/stores/s3.ts:142-238`). Zero new signing code.

```ts
// src/stores/gcs.ts
export interface GcsStoreOptions {
  bucket: string
  // --- HMAC (S3-interop) auth ---
  accessKeyId?: string          // GCS HMAC key id;   omit → unsigned/public
  secretAccessKey?: string      // GCS HMAC secret
  // --- shared ---
  prefixes?: string[]           // allow-list; list('') synthesizes a virtual root
  endpoint?: string             // default 'https://storage.googleapis.com'
  region?: string               // default 'auto' (see Open questions)
  fetch?: typeof globalThis.fetch
  presignExpiresIn?: number     // default 3600
}
```

Implementation options, in order of preference:
- **(a) Extract a shared internal.** Factor `S3Store`'s XML scanners (`s3.ts:87-134`), `buildUrl` (`s3.ts:77-85`), `list` (`s3.ts:167-210`), and ranged `get` (`s3.ts:212-238`) into `src/stores/_xmlObjectStore.ts` parameterized by `{ endpoint, region, sign(request) }`. `S3Store` and `GcsStore` become thin configs over it. Cleanest; also sets up Phase 2 and the anticipated bearer-auth `GitHubStore` (`specs/handoff.md:190`).
- **(b) Compose.** `GcsStore` internally constructs an `S3Store` configured for GCS and re-exports its methods. Near-zero code, but forks at Phase 2 (S3Store has no bearer hook).

Prefer **(a)**. Must (all three modes): throw `NotFoundError` **by name** from `../types` on 404 (`src/server/index.ts:137-140` matches on `e.name`), return accurate `totalSize` from ranged `get` (parquet depends on it — `src/react/asyncBuffer.ts:37-42`), set `capabilities:{ range:true }`, and expose `getUrl` (unsigned only) / `getDownloadUrl` (SigV4 presign, `s3.ts:251-274`; GCS honors V4 query signing with HMAC keys).

### Phase 2 — native OAuth **bearer** auth (no HMAC keys)

Add a bearer strategy to the shared core: instead of SigV4-signing the request, attach `Authorization: Bearer <token>`. The token comes from a caller-supplied provider so file-tree stays free of any Google SDK / JWT code:

```ts
export interface GcsStoreOptions {
  // …Phase 1 fields…
  getToken?: () => string | Promise<string>   // e.g. ADC access token, or an SA-JWT→OAuth token
}
```

- If `getToken` is set → bearer mode (skip SigV4). Verified: the XML list + ranged get accept `Authorization: Bearer` identically.
- Token minting stays the **consumer's** responsibility (ADC in a server, workload-identity in GCE/Cloud Run, or an SA-JWT→OAuth exchange in a Worker). file-tree ships no `google-auth`/JWT helper — matching the tree's "no SDK" ethos (`aws4fetch` is the only bundled dep). Optionally document a ~40-line CFW `getToken` recipe (RS256 SA-JWT via `crypto.subtle` → token cache) in the spec appendix, not in the bundle.
- `getDownloadUrl` in bearer mode: GCS bearer can't presign a query-only URL, so `getDownloadUrl` is **omitted** in bearer mode (the proxy `get` path serves downloads; `getUrl` returns the proxy URL). Presign remains available in HMAC mode.

### Conformance & tests

Copy the `s3` test pattern exactly (`test/s3-store.test.ts:90-99`): a **fake `fetch` over a `MockStore(CONFORMANCE_FIXTURE)`** that speaks GCS's `list-type=2` XML + ranged GetObject, then `runStoreConformance(() => GcsStore({ bucket:'x', fetch: fakeGcsFetch(backing) }))`. Cover both auth modes (assert the SigV4 `Authorization` header shape in HMAC mode; assert `Authorization: Bearer` in bearer mode). All 9 cases (`conformance.ts:64-149`), range + pagination included.

## Migration / registration

Mechanical, mirrors every other store (reversible):
1. `src/stores/gcs.ts` (+ `src/stores/_xmlObjectStore.ts` if taking option (a)).
2. `tsup.config.ts:4-22` — add `'src/stores/gcs.ts'` to `entry`.
3. `package.json` `exports` — add `"./stores/gcs"` block mirroring `"./stores/s3"` (`package.json:45-49`).
4. `src/stores/index.ts:11-12` — `export { GcsStore }` + `export type { GcsStoreOptions }`.
5. `test/gcs-store.test.ts` — conformance via fake-fetch.
6. `specs/handoff.md` — move GCS from "not built" to shipped; note the `_xmlObjectStore` extraction if done.

No `package.json` dep change: bearer adds none; HMAC reuses the already-bundled `aws4fetch`.

## Out of scope (this spec)

- A GCS **JSON** API path (`storage.googleapis.com/storage/v1/…`) — the XML API is S3-shaped and already parsed; no reason to add a second parser.
- Any bundled Google auth/JWT/ADC helper — `getToken` is a consumer hook (a recipe may live in an appendix, not the bundle).
- Native GCS CORS guidance for **direct-to-browser** GcsStore use — the first consumer proxies through a Worker (server-side store, browser hits `HttpStore`), so GCS CORS never enters the picture. Direct-browser use (with GCS bucket CORS exposing `Content-Range`) can be a later note.
- Write/delete — `Store` is read + optional presign only.

## Open questions

1. **SigV4 region scope on GCS.** Does GCS accept `region:'auto'` (or an arbitrary string) in the SigV4 credential scope, or must it be a real GCS location? aws4fetch signs with whatever region is given; GCS validates the signature's scope. If GCS is strict, `GcsStore` must derive/require a real region. **Phase 0 resolves this** (needs HMAC keys, which the probe lacked). The bearer path sidesteps it entirely.
2. **Does GCS emit `<LastModified>`/`<Size>` in `<Contents>` under `list-type=2`?** Expected yes; Phase 0 confirms (conformance case 4 requires `lastModified`).
3. **Presign parity** — confirm a GCS SigV4 query-signed URL with `response-content-disposition` downloads with the right filename (HMAC mode only).

## References

- `src/types.ts:51-97` (`Store`), `:8-16` (`Entry`), `:30-43` (`Range`/`GetResult`), `:124-129` (`NotFoundError`, matched by name).
- `src/stores/s3.ts:46-71` (`S3StoreOptions`), `:77-85` (`buildUrl` endpoint/path-style — the GCS enabler), `:87-134` (XML scanners), `:142-158` (auth/`request`), `:167-210` (`list`), `:212-238` (ranged `get`), `:251-274` (SigV4 presign).
- `src/server/index.ts:31` (`createHandlers`), `:33-44` (CORS **exposes `Content-Range`** — required for the proxy path), `:82-122` (`GET`/`HEAD /get`), `:137-140` (`NotFoundError` by name).
- `src/stores/http.ts:24` (`HttpStore` — the browser side of the proxy deployment).
- `src/stores/multi.ts:26` (`GcsStore` drops into a `MultiStore` unchanged).
- `src/react/asyncBuffer.ts:20-57` + `src/renderers/parquet.tsx` (parquet needs `range` + accurate `totalSize`).
- `src/test/conformance.ts:60` (`runStoreConformance`), `:64-149` (9 cases); `test/s3-store.test.ts:90-99,118-131` (fake-fetch-over-MockStore + path-style-endpoint proof — the pattern to copy).
- Registration: `tsup.config.ts:4-22`, `package.json:45-49` (exports), `src/stores/index.ts:11-12`.
- Template: `examples/s3-proxy-worker/src/index.ts` (secrets-driven store + `createHandlers`).
- GCS S3-interoperability: <https://cloud.google.com/storage/docs/interoperability>, <https://cloud.google.com/storage/docs/xml-api/overview>.
