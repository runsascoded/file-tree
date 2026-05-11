# `s3-proxy-worker` — example

Copy-pasteable Cloudflare Worker that wraps an S3 (or any S3-compatible)
bucket with `@rdub/file-tree`'s `S3Store` + `createHandlers`, exposing
the file-tree HTTP protocol at `/v1/files/*`. A browser `HttpStore` on
the consuming site then talks to it like any other file-tree backend.

## When to use this vs. direct browser-side `S3Store`

- **Direct (browser → S3)**: simpler, no infra. Works for public buckets
  unsigned, or with credentials you don't mind shipping to the browser
  (e.g. read-only keys via a paste-form). No CORS preflight for AWS
  signed requests unless you configure the bucket CORS.
- **This proxy**: keep credentials on the server. Single CORS origin
  (the worker). Easier to add per-prefix allow-lists, rate-limits,
  auth, etc. on the server side. Matches the existing R2-proxy pattern
  (`site/worker/` in this repo, or `ctbk`'s `/api/files/*` route).

## Setup

```bash
cp -r examples/s3-proxy-worker my-s3-proxy
cd my-s3-proxy
# Change `@rdub/file-tree` dep from `link:../..` to
# `github:runsascoded/file-tree#dist` (or `#<sha>` to pin), then:
pnpm install
```

(Inside this repo the dep is `link:../..` for local development. When
copied out, point at the published lib instead.)

Set the credentials (and any non-secret config you'd rather keep out of
`wrangler.toml`):

```bash
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY
wrangler secret put S3_BUCKET            # or set in wrangler.toml [vars]
wrangler secret put S3_REGION            # or set in wrangler.toml [vars]

# Optional:
wrangler secret put S3_ENDPOINT          # for R2/MinIO/LocalStack
wrangler secret put S3_PREFIXES          # comma-separated allow-list
```

`wrangler deploy`.

## R2 via S3-compatible API

Set `S3_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`,
`S3_REGION` to `auto`, and use R2 access keys (created in the
Cloudflare dashboard).

## On the consuming site

```tsx
import { HttpStore } from '@rdub/file-tree/stores/http'
import { FileTree } from '@rdub/file-tree/react'

const store = HttpStore('https://<worker>.workers.dev/v1/files')

<Route path="/files/*" element={<FileTree store={store} routeBase="/files" />} />
```

## Local development

```bash
pnpm dev          # wrangler dev on :8733
```

Hits production resources by default in wrangler v4 with secrets set.
Pass `--local` for local-only (mock R2/S3 sandbox; requires seeding).

## Why depend on `github:runsascoded/file-tree#dist`?

The `dist` branch is updated on every push to `main` and contains the
built output of the lib — usable directly via pnpm/npm without a
published npm package. Pin to a specific commit (`#<sha>`) for
reproducibility. Once `@rdub/file-tree` is published on npm, you'll be
able to use `^0.x` instead.
