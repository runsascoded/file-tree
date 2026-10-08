# Tables

The parquet / CSV / in-memory table viewers: cell and crumb hooks, ditto runs, path elision, row groups, timestamps.

Live: [Runs](https://file-tree.rbw.sh/runs) (ditto runs, path trees, row groups), [Elide](https://file-tree.rbw.sh/elide) (clipped values), [Fold](https://file-tree.rbw.sh/fold) (constant columns), and the parquet table in the [MockStore demo](https://file-tree.rbw.sh/mock/samples/events.parquet).

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

`renderCell` gets `{ value, column, row, at, rowIndex, path, defaultNode }` — `column` carries `{ name, physicalType, logicalType, timeUnit, convertedType }`, and `rowIndex` is absolute within the file, not within the page.

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

**Publishing the page outward.** A widget beside the table — a map of the rows on screen, a chart, a detail panel — can't be something the viewer renders: consumers lay the table and the widget out as siblings (ctbk's is a full-height flex sibling of a scrolling table column), so the data has to flow *out*.

```tsx
<FileTree parquetOptions={{
  onPage:      ({ rows, columns, pageStart, totalRows }) => setPage(rows),
  onCellHover: cell => setCell(cell),   // `null` on leave
}} />
```

Inline arrows are safe: both are held in refs, so an identity change every render doesn't re-fire anything. Neither is throttled — `onPage` fires on a click, `onCellHover` on crossing a cell — and a consumer whose handler is genuinely expensive can wrap it.

**Filtering.** Below the threshold it's a substring match over the visible columns, sharing `?q=` with the directory listing's filter and the JSON tree's search — the same affordance, not a third idiom.

Above it, one thing still works, and it's the one that matters on a large file: a **comparison** — `dt >= 2026-01-01`, `id = 42` — is answered from row-group statistics in the footer, which is already loaded. Groups whose `min`/`max` provably can't contain a match are skipped without decoding any column data, and the pager walks only the survivors. On a file the writer sorted by that column the ranges are disjoint, so a point lookup typically reaches one group out of hundreds; the viewer says so when `sorting_columns` records it.

A bare word can't do this — a substring says nothing about a range — and the viewer says that rather than silently doing nothing. Pruning is conservative in the only direction that matters: a group with missing or undecodable statistics is always kept.

`parsePredicate` / `pruneRowGroups` / `rowGroupMatches` / `isSortedBy` are exported from `@rdub/file-tree/renderers/parquetData` for consumers building their own.

**Sorting, below a size threshold.** Both viewers stream — CSV by byte ranges, parquet by row group — and sorting needs the *whole* table, so on a large file it isn't a trade-off, it's a hang. `fullLoadMaxBytes` (default ~5 MB) is the line: at or below it the file is loaded once and every column becomes sortable, with the sort in the URL (`?sort=name`, `?sort=-name`) and an exact row count. Above it the viewer streams as before and **the sort controls are absent, not disabled** — a greyed-out arrow invites a click and teaches nothing, while a line saying `2.1 GB — streaming byte ranges` explains itself.

Bytes rather than rows because it's the number a viewer knows *before* reading anything; a row count is only knowable after the decision it would inform. `0` never loads, `Infinity` always does. `sortComparators` overrides the default per column (numeric when both values parse as numbers — which matters for CSV, where lexical order puts `10` before `9` — dates by instant, else locale string order; nulls last in both directions).

**Hiding columns.** `columnPicker: true` adds a `columns 5/7` control; `hiddenColumns` sets the initial set without offering the control. Both are on `TableViewerOptions`, so parquet and CSV share them. State goes through `usePersistedState`, so with `useUrlPersistedState` you get `?hide=a,b` and can paste a link to a column subset.

It's stored as the *hidden* set, not the visible one: an allow-list would silently hide any column a file gains after the URL was shared. The control is table-level rather than per-header — a hide button on a `<th>` removes the very header you'd click to bring it back.

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

### Neighboring rows, chaining, ditto

`ctx.at(dRow)` returns the row `dRow` positions away on the current page, in display order (after sort/filter): `at(-1)` is the row above, `at(1)` the row below, and it's `undefined` past either edge. It's lazy, so a renderer that doesn't call it pays nothing. That's the seam for anything depending on adjacent rows: run collapsing, deltas, group boundaries. `repeatsAbove(ctx)` is the common case (`Object.is` against the same column one row up).

`chainCellRenderers(a, b, …)` composes renderers left to right, each receiving the previous output as `defaultNode` (`undefined` stages are skipped). "Ditto" (collapsing a run of repeated values to a dimmed `〃`, value kept on its `title`) is just one such renderer:

```tsx
import { chainCellRenderers, dittoRenderer } from '@rdub/file-tree/renderers/parquet'

const renderCell = chainCellRenderers(
  dittoRenderer(['owner']),
  ctx => ctx.column.name === 'value' ? renderMoney(ctx) : ctx.defaultNode,  // sees the mark as `defaultNode` on a repeat
)
```

The `ditto: ['owner']` viewer option is sugar for exactly that: it chains `dittoRenderer` ahead of your `renderCell`. A renderer that wants the value back on a repeated cell tests `repeatsAbove(ctx)` (or `ctx.run`, below) and returns its own node.

### Runs, paths and groups

`ditto` also takes a mode per column, for long runs (an action log where one batch shares an actor, a time, an owner and a note). Each run renders as **one merged cell** whose value floats at the top of the run's visible part as the table scrolls; the mode picks what's drawn beneath it:

```tsx
import { pathGroups, runGroups } from '@rdub/file-tree/renderers/tableRuns'

<RowsTable
  rows={log}
  ditto={{
    who: 'sticky',                                  // the value, nothing beneath (the default)
    owner: 'mark',                                  // `〃` per repeated row (what a plain list means)
    note: 'line',                                   // a rule down the run, ending in `└`
    status: { mode: 'arrow', every: 5 },            // a rule with an arrowhead every 5 rows
    when: { key: v => ago(v) },                     // run on the rendered bucket ("5w ago"), not the raw timestamp
  }}
  paths={['path']}                                  // dim the segments a path shares with the row above
  groups={pathGroups('path')}                       // or `runGroups('who')`, or your own `(rows) => RowGroup[]`
/>
```

- **Runs** are computed per page in display order (over visible rows, when groups collapse); empty values never join one; `min` (default 2) sets the shortest. `float: false` pins the value to the run's top. `'none'` computes runs (`ctx.run`) without merging.
- **Your own run renderer**: `{ render: (ctx: RunCellCtx) => ReactNode }`. `RunCellCtx` has the run's `value`, `rows`, `span` (display rows covered, group headers included), each row's `offsets` within it, the first cell's `defaultNode` and the `stickyTop` offset. The built-ins (`runRenderer(mode)`) use nothing else.
- **Groups** render a collapsible header row (▾/▸, `· N rows` when folded) above their rows, nested via `children`. `pathGroups(col)` is a multi-level tree over `/`-segments, with single-child chains compacted into one header and rows showing their tail, indented. It needs the page sorted by the column; `paths: { col: 'tree' }` is sugar for it, and an unsorted tree column shows a "sort for tree" chip. `runGroups(col)` groups runs of a column (sort by it first, as with SQL's `GROUP BY`); rows under such a group leave that cell blank, since the header states it. Folded groups persist via `usePersistedState` (`?fold=`, 4-char hashes concatenated). As the table scrolls, the groups enclosing the top row float as crumbs under the group column's header (click one to scroll to it). A run's merged cell extends up over group headers just above it, so a group's values start, and float, from its top.
- **Rows**: every column shows row lines (merged cells draw them too), and the hovered row is tinted across all columns, merged cells included.
- **`paths: 'dim'`** dims the whole `/`-segments a path shares with the row above (a `scheme://` counts as part of the first segment). Hover and copy always give the full path.
- **`<RowsTable rows columns? sortComparators?>`** (`@rdub/file-tree/renderers/rowsTable`) is the table viewer over rows already in memory (`memoryTableSource`), with the same sort, filter, paging, resize, runs, paths and groups as a file. Demo: [`/runs`](https://file-tree.rbw.sh/runs).

A cell whose renderer returns `defaultNode` untouched is treated as default: it keeps the native full-value `title` and string-aware ellipsis (`'middle'`). Only cells a renderer actually replaced own their title.

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
