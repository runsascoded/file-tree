# A viewer registry — pluggable formats without bundling all of them

*Prompted by asking what of the parquet work is actually parquet-specific. Short
answer: less than half. The cell/column hooks are **table** concerns and should
serve CSV, TSV, XLSX, SQLite, Zarr alike; the dispatch that routes a path to a
viewer is a **registry** concern and currently doesn't scale past the formats
hard-coded into it.*

## Where we are

Two hard-coded lists, both edited by hand for every new format:

1. **`Parsed` in `src/react/parsePath.ts`** — a closed union of 11 `kind`s
   (`dir`, `zip`, `zipEntry`, `text`, `parquet`, `notebook`, `pdf`, `image`,
   `video`, `audio`, `binary`), assigned by an if-chain over the extension.
2. **`FileTreeProps`** — one optional prop per renderer (`markdownRenderer`,
   `parquetRenderer`, `parquetOptions`, `jsonRenderer`, `csvRenderer`,
   `notebookRenderer`, `codeRenderer`), each threaded by hand through
   `FileTree` → `Body` → a `switch` arm.

Three problems follow, and they compound:

- **Adding a format means editing the library.** A consumer can't teach it about
  HDF5 or `.rtf` without a PR — but format support is exactly the kind of thing
  contributors want to add, and exactly the kind of thing that shouldn't need
  core review.
- **Everything ships to everyone.** The props are eagerly-imported components,
  so a page browsing CSVs still bundles `hyparquet`. Consumers currently
  hand-roll `React.lazy` around each renderer to avoid this (or don't, and eat
  it). With a dozen formats that's untenable — nobody should download an HDF5
  reader to look at a PNG.
- **Options are per-format, ad hoc.** `parquetOptions` exists; `csvOptions`
  doesn't. `renderCell` on the parquet viewer and `renderCell` on the directory
  listing are unrelated types with the same name. A consumer who formats a
  currency column has to write it twice to cover `.parquet` and `.csv`.

## The two things to separate

### 1. Dispatch → a registry

Replace the closed `kind` union + prop-per-renderer with an ordered list of
entries the consumer composes:

```ts
interface Viewer<O = unknown> {
  /** First match wins, so order is the consumer's priority. */
  match: (ctx: { path: string; ext: string; entry?: Entry }) => boolean
  /** Lazily loaded: nothing is fetched until a matching path is opened. */
  load: () => Promise<{ default: ComponentType<ViewerProps & O> }>
  options?: O
}

<FileTree store={store} viewers={[
  { match: ({ ext }) => ext === 'parquet', load: () => import('@rdub/file-tree/renderers/parquet'), options: { renderCell } },
  { match: ({ ext }) => ext === 'csv', load: () => import('@rdub/file-tree/renderers/csv'), options: { renderCell } },
]} />
```

Code-splitting falls out for free — `load` is a dynamic import, so the bundler
splits each viewer into its own chunk and the page pays only for formats it
actually opens. The library ships a `DEFAULT_VIEWERS` covering today's set so
nothing breaks and the common case stays one prop.

`match` taking a predicate rather than an extension list matters for the cases
that aren't extension-shaped: `part-*.parquet` inside a directory that should
render as one logical table, `manifest.jsonl` wanting a different viewer than
other `.jsonl`, content-sniffing when there's no extension at all.

### 2. Tabular hooks → one shared contract

`renderCell` / `renderHeader` / `cellProps` / `headerProps` are not parquet
ideas. Lift them to a format-neutral `TableViewerOptions`, and have every
table-shaped viewer accept it:

```ts
interface TableCellCtx {
  value: unknown
  column: TableColumn        // { name, type?, ... } — physical types stay optional
  row: Record<string, unknown>
  rowIndex: number
  path: string
  defaultNode: ReactNode
}
```

Then one `renderCell` covers `.parquet`, `.csv`, `.tsv`, a SQLite table, a Zarr
slice. Parquet keeps its extras (row-group stats, `inferTimestamps`) as a
superset — `ParquetViewerOptions extends TableViewerOptions`.

This is the part with real user-facing payoff: ctbk formats the same currency
and S2 columns whether the shard is parquet or CSV, and today would write it
twice.

**Open:** `ParquetColumn` carries `physicalType` / `logicalType` /
`convertedType`, which are parquet's vocabulary. CSV has no types at all; SQLite
has its own. Options are (a) a narrow common core (`name`, plus an optional
coarse `kind: 'number' | 'string' | 'temporal' | …`) with format-specific detail
behind a discriminant, or (b) generic `TableColumn<T>` parameterised by the
format's column type. (a) is friendlier and probably right; (b) is more honest.

### 3. Container formats — the `zipEntry` pattern, generalised

`zip` is already special: it's not a viewer but a *sub-tree*, with `zipEntry` a
path inside it. SQLite (tables), HDF5 (groups/datasets), Zarr (arrays), tar are
all the same shape — a file that browses like a directory and whose leaves
render like files.

That wants a second registry kind:

```ts
interface Container {
  match: (ctx) => boolean
  load: () => Promise<{ list(store, path): Promise<Entry[]>; open(store, path, entry): ... }>
}
```

so a leaf inside a container routes back through the *viewer* registry — an
HDF5 dataset lands in the tabular viewer, a PNG inside a zip in the image
viewer, and neither needs the container to know about them. This also removes
`zip`/`zipEntry` from the `kind` union.

## Status

**1. Tabular hooks — done** (`e51d74b`). `src/renderers/table.ts` holds the
neutral contract; parquet's types are extensions of it and every name consumers
already used still resolves. CSV gained the four hooks and `makeCsvViewer`. Two
asymmetries surfaced and are documented rather than papered over: `rowIndex` is
page-relative in CSV (byte-range pages never learn how many rows preceded them),
and numeric alignment is off there by default since CSV has no types to infer
from. `column.kind` landed as the coarse reading; parquet finalises `temporal`
*after* inference, since a `TIMESTAMP` is an `INT64` until values are sampled.

**2. Viewer registry — done** (`46a430a`). `viewers?: ViewerEntry[]` on
`<FileTree>`, consulted before the built-ins, `load` a dynamic import. Additive
— the `*Renderer` props still work. Two things the sketch below got wrong:

- **`id` is required.** Keying the `React.lazy` cache on the entry *object*
  means an inline `viewers={[…]}` array remounts the viewer every render — the
  same component-identity trap as `makeParquetViewer`. A string id makes the
  inline case behave.
- **Viewers need default exports** so `load` needs no unwrapping. Added to the
  bundled parquet/csv/notebook viewers.

Not done, deliberately: `<FileTree>` still has a prop per renderer. Removing
them is a breaking change worth doing once the registry has proven itself
against a real consumer, not the same day it lands. Likewise `csvOptions` was
skipped — the registry's `options` covers it, so adding a prop about to be
deleted would be churn.

**3. Container registry — not started.** Still wants a second real
implementation before generalising from zip.

## Sequencing

The three are independent and get less certain as they go:

1. **Tabular hooks** — pure refactor, no API break (`ParquetViewerOptions`
   becomes an alias), immediate payoff for consumers with mixed-format trees.
2. **Viewer registry** — bigger, and the `DEFAULT_VIEWERS` shim decides whether
   it's a break. Wants doing before the format list grows much further.
3. **Container registry** — least certain; probably wants a second real
   implementation (SQLite?) before generalising from zip alone. Two points make
   a line, one doesn't.

## Not this

`kind`-per-format is fine *internally*; the problem is that it's closed and that
consumers can't extend it. A registry that produces the same internal dispatch
is the goal, not a rewrite of the viewers themselves.
