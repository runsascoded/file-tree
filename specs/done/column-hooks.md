# Parquet viewer: column-level presentation hooks (`renderHeader` + cell props)

Source: ctbk session, 2026-08-16, after adopting `renderCell` + timestamp inference (`specs/done/pluggable-cell-rendering.md`). That hook works well — ctbk now renders epoch columns, interval durations, derived mean/sd, GBFS histograms and enum chips through it, and deleted its 162-LOC forked viewer to get there.

**Status: implemented 2026-08-16.** Both asks landed, including the suggested numeric-alignment default and the row-group stats. See "Implementation notes" at the bottom.

Two things it structurally cannot do, both because presentation stops at the cell's *contents*.

## Current state

`renderCell`'s return value is placed inside a `<td>` whose styling is fixed (`src/renderers/parquet.tsx:347`):

```tsx
<td style={{ padding: '0.2em 0.6em', whiteSpace: 'nowrap',
             maxWidth: '30em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
  {renderCell ? renderCell({ ... }) : defaultNode}
</td>
```

and the header is a bare `<th>{c.name}</th>` (`:331`) with no hook at all.

## Ask 1: let a consumer style the cell, not just fill it

**The motivating case is right-justifying numeric columns**, which is table-stakes for a data grid: digits should line up column-wise so magnitudes are comparable down the column. Today `text-align` lives on the `<td>` and is unreachable.

The workaround ctbk ships is a block wrapper inside the cell:

```tsx
<div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{shown}</div>
```

It mostly works — a block child fills the cell's content box, so it aligns against the column width. But it's a wart in two ways: it fights the `<td>`'s own `textOverflow: ellipsis` (the ellipsis is computed on the cell, the overflow now happens in the child), and every consumer re-derives it.

Minimal shape, matching the existing options-bag convention:

```ts
export interface ParquetViewerOptions {
  renderCell?: ParquetCellRenderer
  inferTimestamps?: boolean
  /** Per-column cell attributes. Merged over the viewer's own `<td>`
   *  style; returning nothing leaves the default. */
  cellProps?: (col: ParquetColumn) => { style?: CSSProperties; className?: string } | void
}
```

A narrower `align?: (col) => 'left' | 'right' | 'center'` would cover the motivating case alone, if the general form feels too open. Either beats the wrapper.

**Worth considering as a default**: right-justify numeric physical types (`INT32`/`INT64`/`FLOAT`/`DOUBLE`) with `tabular-nums` out of the box. That's what a reader wants ~always, it needs no schema knowledge, and it'd make the un-hooked viewer better for everyone — same argument that justified timestamp inference. If you take that, Ask 1 becomes an escape hatch rather than a requirement, and ctbk deletes its wrapper.

## Ask 2: `renderHeader`

Two things want to live in the header and have nowhere to go:

1. **A per-column format toggle.** The inference is a guess and the formatting is opinionated; the honest complement is letting the reader flip a column between rendered and raw *in situ*. `inferTimestamps: false` is all-or-nothing and code-level. The state can live consumer-side (ctbk has `use-prms` and would bind it to a URL param), so this needs only a place to put the control — not viewer state.
2. **Column stats.** The row-group metadata the viewer already reads carries per-column min/max; surfacing the current RG's range on header hover is a genuinely useful orientation cue in a 15M-row file, and it's free — the data is in hand.

Mirroring the established shape:

```ts
export interface ParquetHeaderCtx {
  column: ParquetColumn
  /** Current row group's stats for this column, when the footer has them. */
  stats?: { min?: unknown; max?: unknown; nullCount?: number }
  defaultNode: ReactNode
}
export type ParquetHeaderRenderer = (ctx: ParquetHeaderCtx) => ReactNode
```

`stats` is the part that isn't reconstructible consumer-side — the consumer never sees the parquet footer, only decoded rows. If plumbing it is awkward, ship `renderHeader` without it and treat stats as a follow-up; the hook is the load-bearing half.

## Acceptance

- A consumer can right-justify a column without a wrapper element, and the cell's ellipsis behaviour is unchanged.
- A consumer can render a control in a column header, and clicking it doesn't disturb the viewer's own state (RG page, in-RG page, cache).
- `renderHeader` returning `defaultNode` is pixel-identical to no hook.
- If numeric auto-alignment lands: a `BYTE_ARRAY` column is unaffected, and a consumer can still override.

## Not in scope

- Column reordering / hiding / resizing. Real wants eventually, much larger surface — a separate conversation.
- Sorting. The viewer reads one row group at a time; sorting inside a page would be actively misleading.

## Implementation notes

- **Numeric auto-alignment landed** (`alignNumeric`, default on), so Ask 1 is an escape hatch rather than a requirement and ctbk can delete its wrapper. `INT32`/`INT64`/`INT96`/`FLOAT`/`DOUBLE` right-align with `tabular-nums`; `BOOLEAN` and byte-array types don't.
  - **Alignment keys off the rendered meaning, not the physical type.** A column read as temporal is excluded even though it's an `INT64` — it prints as text, and right-aligning it would detach it from its (left-aligned) header. This wasn't in the spec but falls straight out of having inference already.
  - **Headers follow their column.** Right-aligned digits under a left-aligned header looks broken; every data grid pairs them.
- **`cellProps` + `headerProps`, not one hook.** The spec named only `cellProps`, but a consumer overriding alignment needs the header to match, and folding both into one fn makes `className` ambiguous about which element it lands on. Both are `(col) => { style?, className? } | void`, resolved once per column (a 100×17 page would otherwise call them 1,700× per render).
- **Stats plumbed, not deferred.** `RowGroupInfo` carries a `Map<name, {min, max, nullCount}>` built from `row_groups[i].columns[j].meta_data.statistics`, preferring the modern `min_value`/`max_value` over the deprecated `min`/`max`.
  - **The default header uses them too.** The spec called header-hover stats "free", so rather than only exposing them, the un-hooked header gets a `title`: `row group: 0 … 70578`, collapsing to `= 626` when min equals max, plus a null count when nonzero. Same argument that justified timestamp inference — it makes the viewer better for consumers who wire nothing up.
  - Values are formatted defensively: parquet stats are raw per-type, so byte arrays are UTF-8 decoded (strictly — invalid bytes are dropped, not mojibake'd), temporal columns route through `formatTemporal`, and anything unrecognised is omitted rather than stringified to `[object Object]`.

### Verified

`/mock/samples/events.parquet` (dev + production build): `id`/`value` right-aligned on both `<th>` and `<td>` with **no wrapper element** and `text-overflow: ellipsis` intact; `dt`/`event_ts`/`recorded` left-aligned; `region` (`BYTE_ARRAY`) centered via a `cellProps` override with a `renderHeader` marker. Header titles read `row group: 2026-04-25 00:00Z … 2026-05-04 00:00Z` for `dt` and `lax … sfo` for `region` (decoded from byte arrays).

Live ctbk shard (`avail/agg=1d/cons=1d/2026-05-03.parquet`, 2,407 rows × 17 cols): all 15 numeric columns align, `station_id` and `dt` don't; `bikes_n` reads `= 626`, `bikes_sum` reads `0 … 70578`.

### Follow-ups not done

- **Per-column format toggle** — `renderHeader` is the place to put it, and consumer-side state was always the plan, so nothing further is needed here. Not built in this repo.
- **CSV renderer** has neither hook, and no schema to align from — it'd need value-sniffing.

## Heads-up: two sessions are editing this checkout

Not part of the ask, but worth naming since it nearly bit already. Both `~/c/awair` and `~/c/js/file-tree` have live sessions writing to `~/c/js/file-tree` directly — awair authored `src/react/{DirListing,Breadcrumb,FileTree}.tsx` and `src/renderers/json.tsx` in the working tree, which the file-tree session then found and committed as "changes I didn't make" (`4406f5b`, `7f7b893`, and likely `24a645f`).

That worked by luck — the edits happened to be sequential. Concurrent edits would interleave silently, and neither session would know. Suggestion: awair works in a worktree (`wt/awair` off this repo, per the usual `wt/` convention) and repoints its `pds` `localPath` there, so each session owns a tree. This spec was written into `specs/` only — a new untracked file, no conflict risk — deliberately.
