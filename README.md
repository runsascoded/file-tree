# `@rdub/file-tree`

Storage-agnostic file/directory tree browser. Plug a `Store` (R2, HTTP-proxied, …) into a React component and get a directory listing + file viewer.

> **v0.0.1**: minimum viable scaffold. R2 + HTTP stores, dir listing, text viewer. Zip / Parquet / PDF, S3 / GitHub / GitLab / disk-tree stores, static-bucket variants — coming.

## Install

```bash
pnpm add @rdub/file-tree
```

## The `Store` interface

```ts
interface Store {
  list(prefix: string, opts?: { cursor?: string; limit?: number }): Promise<{ entries: Entry[]; cursor?: string }>
  get(path: string, range?: { offset: number; length: number }): Promise<{ bytes: Uint8Array; totalSize?: number; contentType?: string }>
  capabilities?: { range: boolean }
}
```

Every supported backend ships an implementation. UI stays the same.

## Quick start: R2 + CFW (server) + React (client)

**Worker** (`src/index.ts`):

```ts
import { R2Store } from '@rdub/file-tree/stores/r2'
import { createHandlers } from '@rdub/file-tree/server'

interface Env { R2: R2Bucket }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const handlers = createHandlers(R2Store(env.R2, { prefixes: ['raw/'] }), { basePath: '/v1/files' })
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

## Subpath exports

| Path | What |
|------|------|
| `@rdub/file-tree` | `Store` types, `NotFoundError` |
| `@rdub/file-tree/react` | `<FileTree>`, `<DirListing>`, `<TextViewer>`, `<Breadcrumb>`, `parsePath` |
| `@rdub/file-tree/stores/r2` | `R2Store(bucket, { prefixes? })` — CFW R2 binding |
| `@rdub/file-tree/stores/http` | `HttpStore(apiBase, { headers? })` — client → server proxy |
| `@rdub/file-tree/server` | `createHandlers(store, { basePath?, corsOrigin? })` — HTTP endpoints |

## Roadmap

| Backend | Server-side | Static-bucket |
|---------|-------------|---------------|
| R2 | ✅ v1 (CFW) | TBD |
| S3 | TBD (Lambda) | TBD |
| GitHub | TBD | TBD (`raw.githubusercontent.com` + REST tree) |
| GitLab | TBD | TBD |
| local FS | TBD (via [`disk-tree`][disk-tree]) | n/a |

Other roadmap items: zip-entry preview, parquet table, PDF embed, README sidecars, `?q=` filter URL persistence, dark-mode styling.

## Architectural notes

`Store.list` returns directory entries with `isDir: true` (via the store's native delimiter) so the UI doesn't have to infer dirs from `key.endsWith('/')`. Stores that don't have a native dir concept (GitHub, …) synthesize one by grouping by the next path segment.

`Store.get` returns raw bytes; the UI is responsible for decoding (text decoder, parquet reader, etc.). This keeps the interface narrow and makes it trivial to add new file kinds without touching every store.

The `prefixes` allow-list on `R2Store` is a security boundary: the same bucket may host both browseable data (`raw/`) and private internals (`cells/`, `_internal/`); the store rejects `list`/`get` for paths outside the allow-list.

[disk-tree]: https://github.com/runsascoded/disk-tree
