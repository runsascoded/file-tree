# Subpath exports

Every entry point, and the optional peer each one needs.

| Path | What |
|---|---|
| `@rdub/file-tree` | `Store` types, `NotFoundError`, `ZipEntry` types |
| `@rdub/file-tree/react` | `<FileTree>`, `<DirListing>`, `<TextViewer>`, `<Breadcrumb>`, `<MediaViewer>`, `<ZipEntryList>`, `<ZipEntryPreview>`, `parsePath`, `asyncBufferFromStore`, `AUDIO`/`CODE_LANG`/`MarkdownRenderer`/`ParquetRenderer`/`ViewerActionCtx`/`CellRenderer`/`CrumbRenderer` |
| `@rdub/file-tree/stores` | Every `Store` impl, plus the `Store` / `Entry` / … types |
| `@rdub/file-tree/stores/r2` | `R2Store`, `R2StoreOptions`, `R2PresignOptions` |
| `@rdub/file-tree/stores/s3` | `S3Store`, `S3StoreOptions` (works for AWS S3, R2 via S3 API, MinIO) |
| `@rdub/file-tree/stores/http` | `HttpStore`, `HttpStoreOptions` |
| `@rdub/file-tree/stores/multi` | `MultiStore` |
| `@rdub/file-tree/stores/mock` | `MockStore` (in-memory) |
| `@rdub/file-tree/server` | `createHandlers` (HTTP endpoints over any Store) |
| `@rdub/file-tree/server/tree` | `createTreeHandlers` (HTTP endpoints over any `TreeSource`) |
| `@rdub/file-tree/renderers/treeSource` | `TreeSource` types, `TreeTooLargeError`, `SnapshotNotFoundError`, `diffLevels` |
| `@rdub/file-tree/renderers/walkTreeSource` | `walkTreeSource` (also re-exported from `/react`) |
| `@rdub/file-tree/renderers/snapshotTreeSource` | `snapshotTreeSource` (peer: `hyparquet`) |
| `@rdub/file-tree/renderers/diskTreeTreeSource` | `diskTreeTreeSource` (also re-exported from `/react`) |
| `@rdub/file-tree/renderers/httpTreeSource` | `httpTreeSource` (also re-exported from `/react`) |
| `@rdub/file-tree/renderers/parquet` | `ParquetViewer` (peer: `hyparquet`) |
| `@rdub/file-tree/renderers/markdown` | `renderMarkdown` (peers: `react-markdown`, `remark-gfm`) |
| `@rdub/file-tree/renderers/csv` | `CsvViewer` (pure JS) |
| `@rdub/file-tree/renderers/table` | Format-neutral table hooks: `TableCellCtx`, `chainCellRenderers`, `repeatsAbove`, elide helpers |
| `@rdub/file-tree/renderers/ditto` | `runRenderer` (built-in merged-run renderers), `dittoRenderer`, `dittoMark` (also re-exported from `parquet` / `csv`) |
| `@rdub/file-tree/renderers/tableRuns` | Pure run / path / group layout: `computeRuns`, `pathGroups`, `runGroups`, `sharedPathPrefix`, `tableLayout`, `RunSpec`, `RowGroup` |
| `@rdub/file-tree/renderers/rowsTable` | `RowsTable` (a table of in-memory rows), `memoryTableSource`, `inferColumns` |
| `@rdub/file-tree/renderers/notebook` | `NotebookViewer` (peers via `markdown`) |
| `@rdub/file-tree/renderers/code` | `renderCode` (peer: `highlight.js`) |
| `@rdub/file-tree/renderers/json` | `renderJsonTree` — search, jq filter (optional `jq-web` peer), expand/collapse-all, copy-jq-path on key click |
| `@rdub/file-tree/omnibar` | `treePathEndpoint` (⌘K path search over a `TreeSource`, as a `use-kbd` omnibar endpoint), `treePathIndex`, `scorePath` (optional peer: `use-kbd`) |
| `@rdub/file-tree/url-state` | `useUrlPersistedState` — opt-in URL-state hook (binds `?q=`, `?page=`, `?json-q=`, `?jq=` via `use-prms`) |
| `@rdub/file-tree/test/conformance` | `runStoreConformance(makeStore)` — vitest battery any new Store impl can opt into |
