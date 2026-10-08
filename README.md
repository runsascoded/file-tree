# `@rdub/file-tree`

Storage-agnostic file browser for React. Plug a `Store` (S3, R2, GCS, an HTTP proxy, or an in-memory object) into `<FileTree>` and get directory listings, recursive sizes and a treemap, and viewers for parquet, CSV, JSON / JSONL, markdown, notebooks, SQLite, PDFs, images, video, audio, zip / tar archives, gzip / zstd-compressed files, and a hexdump for anything else.

**[file-tree.rbw.sh]** is these docs, browsed with the component itself.

## Install

Not on npm yet; pin a build from the `dist` branch:

```bash
pnpm add github:runsascoded/file-tree#dist   # or #<dist-sha>, which is what consumers pin
```

## Quick start

```tsx
import { FileTree } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'

const store = MockStore({
  'README.md': '# hi',
  'data/q1.csv': 'a,b\n1,2\n',
})

<Route path="/files/*" element={<FileTree store={store} routeBase="/files" />} />
```

Swap `MockStore` for `S3Store`, `GcsStore`, `R2Store` (in a Worker) or `HttpStore` (in the browser, against `createHandlers` on a server). [Quick start](docs/quick-start.md) walks through the R2 + Worker + React setup.

## Docs

| | |
|---|---|
| [Stores](docs/stores.md) | The `Store` interface and every shipped implementation's options |
| [Quick start](docs/quick-start.md) | R2 + Cloudflare Worker + React; the server handlers |
| [Downloads](docs/downloads.md) | Public, presigned, or proxied download URLs |
| [Viewers](docs/viewers.md) | Per-format renderers, the viewer registry, customizing one |
| [Tables](docs/tables.md) | Parquet / CSV / in-memory tables: cell hooks, ditto runs, path elision, row groups |
| [Tree sources](docs/tree-sources.md) | Recursive sizes, the treemap, snapshot history and diffs |
| [Navigation](docs/navigation.md) | ⌘K path search; view state in the URL |
| [Theming](docs/theming.md) | Light/dark: inherits the host page's |
| [Subpath exports](docs/exports.md) | Every entry point and its optional peer |
| [Architecture](docs/architecture.md) | Design notes; roadmap |

## Demos

[MockStore] (in-memory fixture), [HttpStore] (Worker proxy over R2), [S3] / [R2] / [GCS] (any bucket, from the browser), [Elide] (clipped cell values), [Fold] (constant columns stated once), [Runs] (ditto runs, path trees, row groups), [Snapshots] (treemap over scan history).

Consumers: [ctbk.dev], [nj-crashes.com], [awair], [jc-taxes], [disky].

[file-tree.rbw.sh]: https://file-tree.rbw.sh
[MockStore]: https://file-tree.rbw.sh/mock
[HttpStore]: https://file-tree.rbw.sh/http
[S3]: https://file-tree.rbw.sh/s3
[R2]: https://file-tree.rbw.sh/r2
[GCS]: https://file-tree.rbw.sh/gcs
[Elide]: https://file-tree.rbw.sh/elide
[Fold]: https://file-tree.rbw.sh/fold
[Runs]: https://file-tree.rbw.sh/runs
[Snapshots]: https://file-tree.rbw.sh/snapshots
[ctbk.dev]: https://ctbk.dev
[nj-crashes.com]: https://nj-crashes.com
[awair]: https://github.com/runsascoded/awair
[jc-taxes]: https://github.com/runsascoded/jc-taxes
[disky]: https://github.com/runsascoded/disky
