# Table viewer: readable long cells (full-value tooltip, wide/expand mode, resizable columns)

Asked for by the **mgu** (`marin-gcs-usage`) `/files` parquet viewer: the sweep
deletion logs have `name` and `dir` columns that are long GCS object paths
(`checkpoints/adam-lr1.00e-2-128B-nesterovFalse-…`), and today every one renders
as a bare `…` with no way to read the rest. The value is *there* — it just can't
be seen or recovered.

## Current state (why the path is unreadable)

`TD_STYLE` (`src/renderers/table.ts:139`) truncates **every** cell:

```ts
export const TD_STYLE: CSSProperties = {
  padding: '0.2em 0.6em', whiteSpace: 'nowrap', maxWidth: '30em',
  overflow: 'hidden', textOverflow: 'ellipsis',
}
```

Two things compound:

1. **No `title` / no tooltip.** The sort headers carry a native `title` ("Sort
   by X"), but data cells carry nothing — so a truncated value is simply lost.
2. **The outer scroll can't rescue it.** `tableBrowser.tsx` wraps the table in
   `overflowX: 'auto'`, but the per-cell `maxWidth: 30em` caps column width
   *before* horizontal scrolling would ever expose the tail. So the scrollbar
   only appears once the sum of 30em-capped columns exceeds the viewport, and
   even then each column stays clipped at 30em.

There is no consumer-side escape hatch for this that doesn't reimplement the cell
(`renderCell` exists, but every consumer with long paths would rewrite the same
truncation/tooltip logic — this belongs in the shared viewer).

## Update (2026-09-08): reframed as one `elide` strategy — #1 landed, #2/#4 are its axes

Features 1, 2, and 4 turned out to be one concern seen from three distances:
**elidable text** — a value that clips to fit its column, and the affordance
that brings the clipped tail back. Rather than three ad-hoc booleans
(`cellTitles`, `wideToggle`, `cellTooltip`), the viewers now take a single
`elide?: ElideConfig | boolean` option (in `TableViewerOptions`, so it rides
the same path parquet/csv/`TableBrowser` already share). It has a
batteries-included preset and per-axis overrides:

```ts
interface ElideConfig {
  maxWidth?: string | false   // clip cap; false = natural width + outer x-scroll   ← feature #2
  tooltip?: 'native' | false | ((ctx) => ReactNode)  // native | none | rich TT      ← features #1 / #4
  content?: (value) => string | undefined            // what the tooltip shows; default = full value
}
```

- `elide: true` (and absent) = the preset: clip at 30em, native `title` = full
  value. **This is feature #1, and it has shipped** (`src/renderers/table.ts`
  `cellTitle`/`resolveElide`/`applyElide`; wired into all three cell sites;
  `test/elide.test.ts`; CIC-verified on a real parquet).
- `elide: { maxWidth: false }` = **feature #2** (wide mode). Verified live: the
  column renders at natural width and the existing `overflowX:auto` scrolls to
  reveal it.
- `elide: { tooltip: (ctx) => <MyTooltip text={ctx.text}>{ctx.node}</MyTooltip> }`
  = **feature #4** (rich TT). `file-tree` stays tooltip-dependency-free; the
  consumer supplies the panel, wrapping `ctx.node` and reading `ctx.text`.

The native-`title` default is gated to a *default-rendered scalar* cell (a
consumer `renderCell` owns its own title); a `tooltip` render-prop applies
regardless, since passing it is the opt-in.

**Still open on this seam** (deferred, documented on `ElideConfig`):
`ellipsis: 'middle'` (keep a path's tail — needs JS measurement, since CSS
`text-overflow` only clips the end; `src/og/card.ts`'s `clipMiddle` is the
building block) and `onlyWhenClipped` (surface the tooltip only when the value
is *measured* to overflow, vs. on every scalar — costs a `ResizeObserver`).

**Feature #3 (resizable columns) landed separately** — it's per-column *width
state*, not an elision strategy, so it stayed out of `elide`. Shipped as
`resizableColumns?: boolean` (opt-in, default off; `src/renderers/columnResize.tsx`
`useColumnWidths`/`ColumnResizeHandle`, wired into all three viewers): drag a
header's right-edge handle to pin a width (a `pointermove` threshold keeps a
double-click free to land), double-click it to auto-fit the widest cell (via
`scrollWidth`, so a clipped cell still measures its full content). A pinned width
overrides the `elide` cap for that column and persists per `(path, column)`
through `usePersistedState` (`?cw=name:220,dir:480`). `test/column-resize.test.ts`
covers the persisted-string round-trip; `e2e/elide-demo.spec.ts` drives a real
drag + double-click.

All four features are now addressed, so this spec is done. The original
feature-by-feature write-up below is retained for the rationale; read it through
the `elide` lens above.

## Proposed features (layered cheap → rich)

### 1. Full-value `title` on overflowing cells — default on

The floor: the default cell (`defaultTableCell` / the `td` in `tableBrowser.tsx`
and `parquet.tsx`) sets `title={stringify(value)}` for scalar values (skip
objects/JSX). Native tooltip, zero dependency, and it makes the full path
recoverable on hover immediately. This alone closes the "can't read it at all"
gap and should ship regardless of the rest.

- Gate it so it only fires when the cell can actually clip (scalar value, not a
  custom `renderCell` node). A custom render owns its own title.

### 2. Wide / expand mode — a toggle that lets the x-scroll work

A control in the table's button row (next to `ColumnPicker`, same idiom) that
drops the `maxWidth` cap so cells render at natural width and the existing
`overflowX: auto` container scrolls to reveal full columns.

- Implementation: a boolean (persist via the existing `usePersistedState`, keyed
  like the filter) that, when on, merges `{ maxWidth: 'none' }` (keep
  `whiteSpace: nowrap`) into the resolved cell style. `resolveColStyles` already
  centralizes the merge — thread the flag through, or apply it in
  `tableBrowser`/`parquet` where `styles?.cell ?? TD_STYLE` is chosen.
- Label it plainly ("wide" / "⇔"); off by default so the compact table is the
  first impression. This is the highest-value / lowest-risk item and directly
  answers the "expand (and let table x-scroll)" ask.

### 3. Resizable columns — drag a `<th>` border, remember the width

Drag handles on the header cells; a dragged column pins to an explicit width
(overriding both the 30em cap and wide mode for that column). Persist per
`(path, column)` so a width set on the sweep logs survives navigation and reload.

- More surface than 1–2 (pointer capture, a width map, persistence), so it's the
  last of the three; 1+2 already make the table usable.
- Interaction: double-click a handle = auto-fit to the column's widest rendered
  value (nice-to-have).

### 4. Rich (React) tooltip — as a consumer slot, not an FT dependency

mgu asked for "at minimum a **React** TT". FT has no floating-ui and shouldn't
grow one just for this — but it can expose the seam so a consumer that *has* one
(mgu ships a floating-ui `Tooltip`) supplies it:

- Add an optional `cellTooltip?: (ctx: TableCellCtx) => ReactNode` (or reuse the
  existing `onCellHover` + let the consumer render one shared floating panel —
  already half-built for "one rich preview panel driven by the table"). When
  absent, feature 1's native `title` stands.
- This keeps floating-ui out of FT's tree while giving mgu the rTT it prefers.

## Consumer API (how mgu opts in)

`FilesPage` passes `parquetRenderer={ParquetViewer}` to `<FileTree>`; the new
knobs should ride the same path (FileTree → renderer → tableBrowser):

```tsx
<FileTree
  store={store} routeBase="/files" title="…" parquetRenderer={ParquetViewer}
  table={{ cellTitles: true, wideToggle: true, resizableColumns: true }}
/>
```

Defaults: `cellTitles` on, `wideToggle` on (control shown), `resizableColumns`
on once built. Everything degrades to today's behavior if the host passes
nothing — the compact 30em table stays the default *look*, these only add ways
out of it.

## "Perhaps other" adjacents (cheap, same area — worth folding in)

- **Copy cell value** on click (or a copy affordance in the rich TT) — long paths
  exist to be pasted into `gsutil`/queries.
- **Wrap mode** (a third state alongside compact/wide: `whiteSpace: normal`,
  drop `nowrap`) for when the reader wants everything visible without scrolling.
- **Per-column width persistence** keyed by `(path, column)` (shared with #3) so
  the layout is stable per dataset.

## Non-goals

- Virtualized rows / windowing (paging already bounds row count).
- Changing the default compact look — these are opt-outs from truncation, not a
  new default.
