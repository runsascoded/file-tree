/** Format-neutral hooks for the table-shaped viewers.
 *
 *  These started life on the parquet viewer, but nothing about them is
 *  parquet: a currency column is a currency column whether it arrived
 *  as `.parquet`, `.csv`, a SQLite table, or a Zarr slice, and a
 *  consumer shouldn't write the same `renderCell` once per format.
 *  Every table-shaped viewer takes `TableViewerOptions`; formats with
 *  more to offer extend it (parquet adds row-group statistics and
 *  timestamp inference).
 *
 *  Deliberately no React import — these are types, so a consumer can
 *  name them without pulling a renderer into their bundle.
 *
 *  See `specs/viewer-registry.md` for where this is going. */
import type { CSSProperties, ReactNode } from 'react'
import type { SortComparators } from './tableSort'

/** What a viewer can say about a column without knowing its format.
 *
 *  `kind` is a coarse *reading* of the column, not its storage type —
 *  it's what a consumer branches on when the point is presentation
 *  ("right-align numbers", "these are dates"). Formats that know more
 *  extend this: parquet carries the physical/logical type it actually
 *  read, CSV knows only the name. Absent when the format can't say —
 *  a bare CSV column is genuinely untyped, and guessing is the
 *  consumer's call, not the library's. */
export interface TableColumn {
  name: string
  kind?: 'number' | 'string' | 'temporal' | 'boolean' | 'binary'
}

export interface TableCellCtx<C extends TableColumn = TableColumn> {
  value: unknown
  column: C
  /** The whole row, for cells whose rendering depends on a sibling. */
  row: Record<string, unknown>
  /** Row index. Absolute within the file where the viewer can know it
   *  (parquet pages within a row group, so it can); page-relative where
   *  it can't — the CSV viewer paginates by *bytes*, so it has no way
   *  to count the rows it skipped. Check the viewer before relying on
   *  it for anything but `key`s. */
  rowIndex: number
  /** Path of the file being viewed, so one module-scope renderer can
   *  dispatch across a tree of unrelated schemas rather than needing a
   *  viewer per file. */
  path: string
  /** What the viewer would have rendered for this cell. */
  defaultNode: ReactNode
}

/** Per-cell render hook: called for every cell, decorate the ones you
 *  care about and return `ctx.defaultNode` for the rest. Mirrors
 *  `renderCell` (dir listing) and `renderValue` (JSON tree) — the
 *  library hands back the node it would have rendered and gets out of
 *  the way. */
export type TableCellRenderer<C extends TableColumn = TableColumn> = (ctx: TableCellCtx<C>) => ReactNode

export interface TableHeaderCtx<C extends TableColumn = TableColumn> {
  column: C
  path: string
  /** What the viewer would have rendered for this header. */
  defaultNode: ReactNode
}

export type TableHeaderRenderer<C extends TableColumn = TableColumn> = (ctx: TableHeaderCtx<C>) => ReactNode

/** Attributes merged over a column's default `<td>` / `<th>` styling.
 *  Returning nothing leaves the default untouched. */
export type TableColumnProps<C extends TableColumn = TableColumn> =
  (col: C, path: string) => { style?: CSSProperties; className?: string } | void

/** The page a viewer just rendered. */
export interface TablePageCtx<C extends TableColumn = TableColumn> {
  rows: Record<string, unknown>[]
  /** Visible columns, in render order. */
  columns: readonly C[]
  path: string
  /** Index of the first row *within the file*, where the viewer knows
   *  it — see `TableCellCtx['rowIndex']` for when it doesn't. */
  pageStart: number
  /** Total rows in the file, or `null` when the viewer can't know
   *  (CSV paging by bytes never learns one). */
  totalRows: number | null
}

export interface TableViewerOptions<C extends TableColumn = TableColumn> {
  renderCell?: TableCellRenderer<C>
  /** Per-column header content — a place to hang format toggles, stat
   *  readouts, and the like. */
  renderHeader?: TableHeaderRenderer<C>
  /** Per-column `<td>` attributes, merged over the viewer's defaults. */
  cellProps?: TableColumnProps<C>
  /** Per-column `<th>` attributes. Separate from `cellProps` so
   *  overriding one doesn't silently change the other. */
  headerProps?: TableColumnProps<C>
  /** Show a `columns (5/7)` control for hiding columns. Wide tables are
   *  common and horizontal scrolling is a poor way to read one; hiding
   *  needs no extra data, so it works at any file size.
   *
   *  Off by default — it adds chrome, and a viewer shouldn't grow a
   *  control the host didn't ask for. Bind `usePersistedState` to the
   *  URL and the choice becomes shareable (`?hide=a,b`). */
  columnPicker?: boolean
  /** Columns hidden initially, by name. Independent of `columnPicker`:
   *  set this alone to drop columns the reader can't restore. */
  hiddenColumns?: readonly string[]
  /** Load the whole table at or below this many bytes, which unlocks
   *  sorting and an exact row count. Above it the viewer streams as it
   *  always has and those controls are *absent* — not disabled.
   *  Default `DEFAULT_FULL_LOAD_MAX_BYTES` (~5 MB); `0` never loads,
   *  `Infinity` always does.
   *
   *  Bytes rather than rows: it's the number a viewer knows before
   *  reading anything, and a row count is only knowable after the
   *  decision it would inform. */
  fullLoadMaxBytes?: number
  /** Called when the rendered page changes — the rows now on screen,
   *  for a sibling widget: a map of the current page, a chart, a
   *  summary. The viewer can't render these itself; consumers lay the
   *  table and the widget out side by side (ctbk's is a full-height
   *  flex sibling), so the data has to flow *out*.
   *
   *  The callback is held in a ref, so an inline arrow is safe — its
   *  identity changing every render will not re-fire this. */
  onPage?: (ctx: TablePageCtx<C>) => void
  /** Called with the cell under the cursor, and `null` on leave.
   *
   *  For one rich preview panel driven by the table, rather than a
   *  tooltip per cell. Same ref treatment as `onPage`. */
  onCellHover?: (ctx: TableCellCtx<C> | null) => void
  /** Per-column comparator override, for when the default (numeric if
   *  both values parse as numbers, else locale string order) reads a
   *  column wrong — a version string, an ordered enum. */
  sortComparators?: SortComparators
}

/** Shared `<td>` / `<th>` styling, so the table viewers look like each
 *  other rather than merely similar. */
export const TD_STYLE: CSSProperties = {
  padding: '0.2em 0.6em', whiteSpace: 'nowrap', maxWidth: '30em',
  overflow: 'hidden', textOverflow: 'ellipsis',
}
export const TH_STYLE: CSSProperties = {
  padding: '0.3em 0.6em', textAlign: 'left', fontWeight: 500,
  borderBottom: '1px solid rgba(127,127,127,0.4)',
}
export const NUMERIC_ALIGN: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/** Resolve per-column `<td>`/`<th>` styling once per column rather than
 *  once per cell — the hooks are pure in `(column, path)`, and a table
 *  is mostly cells. */
export function resolveColStyles<C extends TableColumn>(
  columns: readonly C[],
  path: string,
  opts: Pick<TableViewerOptions<C>, 'cellProps' | 'headerProps'>,
  isNumeric: (col: C) => boolean,
): Map<string, { cell: CSSProperties; header: CSSProperties; cellClass?: string; headerClass?: string }> {
  const out = new Map<string, { cell: CSSProperties; header: CSSProperties; cellClass?: string; headerClass?: string }>()
  for (const c of columns) {
    const align: CSSProperties = isNumeric(c) ? NUMERIC_ALIGN : {}
    const cp = opts.cellProps?.(c, path) || {}
    const hp = opts.headerProps?.(c, path) || {}
    out.set(c.name, {
      cell: { ...TD_STYLE, ...align, ...cp.style },
      header: { ...TH_STYLE, ...align, ...hp.style },
      ...(cp.className ? { cellClass: cp.className } : {}),
      ...(hp.className ? { headerClass: hp.className } : {}),
    })
  }
  return out
}
