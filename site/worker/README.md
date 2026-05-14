# `site/worker/` — `file-tree-demo` Cloudflare Worker

Backs `/http` on the demo site. Wraps `MultiStore({ demo, ctbk, crashes })`
over R2 bindings and exposes the file-tree HTTP protocol at `/v1/files/*`.

## Run locally

```bash
pnpm install
pnpm dev          # wrangler dev on :8732
```

Per-binding `remote = true` (see `wrangler.toml`) routes R2 ops through
the real buckets without deploying the worker.

## Deploy

```bash
pnpm deploy
```

## Optional: R2 presigned downloads

Without configuration, the `/v1/files/get` endpoint proxies object bytes
through the worker (capped ~128 MB / worker memory, CPU billed against
the worker). For large files, configure presigned URLs so the browser
GETs directly from R2:

### 1. Mint an R2 S3 API token

Cloudflare dashboard → R2 → **Manage R2 API Tokens** → Create API Token.

- Permissions: **Object Read** (sufficient for downloads). Object
  Read & Write if you want presign to cover uploads later.
- TTL: long-lived (rotate manually).
- Buckets: either "Apply to all buckets" or scope to `file-tree-demo`,
  `ctbk`, `nj-crashes` individually.

The token page shows:
- `Access Key ID` (`R2_ACCESS_KEY_ID`)
- `Secret Access Key` (`R2_SECRET_ACCESS_KEY`)
- `Endpoint` (`https://<account-id>.r2.cloudflarestorage.com`)

### 2. Push secrets to the worker

```bash
cd site/worker
wrangler secret put R2_S3_ENDPOINT          # paste endpoint URL
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
# Optional — defaults to 3600 (1h)
wrangler secret put R2_PRESIGN_EXPIRES      # e.g. "7200"
```

For local `wrangler dev` runs, set the same vars in a `.dev.vars` file
in `site/worker/` (gitignored). Secrets aren't surfaced via
`wrangler dev` from the deployed worker.

### 3. Enable on the site

In whatever environment serves `/http` (build env for prod, `.env.development`
locally), set:

```
VITE_HTTP_DEMO_PRESIGN=true
```

`HttpDemo.tsx` flips `HttpStore(...)` to `{ presign: true }` only when
this is set. Without it, downloads continue to flow through the worker
proxy.

### 4. Verify

After redeploying both worker + site:

- Open a file in `/http/demo/...` in DevTools → Network.
- Click the download icon. The request should go to
  `<account-id>.r2.cloudflarestorage.com/...` (not the worker).
- The presigned URL has `X-Amz-Signature`, `X-Amz-Expires`,
  `response-content-disposition=attachment; filename="..."` in the
  query string.

### CORS (not currently required)

`<a href download>` clicks are top-level navigations — no CORS preflight.
The presigned URL bakes `response-content-disposition=attachment` into
the signature, so R2 returns `Content-Disposition: attachment` and the
browser downloads even on a cross-origin response. **No bucket CORS
policy needed for downloads.**

CORS *would* be needed if you wanted JS code in the demo to `fetch()`
the presigned URLs directly (e.g. parquet range-reads going to R2 instead
of through the worker). That's not in scope for v1 — `ParquetViewer`,
`CsvViewer`, etc. still range-read via `/get`.

If/when that lands, add a CORS rule to each bucket via the R2 dashboard
(bucket → Settings → CORS Policy):

```json
[
  {
    "AllowedOrigins": ["https://<your-site-origin>"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Length", "Content-Range"],
    "MaxAgeSeconds": 86400
  }
]
```

### Notes on URL lifetime

- Default 1h (`R2_PRESIGN_EXPIRES=3600`). S3 validates the signature at
  request start, not throughout the response — a download initiated
  before expiry completes regardless of how long it takes.
- Bumps practical only for: (a) resumable downloads after a disconnect
  past the expiry, (b) holding the URL aside to share later. Max is 7
  days (`604800`) per AWS SigV4.
- The URL is generated on-demand per icon-click; it's not pre-rendered
  into the page, so lifetime doesn't affect view caching.
