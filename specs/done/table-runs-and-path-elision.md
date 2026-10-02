# Table runs and path elision

*(From disk-tree's gcs deployment, 2026-10-02.)*

## Problem

gcs.oa.dev's tables list prefixes alongside who/when/owner/status/note columns: the `/assignments` action log (1,263 rows), `/staged` (242 staged prefixes in batches), the table under the treemap. Their rows come in long runs: one batch of 790 assignments shares an actor, a timestamp, an owner, a status and a 200-character note; consecutive paths share most of their prefix (`gs://marin-us-east5/checkpoints/dna-bolinas-mix-v0.9-p1B-i2{0..9}-…`).

The `ditto` renderer (`renderers/ditto.tsx`) helps: a repeated value becomes `〃`. But:

1. **The value scrolls away.** In a run of 40 dittos, the one cell that holds the value is off-screen; a reader sees a column of `〃` and has to scroll up or hover.
2. **One mode only.** Sometimes a run reads better as one block: the value once, with a line down through the run, or the cells merged.
3. **Paths don't run as whole values.** Two paths are rarely equal, but they share long prefixes. Today each row prints the whole path, so the eye can't find what changed.
4. **Equality is `Object.is` on the raw value.** A relative-time column ("5w ago") should run on the *rendered* bucket, not the epoch second, or every row breaks the run.

## Proposal

### 1. Run display modes

Extend `ditto` from a column list to per-column modes, keeping the list form as `'mark'` for every listed column:

```ts
ditto?: readonly string[] | Record<string, RunMode | RunSpec>

type RunMode = 'mark' | 'sticky' | 'line'
interface RunSpec {
  mode: RunMode
  /** Key a run on this instead of `Object.is(value)`: e.g. a relative-time
   *  bucket, a user id behind an email. */
  key?: (value: unknown, row: Record<string, unknown>) => unknown
  /** Shortest run to collapse (default 2). */
  min?: number
}
```

- **`mark`:** today's `〃` (value on `title`).
- **`sticky`:** the run's first cell shows the value. While any part of the run is in the viewport, the value floats at the top of the run's visible part (`position: sticky` inside a cell that spans the run, or an overlay positioned per scroll). The rest of the run's cells are blank. This is the "value floats at the top" behaviour, and probably the best default for long runs.
- **`line`:** the first cell shows the value. A thin vertical rule runs down through the rest of the run and ends with a small tick (`↓` / `└`) on its last row.

Runs are computed per page, on display order (after sort/filter), as `repeatsAbove` does now. Expose the run boundaries to `renderCell` (`ctx.run: { start: boolean; end: boolean; length: number; index: number } | undefined`), so a consumer can draw its own run treatment.

An empty value never starts a run, as now.

### 2. Path elision

A `paths` option naming columns that hold `/`-separated paths, with a mode:

- **`dim`** (default): the part of a path shared with the row above (whole segments only) renders dimmed; the changed tail renders normally. The first row of a page shows in full. Hover or copy always yields the full path.
- **`tree`**: rows grouped under their common parent. A parent row (not in the data) shows the shared prefix once, and children show only their tail, indented, like `tree`'s output. This makes sense only when sorted by that column: fall back to `dim` otherwise, and say so in the header tooltip.

Segment boundaries are `/`. A scheme (`gs://`, `s3://`) counts as part of the first segment.

### 3. Rows from memory

If the table layer has no in-memory row source yet (it renders parquet, CSV and SQLite), add one, so a consumer's own rows (`Record<string, unknown>[]` plus column specs) get the same sort, page, resize, ditto and path features. disk-tree's site would then build its prefix tables on it, instead of hand-rolled `<table>`s.

## Consumer

disk-tree `site/` (gcs.oa.dev and cw-s3.oa.dev): the action log, `/staged` and the children table. Columns: who, owner, status and note as `sticky`; when as `sticky` keyed on the relative-time bucket; path as `dim`, or `tree` when path-sorted.

## Tests

- Run computation: exact boundaries on a fixture page (mixed runs, empties, a custom `key`, `min`).
- Path elision: exact rendered segments (shared vs tail) for a sorted and an unsorted page, including the first row of a page and a scheme.
- `sticky` and `line` render as described (snapshot of the DOM structure; screenshot in the demo site).

## As built (2026-10-02)

- **Layout is pure** (`src/renderers/tableRuns.ts`): `computeRuns`, `sharedPathPrefix`, `splitParent`, `isSortedBy`, `pathModes`, `tableLayout`. `RunMode` gained `'none'` (runs computed for `ctx.run`, not drawn). A `key` returning `null`/`undefined` joins nothing, like an empty value.
- **One `<tbody>` for every viewer** (`src/renderers/tableBody.tsx`, `TableRows`): parquet, CSV and `TableBrowser` (SQLite, remote, in-memory) all render through it, replacing three copies of the cell loop. The viewers pass rows, columns, styles and a `defaultNode`; `TableRows` lays out runs and paths and chains `dittoRenderer` ahead of `renderCell`.
- **`sticky`** is a `rowSpan` cell (`verticalAlign: top`) holding a `position: sticky` box, offset by the measured `<thead>` height. The clip moves from the `<td>` to the box (an `overflow: hidden` cell would become the sticky box's scroll container). `TableBrowser`'s scroller is now `maxHeight: 70vh` like parquet/CSV, so its header and runs stick too. A `renderCell` is called only for a sticky run's first cell.
- **`line`** is per cell: an absolutely positioned rule bleeding into the default `0.2em` vertical padding, so consecutive rows join; the last row draws `└`.
- **`tree`** inserts a parent row per group of ≥ 2 consecutive rows with the same non-empty parent (one level, not nested); a group of one renders as `'dim'`. Children show `├`/`└` plus the tail, with the parent kept in the text at `font-size: 0`, so a copy is the full path. A sticky run spans parent rows; a `line` run draws through them. "Sorted" is detected from the page itself (ascending or descending per `compareValues`), so a naturally ordered streaming page qualifies as well as a viewer sort. Only one column groups; a second `'tree'` column gets `'dim'`.
- **Rows from memory**: `memoryTableSource(rows, { columns?, sortComparators? })` (all capabilities pushed "down"), `inferColumns`, `singleTableCatalog`, and `<RowsTable>` (`@rdub/file-tree/renderers/rowsTable`) over `TableBrowser`.
- **Demo**: `/runs` (a seeded 254-row action log; run mode, relative-time key and path mode toggles).
- **Tests**: `test/table-runs.test.ts` (exact run boundaries incl. empties, `key`, `min`; shared/tail segments sorted, unsorted, with schemes; tree items and fallback note; `TableRows` DOM for sticky/line/mark/tree/dim; `memoryTableSource`), `e2e/runs-demo.spec.ts` (sticky value pinned under the header after scrolling; tree only when sorted).
