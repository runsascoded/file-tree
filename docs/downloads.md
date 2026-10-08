# Downloads

Every non-directory view renders a download icon when the store can produce a URL for the file. There are three strategies, picked by which options you pass to the store. Pick **one** per bucket — they're alternatives, not stacking layers.

| Strategy | Setup | Bytes flow | Use when |
|---|---|---|---|
| **A. Public URL (sync `getUrl`)** | Make bucket public + provide `publicBaseUrl` (R2) or just construct unsigned (S3) | Browser ↔ bucket direct | Data is already public; cheapest, no tokens, no expiry. |
| **B. Presigned URL (async `getDownloadUrl`)** | Mint S3-compat token, configure `presign: { ... }` on store | Browser ↔ bucket direct (signed, short-lived) | Private bucket; need revocability or expiring URLs. |
| **C. Worker proxy (default fallback)** | None — just use `createHandlers` + `HttpStore` | Browser ↔ worker ↔ bucket | Small files; private bucket; don't want to manage signing. Capped by worker memory (~128 MB) and billed CPU. |

The lib's `<FileTree>` chooses automatically: prefers async `getDownloadUrl` if present, else sync `getUrl`, else hides the icon (or in HttpStore's case, points at `/get` which proxies). You configure which is wired by what you pass to the store constructor.

### A. Public bucket — sync URL

**R2** (public access toggled in dashboard):

```ts
R2Store(bucket, {
  publicBaseUrl: 'https://pub-<hash>.r2.dev',   // dev/casual (rate-limited per CF)
  // — or —
  publicBaseUrl: 'https://data.example.com',    // production, custom domain
})
```

**S3** (public bucket policy at the AWS console; no lib-side config):

```ts
S3Store({ bucket: 'open-data', region: 'us-west-2' })
// Static URL: https://open-data.s3.us-west-2.amazonaws.com/<key>
```

> **Caveat on public-URL downloads:** Cross-origin `<a download>` clicks only force-download when the response carries `Content-Disposition: attachment`. R2/S3 send that header iff each object's metadata sets it at upload time. Otherwise the browser navigates to the file (fine for text/image/video; may show raw garbage for binary like parquet). If you need guaranteed force-download on a public bucket, either upload with `httpMetadata.contentDisposition: 'attachment'` set or use **B. Presigned**.

### B. Presigned URL — credentialed bucket

**R2** (S3-compat token in worker secrets):

```ts
R2Store(bucket, {
  presign: {
    endpoint:        env.R2_S3_ENDPOINT,       // https://<acct>.r2.cloudflarestorage.com
    bucket:          'my-bucket-name',
    accessKeyId:     env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresIn:       3600,                     // default; signature expiry in seconds (max 604800)
  },
})
```

Mint the token at CF dashboard → R2 → Manage R2 API Tokens. **Permission: `Object Read`**, **scope: only the buckets you're exposing**. Server adds `/presign` endpoint automatically once `getDownloadUrl` is present.

`HttpStore` clients opt into using `/presign` with `{ presign: true }` (opt-in to avoid stalling the icon against a 404 endpoint):

```ts
HttpStore('https://api.example.com/v1/files', { presign: true })
```

**S3** (credentialed, server-proxy or browser-direct):

```ts
S3Store({
  bucket:          'private-data',
  region:          'us-east-1',
  accessKeyId:     env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  presignExpiresIn: 3600,
})
// In-browser use: a visitor pastes their own creds at `/s3`/`/r2` in the
// site — `S3Store.getDownloadUrl` signs in-browser with those creds.
```

### C. Worker proxy — no extra config

If you don't set `publicBaseUrl` or `presign`, downloads route through the worker's `/get?path=...` endpoint. `createHandlers` already sends `Content-Disposition: attachment; filename=...`, so downloads name correctly. Trade-off: every byte hits worker memory, capped at ~128 MB.

### Decision tree

```
Is your data intended to be public?
├── Yes
│   ├── R2 → publicBaseUrl: '<r2.dev or custom domain>'   (A)
│   └── S3 → no config; S3Store({ bucket }) just works    (A)
└── No (private)
    ├── Need expiring/revocable URLs?
    │   ├── Yes → presign: { ... }                         (B)
    │   └── No  → just use the worker proxy                (C)
    └── Visitor browses their own bucket?
        └── They paste creds into `/s3` or `/r2`; lib signs in-browser  (B)
```
