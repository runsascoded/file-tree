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

## As built (2026-10-02)

- **Runs**: every run (mode ≠ `'none'`) is one `rowSpan` cell filled by a `RunRenderer` (`RunCellCtx` exactly as above, plus `path`). `RunSpec.mode` defaults to `'sticky'`; a list of names still means `'mark'`. The value box is opaque (`--ft-run-bg`, default `Canvas`) and painted after the decoration layer, so a floating value occludes the rule beneath it. `renderCell` runs for a run's first cell only; its output (elided) is the renderer's `defaultNode`. The merged cell's native title is the value, so hovering anywhere in a run recovers it. `dittoRenderer`/`runLine` (per-cell, unmerged) remain exported for use inside a `renderCell`.
- **Groups**: `RowGroup` also carries `title` and, for path groups, `prefix` (rows under it render their tail after it, indented 1.1em per depth, `├`/`└` by position; the prefix stays in the text at `font-size: 0`, headers likewise keep their parent's part, so copies are full paths). Header cells force `direction: ltr` (a `'start'`-ellipsis column is `rtl`). `pathGroups` compacts chains, needs ≥ `min` (default 2) rows per group, and returns `[]` on an unsorted page. `runGroups` keys groups `col=value#n` (nth run of that value on the page). Explicit `groups` override a `'tree'` path column's implied `pathGroups`.
- **Folds**: `usePersistedState('fold')`, FNV-1a → 4 base-36 chars, concatenated. Runs are computed over the visible rows; a run spans group headers between its rows.
- **Demo** (`/runs`): golfed URL — `?r=` page-wide run mode (`o m s l a`), `?c=` per-column overrides as column/mode char pairs (`w t o s n` × modes, e.g. `c=naol`), `?k=r` raw key, `?p=o` paths off, `?g=` group by (`p` path tree, `w`/`o`/`s` runs of who/owner/status), and the table's own keys remapped through a `PersistedState` wrapper: `?s=` sort (column char, `-` for descending), `?n=` page, `?q=` filter, `?f=` folds, `?h=` hidden columns (column chars). Fixture paths nest `bucket/kind/run/step-N/shard-K`. The option snippet moved into the "?" FAB.
- **Tests**: `test/table-runs.test.ts` (`pathGroups` nesting/compaction/`min`/unsorted, `runGroups`, fold hashes, layout with folds and runs over visible rows, merged-cell DOM incl. a run spanning a group header); `e2e/runs-demo.spec.ts` (value floats in all four modes; tree chip; nest + collapse + deep-linked fold; `?c=` from ⚙️; `runGroups`); `e2e/elide-demo.spec.ts` ditto test updated for merged runs.
