# `@rdub/file-tree`

Storage-agnostic file/directory tree browser. Plug a `Store` (R2, S3, HTTP-proxied, in-memory, …) into a React component and get a directory listing + file viewer (markdown, parquet, CSV, JSON, notebooks, code, images, video, audio, zip).

> Live demo: see [`site/`](site/) (Vite app over MockStore + an HttpStore worker-proxy bound to R2). Active consumers: `ctbk.dev`, `nj-crashes.com`.

## Install

```bash
pnpm add @rdub/file-tree
```

## The `Store` interface

```ts
interface Store {
  list(prefix, opts?): Promise<{ entries: Entry[]; cursor?: string }>
  get(path, range?): Promise<{ bytes: Uint8Array; totalSize?: number; contentType?: string }>
  capabilities?: { range: boolean }
  getUrl?(path): string                                                   // sync, public/static URL
  getDownloadUrl?(path, opts?: { expiresIn? }): Promise<string>           // async, signed/dynamic URL
  getZipEntries?(path): Promise<ZipEntriesResult>                         // server-side zip
  getZipEntry?(path, entry, opts?): Promise<GetResult>                    //   shortcuts
}
```

`list` + `get` are required; the rest are optional capabilities the UI uses when present (download anchor, server-accelerated zip preview, etc.).

## Quick start — R2 + CFW + React

**Worker** (`worker/src/index.ts`):

```ts
import { R2Store } from '@rdub/file-tree/stores/r2'
import { createHandlers } from '@rdub/file-tree/server'

interface Env { R2: R2Bucket }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const store = R2Store(env.R2, {
      prefixes: ['raw/'],
      publicBaseUrl: 'https://data.example.com',   // see Downloads section
    })
    const handlers = createHandlers(store, { basePath: '/v1/files' })
    return (await handlers.handle(req)) ?? new Response('not found', { status: 404 })
  },
}
```

**React app**:

```tsx
import { FileTree } from '@rdub/file-tree/react'
import { HttpStore } from '@rdub/file-tree/stores/http'

const store = HttpStore('https://api.example.com/v1/files')

<Route path="/files/*" element={
  <FileTree store={store} routeBase="/files" rootPrefix="raw/" />
} />
```

## Downloads — choosing a URL strategy

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

## Store options reference

### `R2Store(bucket, opts)`

```ts
{
  prefixes?:      string[]            // allow-list; '['']' = whole bucket
  publicBaseUrl?: string              // strategy A
  presign?:      {                    // strategy B
    endpoint:        string
    bucket:          string
    accessKeyId:     string
    secretAccessKey: string
    expiresIn?:      number           // default 3600
    region?:         string           // default 'auto'
  }
}
```

### `S3Store(opts)`

```ts
{
  bucket:           string                          // required
  region?:          string                          // default 'us-east-1'; 'auto' for R2 via S3
  endpoint?:        string                          // R2/MinIO/LocalStack S3-compat endpoint
  accessKeyId?:     string                          // omit → unsigned (strategy A for public)
  secretAccessKey?: string                          //   ↳ both required → strategy B
  sessionToken?:    string                          // optional STS
  prefixes?:        string[]                        // allow-list
  presignExpiresIn?: number                         // default 3600
  fetch?:           typeof fetch
}
```

### `HttpStore(apiBase, opts)`

```ts
{
  headers?: Record<string, string>    // auth tokens, etc.
  fetch?:   typeof fetch
  presign?: boolean                   // opt into /presign endpoint (server must expose it)
}
```

### `MultiStore(children)`

```ts
MultiStore({ name: Store, ... })
// First path segment routes to a child; root list returns one dir per child.
// `getUrl` / `getDownloadUrl` are exposed only when *every* child has them.
```

### `MockStore(input, opts?)`

In-memory; for tests + demos. No URL strategy (use a real store for downloads).

## Server handlers

```ts
import { createHandlers } from '@rdub/file-tree/server'

const handlers = createHandlers(store, {
  basePath?:    string,   // default ''
  corsOrigin?:  string | null,   // default '*'; null to omit CORS
})
```

Endpoints (all GET):

| Path | Behavior |
|---|---|
| `<base>/list?prefix=&cursor=&limit=` | `ListResult` JSON |
| `<base>/get?path=` | Object bytes; `Range` honored; `Content-Disposition: attachment` set |
| `<base>/presign?path=&expires=` | `{ url }` JSON. **Only mounted when the underlying store implements `getDownloadUrl`.** |

## Viewer renderers (pluggable)

`<FileTree>` doesn't bundle viewer deps. Reference renderers ship as their own sub-paths — import the ones you want and install their optional peer dep alongside:

```tsx
import { FileTree } from '@rdub/file-tree/react'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'   // react-markdown + remark-gfm
import { ParquetViewer } from '@rdub/file-tree/renderers/parquet'     // hyparquet
import { CsvViewer } from '@rdub/file-tree/renderers/csv'             // (no peer)
import { NotebookViewer } from '@rdub/file-tree/renderers/notebook'   // pulls react-markdown via markdown
import { renderCode } from '@rdub/file-tree/renderers/code'           // highlight.js
import { renderJsonTree } from '@rdub/file-tree/renderers/json'       // search, expand-all, copy-path; jq filter via optional `jq-web`
import { renderViewerActions } from './viewerActions'                 // ↗ SQL link, etc.

<FileTree
  store={store}
  routeBase="/files"
  markdownRenderer={renderMarkdown}
  parquetRenderer={ParquetViewer}
  jsonRenderer={renderJsonTree}
  csvRenderer={CsvViewer}
  notebookRenderer={NotebookViewer}
  codeRenderer={renderCode}
  viewerActions={renderViewerActions}
/>
```

| Renderer | Sub-path | Optional peer |
|---|---|---|
| `ParquetViewer` | `@rdub/file-tree/renderers/parquet` | `hyparquet` |
| `renderMarkdown` | `@rdub/file-tree/renderers/markdown` | `react-markdown`, `remark-gfm` |
| `CsvViewer` | `@rdub/file-tree/renderers/csv` | — |
| `NotebookViewer` | `@rdub/file-tree/renderers/notebook` | `react-markdown` + `remark-gfm` (via `markdown`) |
| `renderCode` | `@rdub/file-tree/renderers/code` | `highlight.js` |
| `renderJsonTree` | `@rdub/file-tree/renderers/json` | `jq-web` (optional, for jq filter only) |

The peers are declared `optional` in `peerDependenciesMeta`, so installing only what you import is enough. Source lives at [`src/renderers/`](src/renderers/) — copy + tweak if you want different styling, paginate sizes, or language set.

`jq-web` is an Emscripten WASM module that expects to fetch `jq.wasm` from the same URL as its `jq.js`. In Vite/webpack apps that's usually a copy step — easiest path is to copy `node_modules/jq-web/jq.wasm` to your `public/` dir (or use a `copy-files`/`copy-webpack-plugin` equivalent). Without that, typing in the `jq` input surfaces a `WebAssembly.instantiate()` error; the search / expand-all / copy-path features still work.

Built-in kinds (no renderer needed): plain text (`<pre>`), image (`<img>`), video (`<video>`), audio (`<audio>`), zip (entry list + per-entry preview, with client-side `DecompressionStream` fallback if `Store.getZipEntries?` isn't provided).

## URL state — opt-in

By default `<FileTree>` keeps the dir-listing filter, parquet pagination, and the JSON viewer's search/jq inputs in `useState` (in-memory, no URL writes). Opt in to shareable URL state by passing the bundled hook:

```tsx
import { FileTree } from '@rdub/file-tree/react'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'

<FileTree
  store={store}
  routeBase="/files"
  usePersistedState={useUrlPersistedState}
/>
```

The shipped helper binds: `?q=…` (dir filter), `?page=N` (parquet), `?json-q=…` + `?jq=…` (JSON viewer). Defaults are omitted from the URL.

`@rdub/file-tree/url-state` is the only path in the lib that imports `use-prms` — consumers who don't import it tree-shake the dep out. Bring-your-own (nuqs, your own `URLSearchParams` hook, etc.) by passing a function matching the `PersistedState` signature:

```ts
type PersistedState = <T extends string | number>(
  key: string,
  defaultValue: T,
) => [T, (value: T) => void]
```

## ViewerActions slot

Per-file action buttons rendered next to the download icon. Signature:

```ts
(ctx: { store, path, kind, entry? }) => ReactNode
```

Use for "open in SQL REPL", "view raw", "share", etc. — consumer-app-specific. See `site/src/viewerActions.tsx` for a reference (parquet/CSV → `/sql?url=...`).

## Subpath exports

| Path | What |
|---|---|
| `@rdub/file-tree` | `Store` types, `NotFoundError`, `ZipEntry` types |
| `@rdub/file-tree/react` | `<FileTree>`, `<DirListing>`, `<TextViewer>`, `<Breadcrumb>`, `<MediaViewer>`, `<ZipEntryList>`, `<ZipEntryPreview>`, `parsePath`, `asyncBufferFromStore`, `AUDIO`/`CODE_LANG`/`MarkdownRenderer`/`ParquetRenderer`/`ViewerActionCtx` |
| `@rdub/file-tree/stores/r2` | `R2Store`, `R2StoreOptions`, `R2PresignOptions` |
| `@rdub/file-tree/stores/s3` | `S3Store`, `S3StoreOptions` (works for AWS S3, R2 via S3 API, MinIO) |
| `@rdub/file-tree/stores/http` | `HttpStore`, `HttpStoreOptions` |
| `@rdub/file-tree/stores/multi` | `MultiStore` |
| `@rdub/file-tree/stores/mock` | `MockStore` (in-memory) |
| `@rdub/file-tree/server` | `createHandlers` (HTTP endpoints over any Store) |
| `@rdub/file-tree/renderers/parquet` | `ParquetViewer` (peer: `hyparquet`) |
| `@rdub/file-tree/renderers/markdown` | `renderMarkdown` (peers: `react-markdown`, `remark-gfm`) |
| `@rdub/file-tree/renderers/csv` | `CsvViewer` (pure JS) |
| `@rdub/file-tree/renderers/notebook` | `NotebookViewer` (peers via `markdown`) |
| `@rdub/file-tree/renderers/code` | `renderCode` (peer: `highlight.js`) |
| `@rdub/file-tree/renderers/json` | `renderJsonTree` — search, jq filter (optional `jq-web` peer), expand/collapse-all, copy-jq-path on key click |
| `@rdub/file-tree/url-state` | `useUrlPersistedState` — opt-in URL-state hook (binds `?q=`, `?page=`, `?json-q=`, `?jq=` via `use-prms`) |
| `@rdub/file-tree/test/conformance` | `runStoreConformance(makeStore)` — vitest battery any new Store impl can opt into |

## Roadmap

| Backend | Server-side | Browser-direct |
|---|---|---|
| R2 | ✅ (CFW binding + S3 API) | ✅ (via S3Store + R2 S3-compat creds) |
| S3 | ✅ (any runtime) | ✅ (pasted creds) |
| GitHub | TBD | TBD (`raw.githubusercontent.com` + REST tree) |
| GitLab | TBD | TBD |
| local FS | TBD (via [`disk-tree`][disk-tree]) | n/a |

Other open items: `<StoreAuthForm>` for credential-paste UX, manifest-based static `Store`, cross-browser e2e (currently chromium only).

## Architectural notes

- `Store.list` returns directory entries with `isDir: true` (via the store's native delimiter) so the UI doesn't have to infer dirs from `key.endsWith('/')`.
- `Store.get` returns raw bytes; the UI decodes. New file kinds land via `parsePath`'s `Parsed` union + a `<…Renderer>` slot — no Store changes needed.
- The `prefixes` allow-list on `R2Store` / `S3Store` is a security boundary: same bucket may host browseable data (`raw/`) and private internals (`cells/`, `_internal/`); store rejects out-of-scope `list`/`get`.
- `NotFoundError` is detected via `e instanceof Error && e.name === 'NotFoundError'` (subpath bundles each carry their own copy, so `instanceof` cross-bundle is unreliable).
- The conformance harness (`@rdub/file-tree/test/conformance`) is the contract: new `Store` impls add a one-line vitest invocation and get coverage for free.

See [`specs/handoff.md`](specs/handoff.md) for full status + roadmap, and [`site/worker/README.md`](site/worker/README.md) for the demo worker setup runbook (R2 presign).

[disk-tree]: https://github.com/runsascoded/disk-tree
