# Row groups, and runs as merged cells

*Follow-up to `specs/done/table-runs-and-path-elision.md`, from review of the `/runs` demo.*

## Problems with what shipped

1. **`sticky` and `tree` are privileged.** `mark`/`line`/`arrow` are a plain `renderCell` over the public `ctx.run`, but `sticky` needs merged cells (`rowSpan`) and `tree` needs inserted rows, and neither is expressible through `renderCell`. Consumers can't build their own variants.
2. **Only `sticky` floats.** A run in `line`/`arrow`/`mark` mode loses its value off the top of the viewport, the original complaint.
3. **`arrow` reads as a column border.** Nothing on the rule says "continues from above".
4. **`tree` is one level**, and its parent row is a special case rather than a concept: it's a row group header, and groups should collapse.

## Design

### Runs are merged cells, drawn by a public renderer

Every run in a `ditto` column (mode ≠ `'none'`) renders as **one cell spanning the run** (parent/group rows inside it included). What's drawn in that cell is a **run renderer**, a public hook:

```ts
interface RunCellCtx<C> {
  value: unknown          // the run's (first row's) value
  column: C
  rows: Record<string, unknown>[]   // the run's rows
  /** Display rows the cell spans (≥ rows.length: group headers inside count). */
  span: number
  /** Each run row's display offset within the span, from 0. */
  offsets: number[]
  /** The first cell as the viewer would draw it (after `renderCell`). */
  defaultNode: ReactNode
  /** `top` for a floating value: just under the sticky header. */
  stickyTop: number
}
type RunRenderer<C> = (ctx: RunCellCtx<C>) => ReactNode

interface RunSpec {
  mode?: RunMode            // built-in renderer; default 'sticky'
  render?: RunRenderer      // your own, instead of `mode`
  key?, min?                // as before
  float?: boolean           // built-ins: value floats at the top of the run's visible part. Default true
  every?: number            // `'arrow'`: an arrowhead every N rows. Default 5
}
```

Built-ins (`runRenderer(mode, opts)`, exported) use only `RunCellCtx`: the (floating) value on an opaque box, and below it, positioned by `offsets / span`: nothing (`sticky`), `〃` per row (`mark`), a rule ending in `└` (`line`), a rule with arrowheads every `every` rows and at the end (`arrow`). The floating value occludes the rule beneath it, so the rule hangs off the value.

`dittoRenderer` (per-cell, unmerged) stays exported for chaining into a `renderCell`; `'none'` still computes `ctx.run` without merging.

### Row groups

```ts
interface RowGroup {
  /** Stable id (persisted collapse state). */
  key: string
  /** Page rows `[start, end)`. */
  start: number
  end: number
  /** Header content, in `column`'s cell. */
  label: ReactNode
  column: string
  children?: RowGroup[]
}
type GroupRows = (rows: readonly Record<string, unknown>[]) => RowGroup[]

groups?: GroupRows   // viewer option
```

- Each group renders a **header row** (indented by depth, ▸/▾ toggle, `· N rows` when collapsed); its rows follow. Collapsed groups hide their rows; runs are computed over the visible rows.
- Collapse state persists via `usePersistedState('fold')`: fixed-width 4-char base-36 hashes of group keys, concatenated (`?fold=3fa2k9q1`).
- Built-ins:
  - `pathGroups(column, { min? })`: a multi-level tree over `/`-segments. Single-child chains compact into one header (`gs://bkt/checkpoints/` is one group, not three); rows show their tail relative to the innermost group, indented. Needs the page sorted by `column` (else no groups, and the header's "sort for tree" chip).
  - `runGroups(column, { key?, min? })`: runs as groups; collapsed, a run is one row (`ahmed@oa.dev · 38 rows`).
- `paths: { col: 'tree' }` becomes sugar for `groups: pathGroups(col)` (plus `'dim'` on leaves).

## Demo

- Deeper fixture paths (`bucket/kind/exp/step-N/shard-K`) so trees nest.
- A "Group by" control (none / path tree / who) alongside the run and path modes.
- The option snippet moves into the "?" FAB.
- URL params golfed: 1-char keys, 1-char values, lists as concatenated chars.

## Tests

- `pathGroups`: exact group trees (compaction, depth, `min`, unsorted → none); `runGroups`.
- Merged runs: `RunCellCtx.offsets`/`span` with group rows inside; built-in renderers' DOM (marks at offsets, arrowheads every N).
- Collapse: hidden rows, header count, persisted hash list.
- e2e: floating value in every mode; collapse/expand a group; deep link restores collapse.
