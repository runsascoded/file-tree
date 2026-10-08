# Viewers

How a file path finds the component that renders it, and how to swap or extend one.

Live: [MockStore demo](https://file-tree.rbw.sh/mock) has one file of each format, with the render hooks below wired up.

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
| `JsonlViewer` (`jsonlRenderer`) | `@rdub/file-tree/renderers/jsonl` | — |

**Markdown links resolve against the tree.** `<FileTree>` calls `markdownRenderer(source, ctx)`, where `ctx` (`MarkdownCtx`) knows the file's store key: `renderMarkdown` uses it to point a relative link (`../data/`, `sfo.md#tz`) at that file's route in the browser, navigating in-app on a plain click (a real `href` stays, so cmd-click works), and a relative image at `store.getUrl` when the store can mint one. Absolute, external and `#anchor` links render as written, as do links that would climb out of the tree. A custom `markdownRenderer` can ignore `ctx`, or use `resolveTreeHref` / `markdownCtx` from `@rdub/file-tree/react` itself.

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

The peers are declared `optional` in `peerDependenciesMeta`, so installing only what you import is enough. Source lives at [`src/renderers/`](https://github.com/runsascoded/file-tree/blob/main/src/renderers/) — copy + tweak if you want different styling, paginate sizes, or language set.

`jq-web` is an Emscripten WASM module that expects to fetch `jq.wasm` from the same URL as its `jq.js`. In Vite/webpack apps that's usually a copy step — easiest path is to copy `node_modules/jq-web/jq.wasm` to your `public/` dir (or use a `copy-files`/`copy-webpack-plugin` equivalent). Without that, typing in the `jq` input surfaces a `WebAssembly.instantiate()` error; the search / expand-all / copy-path features still work.

Built-in kinds (no renderer needed): plain text (`<pre>`), image (`<img>`), video (`<video>`), audio (`<audio>`), zip (entry list + per-entry preview, with client-side `DecompressionStream` fallback if `Store.getZipEntries?` isn't provided).

More built-ins:

- **TAR** (`.tar`, `.tar.gz` / `.tgz`, `.tar.zst`): a member list, each member at `<archive>!/<member>` (the same URL form as zip) and opened with whatever viewer its own name implies. The archive is read whole, capped at 32 MiB compressed / 64 MiB inflated, and a cut-off listing says so.
- **Compressed files** (`.gz`, `.zst`): inflated in the browser (`DecompressionStream`; `fzstd` for zstd), then dispatched on the inner name, so `runs.jsonl.gz` gets the JSONL table and `app.log.gz` whatever viewer handles `.log`. `.bz2` / `.xz` aren't decoded.
- **Unknown types**: the first 4 KiB is read; text-looking bytes render as text, anything else as a `hexdump -C`-style dump.
- **Extension-less names** (`Makefile`, `Dockerfile`, `LICENSE`, …) and dotfiles (`.gitignore`) render as text rather than being taken for directories.

JSONL / NDJSON rows render as a table when `jsonlRenderer` is set (sort, filter, column picker, elision; nested values as compact JSON), reading at most 16 MiB / 10,000 rows; without it they're plain text.

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

Registry entries win over the `*Renderer` props, so registering a `.parquet` viewer overrides the built-in one. Directories and archive members (`<archive>!/<member>`) are excluded from that outer match: a directory isn't a file, and a tar member (or a `.gz` / `.zst` file's contents) is unpacked first and then dispatched on its own name, where the registry applies again. Zip members still use the zip preview (see `specs/viewer-registry.md`).

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

The tree exports its own fiddly parts too — `useOpenState` (the open/closed reconciliation between initial depth, a depth-force, and search), `collectMatchPaths`, `jqKeySegment`, and `defaultRunJq`.

Then register it (`viewers`) and yours wins over the built-in. The split is deliberate: fetching and format decoding stay shared — that's where the bugs and the tests are — and the markup is entirely yours. A virtualised parquet table shouldn't have to think about `hyparquet`.

Site code in `site/src/components/` (`S2CellPreview`, `LogViewer`, `YamlViewer`) is meant to be read and copied, not imported.

## ViewerActions slot

Per-file action buttons rendered next to the download icon. Signature:

```ts
(ctx: { store, path, kind, entry? }) => ReactNode
```

Use for "open in SQL REPL", "view raw", "share", etc. — consumer-app-specific. See `site/src/viewerActions.tsx` for a reference (parquet/CSV → `/sql?url=...`).
