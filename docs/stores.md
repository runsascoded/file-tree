# Stores

A `Store` is the only thing the UI and server know about storage: two required methods, a few optional capabilities.

Live: [MockStore](https://file-tree.rbw.sh/mock), [HttpStore](https://file-tree.rbw.sh/http), and [S3](https://file-tree.rbw.sh/s3) / [R2](https://file-tree.rbw.sh/r2) / [GCS](https://file-tree.rbw.sh/gcs) browsed straight from the browser.

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

**`describe()`** is optional and display-only: what the store is fronting, for the breadcrumb root. Without it the root crumb reads `root`, which hides the one thing a reader can't infer from the page — *which* bucket they're looking at.

```ts
S3Store({ bucket: 'my-data', prefixes: ['raw/'] })   // → "s3://my-data/raw/"
R2Store(env.BUCKET, { bucketName: 'my-data' })       // bindings carry no name, so it's supplied
HttpStore('/api/files', { describe: 'r2://my-data/gbfs/' })
```

`HttpStore` takes it as an option rather than learning it from the server: a browser client genuinely can't discover what's behind an API base, and a *label* that arrives a render late shows `root` and then jumps. Stores that would rather not disclose a backing location just omit it.

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
