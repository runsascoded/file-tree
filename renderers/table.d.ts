import { ReactNode, CSSProperties } from 'react';

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

/** What a viewer can say about a column without knowing its format.
 *
 *  `kind` is a coarse *reading* of the column, not its storage type —
 *  it's what a consumer branches on when the point is presentation
 *  ("right-align numbers", "these are dates"). Formats that know more
 *  extend this: parquet carries the physical/logical type it actually
 *  read, CSV knows only the name. Absent when the format can't say —
 *  a bare CSV column is genuinely untyped, and guessing is the
 *  consumer's call, not the library's. */
interface TableColumn {
    name: string;
    kind?: 'number' | 'string' | 'temporal' | 'boolean' | 'binary';
}
interface TableCellCtx<C extends TableColumn = TableColumn> {
    value: unknown;
    column: C;
    /** The whole row, for cells whose rendering depends on a sibling. */
    row: Record<string, unknown>;
    /** Row index. Absolute within the file where the viewer can know it
     *  (parquet pages within a row group, so it can); page-relative where
     *  it can't — the CSV viewer paginates by *bytes*, so it has no way
     *  to count the rows it skipped. Check the viewer before relying on
     *  it for anything but `key`s. */
    rowIndex: number;
    /** Path of the file being viewed, so one module-scope renderer can
     *  dispatch across a tree of unrelated schemas rather than needing a
     *  viewer per file. */
    path: string;
    /** What the viewer would have rendered for this cell. */
    defaultNode: ReactNode;
}
/** Per-cell render hook: called for every cell, decorate the ones you
 *  care about and return `ctx.defaultNode` for the rest. Mirrors
 *  `renderCell` (dir listing) and `renderValue` (JSON tree) — the
 *  library hands back the node it would have rendered and gets out of
 *  the way. */
type TableCellRenderer<C extends TableColumn = TableColumn> = (ctx: TableCellCtx<C>) => ReactNode;
interface TableHeaderCtx<C extends TableColumn = TableColumn> {
    column: C;
    path: string;
    /** What the viewer would have rendered for this header. */
    defaultNode: ReactNode;
}
type TableHeaderRenderer<C extends TableColumn = TableColumn> = (ctx: TableHeaderCtx<C>) => ReactNode;
/** Attributes merged over a column's default `<td>` / `<th>` styling.
 *  Returning nothing leaves the default untouched. */
type TableColumnProps<C extends TableColumn = TableColumn> = (col: C, path: string) => {
    style?: CSSProperties;
    className?: string;
} | void;
interface TableViewerOptions<C extends TableColumn = TableColumn> {
    renderCell?: TableCellRenderer<C>;
    /** Per-column header content — a place to hang format toggles, stat
     *  readouts, and the like. */
    renderHeader?: TableHeaderRenderer<C>;
    /** Per-column `<td>` attributes, merged over the viewer's defaults. */
    cellProps?: TableColumnProps<C>;
    /** Per-column `<th>` attributes. Separate from `cellProps` so
     *  overriding one doesn't silently change the other. */
    headerProps?: TableColumnProps<C>;
}
/** Shared `<td>` / `<th>` styling, so the table viewers look like each
 *  other rather than merely similar. */
declare const TD_STYLE: CSSProperties;
declare const TH_STYLE: CSSProperties;
declare const NUMERIC_ALIGN: CSSProperties;
/** Resolve per-column `<td>`/`<th>` styling once per column rather than
 *  once per cell — the hooks are pure in `(column, path)`, and a table
 *  is mostly cells. */
declare function resolveColStyles<C extends TableColumn>(columns: readonly C[], path: string, opts: Pick<TableViewerOptions<C>, 'cellProps' | 'headerProps'>, isNumeric: (col: C) => boolean): Map<string, {
    cell: CSSProperties;
    header: CSSProperties;
    cellClass?: string;
    headerClass?: string;
}>;

export { NUMERIC_ALIGN, TD_STYLE, TH_STYLE, type TableCellCtx, type TableCellRenderer, type TableColumn, type TableColumnProps, type TableHeaderCtx, type TableHeaderRenderer, type TableViewerOptions, resolveColStyles };
