# Quick start

Serve a bucket from a Cloudflare Worker and browse it from React.

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
