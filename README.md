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

`renderJsonTree` also comes in a parameterized form, for annotating domain-specific scalars (epoch timestamps, byte counts, ids) without forking the viewer. Same `defaultNode` convention as `renderCell` below:

### YAML

`@rdub/file-tree/renderers/yaml` is the same tree with a YAML parse in front of it — so a `.yaml` file gets collapsible nodes, substring search, the depth controls, copy-path, **and jq**. There is no separate "yq" to build: jq runs on the parsed value, and by then YAML and JSON are the same value.

```tsx
{ id: 'yaml', match: ({ ext }) => ext === 'yaml' || ext === 'yml',
  load: () => import('@rdub/file-tree/renderers/yaml-viewer') }
```

The jq input is debounced 300ms (`jqDebounceMs`; `0` disables) — a filter is only valid at a few points while you type it. Expansion depth rides in the URL as `?depth=`, and the search box shares `?q=` with the directory listing's filter.

The `yaml` parser is an optional peer, dynamically imported on first use — register the viewer (rather than passing a prop) and neither it nor the parser reaches your main bundle. Same bargain as `jq-web`.

**Comments survive.** They're the reason to write YAML instead of JSON, and they are *not in the data model* — `yaml.parse()` drops them, so a tree of parsed values loses exactly what the author cared about. The renderer parses to a document instead, walks it once collecting jq-path → comment, and puts them back above their keys via the tree's `renderKey` hook. Block scalars keep their newlines, and merge keys are resolved: `<<: *defaults` yields the merged keys, which needs `merge: true` (they're a YAML 1.1 feature, and `yaml` defaults to 1.2 where `<<` is just a key whose value is an alias).

`renderKey` is a general hook, not a YAML one — `{ key, path, root, defaultNode }`, called for every object key. `renderValue` only fires for *scalars*, so anything you want to hang off a key whose value is a container (a comment, a schema description, a unit) needs this instead.

```tsx
import { makeJsonTreeRenderer } from '@rdub/file-tree/renderers/json'

const TS_KEYS = new Set(['start', 'end', 'requested_at'])

const renderJson = makeJsonTreeRenderer({
  initialOpenDepth: 2,
  renderValue: ({ key, value, defaultNode }) =>
    key !== undefined && TS_KEYS.has(key) && typeof value === 'number'
      ? <>{defaultNode} <span className="dim">{new Date(value * 1000).toISOString()}</span></>
      : defaultNode,
})

<FileTree store={store} routeBase="/files" jsonRenderer={renderJson} />
```

`renderValue` is called for every string / number / boolean / null, with `{ value, path, key?, defaultNode }` — `path` is the jq path (`.foo[0].bar`), `key` is the enclosing object key (unset for array elements). Containers aren't passed through it; they own the disclosure carets.

`initialOpenDepth` is how many container levels start expanded, default `1` (the root, nothing else). Depth counts containers, not keys — so a document of flat records, `[{…}, {…}]`, wants `2`; `Infinity` opens everything.

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

## Cell / crumb render hooks

`renderCell` and `renderCrumb` let a consumer take over any cell of the directory listing, or any breadcrumb segment. Both receive **the node the library would have rendered** as `defaultNode`, so decorating doesn't mean reimplementing the default (icon, `<Link>`, size formatting):

```ts
type CellRenderer = (ctx: {
  entry: Entry                                // { key, isDir, size?, lastModified? }
  column: 'name' | 'size' | 'modified'
  prefix: string                              // dir being listed
  href: string                                // route this row links to
  defaultNode: ReactNode
}) => ReactNode

type CrumbRenderer = (ctx: {
  crumb: { label: string; to: string; path?: string }   // `path` = store key
  index: number
  isLast: boolean
  defaultNode: ReactNode
}) => ReactNode
```

There's no "which cells does this apply to" config — the fn is called for every cell and answers that itself by returning `defaultNode`. E.g. annotating directories whose key encodes an ID with a human-readable name:

```tsx
const deviceName = (key: string) => DEVICES[/(?:^|\/)awair-(\d+)\/?$/.exec(key)?.[1] ?? '']

<FileTree
  store={store}
  routeBase="/files"
  renderCell={({ entry, column, defaultNode }) => {
    if (column !== 'name') return defaultNode
    const name = deviceName(entry.key)
    return name ? <>{defaultNode} <span className="dim">{name}</span></> : defaultNode
  }}
  renderCrumb={({ crumb, defaultNode }) => {
    const name = deviceName(crumb.path ?? '')
    return name ? <>{defaultNode} <span className="dim">{name}</span></> : defaultNode
  }}
/>
```

Ignoring `defaultNode` gives you a total override of that cell. For replacing the listing wholesale (a different table engine, sortable columns, virtualization), fork `src/react/DirListing.tsx` — it's ~230 lines with no private imports.

The parquet viewer takes the same hook, one table down. Either bind the options to a component up front:

```tsx
import { makeParquetViewer } from '@rdub/file-tree/renderers/parquet'

const ParquetViewer = makeParquetViewer({          // module scope, not inside render
  renderCell: ({ column, value, defaultNode }) =>
    column.name === 'station_id'
      ? <a href={`/stations/${value}`}>{defaultNode}</a>
      : defaultNode,
})
```

…or hand them to `<FileTree>` and skip the binding:

```tsx
<FileTree parquetRenderer={ParquetViewer} parquetOptions={{ renderCell }} />
```

The two differ in one way that matters: `makeParquetViewer` mints a **component type**, so it belongs at module scope — calling it inside render produces a new type every pass, which remounts the table and drops its row-group cache. `parquetOptions` is just props on a stable type, so it's the one to reach for when a hook has to close over something that changes: a format toggle (raw epochs vs. formatted, bytes vs. MB — CSS can restyle a cell but can't rewrite its text), or data that isn't in the file, like an id→name lookup you fetched separately. Presentation that CSS *can* own — colors, alignment, theme — should stay in CSS; see [Theming](#theming). Options baked in by the factory win over `parquetOptions`, so the two compose as long as they don't set the same key.

`renderCell` gets `{ value, column, row, rowIndex, path, defaultNode }` — `column` carries `{ name, physicalType, logicalType, timeUnit, convertedType }`, and `rowIndex` is absolute within the file, not within the page.

`path` is the file being viewed, so **one module-scope viewer covers a whole tree** of unrelated schemas — you dispatch inside the hook rather than minting a viewer per file:

```tsx
const ParquetViewer = makeParquetViewer({
  renderCell: ({ path, column, value, defaultNode }) =>
    path.startsWith('records/') && CURRENCY_COLS.has(column.name) && typeof value === 'number'
      ? usd.format(value)
      : defaultNode,
})
```

`renderHeader` receives `path` too, and `cellProps` / `headerProps` take it as a second argument (`(col, path) => …`).

Presentation stops at the cell's *contents*, so three more options cover the column itself:

```tsx
makeParquetViewer({
  // merged over the viewer's own <td> / <th> style — no wrapper element,
  // so the cell keeps its own ellipsis behaviour
  cellProps:   (col, path) => col.name === 'note' ? { style: { textAlign: 'center' } } : undefined,
  headerProps: (col, path) => col.name === 'note' ? { style: { textAlign: 'center' } } : undefined,
  // stats are the current row group's, straight from the footer — not
  // reconstructible from the decoded rows a consumer sees
  renderHeader: ({ column, stats, defaultNode }) =>
    <>{defaultNode}{stats?.nullCount ? <sup>∅</sup> : null}</>,
})
```

**Numeric columns right-align by default**, with `tabular-nums`, so digits line up down the column and magnitudes are comparable at a glance — headers follow their column. Columns read as temporal are excluded (they render as text, not quantities), as are `BOOLEAN` and the byte-array types. Turn it off with `alignNumeric: false`, or override per column with `cellProps`.

The default header also carries a `title` summarising the current row group's range (`row group: 0 … 70578`, or `= 626` for a constant column) whenever the writer recorded statistics — a cheap orientation cue in a file with millions of rows.

### The hooks aren't parquet's

`renderCell` / `renderHeader` / `cellProps` / `headerProps` are defined on `TableViewerOptions` in `@rdub/file-tree/renderers/table`, and every table-shaped viewer takes them. A currency column is a currency column however it was stored, so write the rule once:

```tsx
import type { TableCellCtx } from '@rdub/file-tree/renderers/table'

function renderMoney({ column, value, defaultNode }: TableCellCtx) {
  if (column.name !== 'value') return defaultNode
  const n = typeof value === 'number' ? value : Number(value)   // CSV has no types
  return Number.isFinite(n) ? usd.format(n) : defaultNode
}

const ParquetViewer = makeParquetViewer({ renderCell: renderMoney })
const CsvViewer     = makeCsvViewer({ renderCell: renderMoney })
```

Formats that know more extend the base: parquet's `ParquetColumn` adds the physical/logical type it read, and its `renderHeader` ctx carries row-group `stats`. `column.kind` is the coarse reading (`'number' | 'string' | 'temporal' | 'boolean' | 'binary'`) available everywhere — absent on CSV, which genuinely has no types, so guessing one is the consumer's call.

Two differences worth knowing: `rowIndex` is absolute in parquet but **page-relative in CSV** (its pages are byte ranges, so it never learns how many rows preceded them), and numeric alignment is inferred by parquet from its schema but off by default in CSV for the same reason.

The registry that will let consumers add formats — and stop every page bundling every renderer — is specced in `specs/viewer-registry.md`.

## Timestamp inference (parquet)

Epoch integers are the worst-reading thing in a data table, and often the column you scan most. The viewer reads a column as temporal on the first signal that hits:

1. **Type annotation** — `TIMESTAMP(unit)` / `DATE`, via `logical_type` or the legacy `converted_type`. Unambiguous, but plenty of writers emit epoch millis as a bare `INT64`, so it doesn't fire nearly as often as you'd hope.
2. **Value range** — every sampled value inside one unit's plausible-epoch window (~1990–2100). The windows are ~3 orders of magnitude apart, so seconds/millis/micros/nanos don't get confused with each other; the unit is read off the data rather than assumed.
3. **Name gate** — (2) only applies to a column already named like a timestamp (`dt`, `ts`, `time`, `timestamp`, `date`, or a `_at` / `_time` / `_ts` / `_date` suffix). A large-integer `id` column must never become a date, and a name alone never triggers anything.

Mixed units, out-of-window values, or a non-numeric in the column all fall back to rendering raw — a silently mis-rendered timestamp is worse than a visible integer. Output is always UTC with an explicit `Z`, elided to the coarsest form that loses nothing (`2026-04-25 00:00Z`, `… 00:00:37Z`, `… 00:00:37.500Z`, or a bare `2026-04-25` for a `DATE`), and the raw value stays on the cell's `title`. The schema panel labels a guess as `INT64 · epoch millis (inferred)`, so you can always see which readings were inferred rather than declared.

To turn the heuristic off — annotated columns still format — use `makeParquetViewer({ inferTimestamps: false })`. `formatTemporal` / `inferTemporalFormat` are exported from the same subpath if you'd rather drive it yourself from a `renderCell`.

### Row-group size is a browsing knob

Rendering a page fetches **the whole row group** it lands in — parquet's unit of compression, so there's no sub-group slicing to be had. That makes the *writer's* row-group size the thing that decides how responsive browsing feels: pandas' `to_parquet` default puts ~1M rows in one group, which for a wide table is a ~10 MB download to look at row 1.

If a file is meant to be browsed, write it in the ~50K-row neighbourhood:

```python
df.to_parquet(path, row_group_size=50_000)
```

A real case (`jc-taxes`' payment ledger, 1.7M rows) went from 2 groups of 11.4 MB to 35 of ~650 KB — a 17× smaller fetch per view, at the cost of ~4 MB more file (smaller groups compress slightly worse). The row-group table under the pager shows how a given file is laid out, so it's easy to check.

## Theming

The library ships no CSS and defines no palette. Every surface it draws is either inherited (text color, font) or a 50%-gray alpha — `rgba(127,127,127,0.08)` fills, `…,0.4)` borders — which reads correctly against a light *or* a dark background without knowing which it's on. So `<FileTree>` adopts the host page's theme rather than imposing one, and there's nothing to configure in the common case.

The one thing it can't infer is a theme your app keeps in application state. If you have your own toggle, mirror it onto [`color-scheme`] at the root — that's what tells the browser which UA defaults to hand down, and it's what FileTree ends up inheriting:

```ts
document.documentElement.setAttribute('data-theme', theme)   // your styles
document.documentElement.style.colorScheme = theme           // the UA's, and ours
```

Set only the first and a dark app gets a light-looking file tree: your CSS recolors your components, but the UA defaults FileTree inherits are still the light ones.

[`color-scheme`]: https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme

## Viewer registry

The `*Renderer` props are eagerly imported, so a page browsing CSVs still bundles `hyparquet` — and adding a format the library doesn't know means a PR. `viewers` fixes both: an ordered list, first match wins, consulted before the built-ins.

```tsx
import type { ViewerEntry } from '@rdub/file-tree/react'

// Module scope: `id` is what the lazy component is cached under, and
// re-creating the array every render re-runs `match` every render.
const VIEWERS: readonly ViewerEntry<never>[] = [
  { id: 'log',  match: ({ ext }) => ext === 'log',  load: () => import('./LogViewer') },
  { id: 'hdf5', match: ({ ext }) => ext === 'h5',   load: () => import('./Hdf5Viewer') },
]

<FileTree store={store} routeBase="/files" viewers={VIEWERS} />
```

`load` is a dynamic import, so **each viewer lands in its own chunk** and a page downloads only the formats it opens. Every viewer is handed `{ store, path, usePersistedState }`, plus whatever the entry's `options` carries. The bundled renderers all default-export their component, so `load: () => import('@rdub/file-tree/renderers/parquet')` works directly.

`match` is a predicate rather than an extension list because plenty of real dispatch isn't extension-shaped — `manifest.jsonl` wanting a different viewer than other `.jsonl`, a key with no extension at all. It receives `{ path, ext }`.

Registry entries win over the `*Renderer` props, so registering a `.parquet` viewer overrides the built-in one. Directories and zip entries are excluded (the first isn't a file; container formats are still specced, not built — see `specs/viewer-registry.md`).

## Customizing a viewer — four rungs

Each rung costs more than the last; take the lowest one that reaches.

1. **Options** — `initialOpenDepth`, `alignNumeric`, `inferTimestamps`, `jqDebounceMs`.
2. **Render hooks** — `renderCell` / `renderHeader` / `renderValue` / `renderKey` / `cellProps`. These are the workhorse: each receives `defaultNode`, so you override a *decision* without reimplementing what surrounds it.
3. **Strategies** — swap a whole behaviour rather than tune a constant. `parse` (how text becomes a value), `runJq` (how a filter is applied — `jq-web` is only the default, and it's a 2.8 MB wasm module you may not want).
4. **Compose from the plumbing** — build your own viewer over the library's data layer:

```tsx
import { useParquetMeta, useRowGroup } from '@rdub/file-tree/renderers/parquetData'
import { useCsvHeader, useCsvPage, parseLine } from '@rdub/file-tree/renderers/csvData'

function MyParquetTable({ store, path }) {
  const { meta } = useParquetMeta(store, path)          // footer, schema, row groups, stats
  const { rows } = useRowGroup(store, path, meta, page) // decoded + LRU-cached
  return <MyVirtualisedTable columns={meta?.schema} rows={rows} />
}
```

Then register it (`viewers`) and yours wins over the built-in. The split is deliberate: fetching and format decoding stay shared — that's where the bugs and the tests are — and the markup is entirely yours. A virtualised parquet table shouldn't have to think about `hyparquet`.

Site code in `site/src/components/` (`S2CellPreview`, `LogViewer`, `YamlViewer`) is meant to be read and copied, not imported.

## Subpath exports

| Path | What |
|---|---|
| `@rdub/file-tree` | `Store` types, `NotFoundError`, `ZipEntry` types |
| `@rdub/file-tree/react` | `<FileTree>`, `<DirListing>`, `<TextViewer>`, `<Breadcrumb>`, `<MediaViewer>`, `<ZipEntryList>`, `<ZipEntryPreview>`, `parsePath`, `asyncBufferFromStore`, `AUDIO`/`CODE_LANG`/`MarkdownRenderer`/`ParquetRenderer`/`ViewerActionCtx`/`CellRenderer`/`CrumbRenderer` |
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
