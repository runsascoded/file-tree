import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, CSSProperties, PointerEvent, MouseEvent } from 'react';
import { P as PersistedState } from './persistedState-CB_wfbcb.js';

/** Load the whole table at or below this many bytes.
 *
 *  Bytes rather than rows because it's the number both viewers know
 *  *before* reading anything (the store's `totalSize`, parquet's
 *  footer) — a row count is only knowable after the decision it would
 *  inform. ~5 MB is roughly 50–100K rows of typical tabular data:
 *  comfortably sortable in a browser, small enough to fetch without
 *  thinking. */
declare const DEFAULT_FULL_LOAD_MAX_BYTES: number;
type SortDir = 'asc' | 'desc';
interface SortState {
    column: string | null;
    dir: SortDir;
    /** Cycles asc → desc → off for the given column. */
    toggle: (name: string) => void;
}
/** Sort state, in the URL when the consumer opts in: `?sort=name` or
 *  `?sort=-name` for descending. One param rather than two, so a
 *  pasted link carries the whole thing. */
declare function useSort(usePersistedState?: PersistedState): SortState;
/** Default comparator.
 *
 *  Numeric when *both* values read as finite numbers — which matters
 *  for CSV, where everything arrives as a string and lexical order puts
 *  `10` before `9`. Dates by instant. Everything else by
 *  `localeCompare`, so accented text sorts where a reader expects.
 *
 *  Nulls and undefined sort last regardless of direction: they're
 *  absence, not a value, and flipping them to the top on a descending
 *  sort buries the rows you asked to see. */
declare function compareValues(a: unknown, b: unknown): number;
/** Per-column comparator override — CSV has no types, so a consumer who
 *  knows a column is a version string or an enum can say so. */
type SortComparators = (col: TableColumn) => ((a: unknown, b: unknown) => number) | undefined;
/** Sorted copy, or the original array when nothing is sorted — so the
 *  common case doesn't pay for a copy. Stable, because `Array.sort` is. */
declare function useSortedRows<R extends Record<string, unknown>>(rows: R[] | null, sort: Pick<SortState, 'column' | 'dir'>, comparators?: SortComparators, columns?: readonly TableColumn[]): R[] | null;
/** `▲` / `▼` / a low-contrast `↕` placeholder, so the affordance is
 *  visible before you've used it. */
declare function sortGlyph(column: string, sort: Pick<SortState, 'column' | 'dir'>): string;

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
/** The page a viewer just rendered. */
interface TablePageCtx<C extends TableColumn = TableColumn> {
    rows: Record<string, unknown>[];
    /** Visible columns, in render order. */
    columns: readonly C[];
    path: string;
    /** Index of the first row *within the file*, where the viewer knows
     *  it — see `TableCellCtx['rowIndex']` for when it doesn't. */
    pageStart: number;
    /** Total rows in the file, or `null` when the viewer can't know
     *  (CSV paging by bytes never learns one). */
    totalRows: number | null;
}
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
    /** Show a `columns (5/7)` control for hiding columns. Wide tables are
     *  common and horizontal scrolling is a poor way to read one; hiding
     *  needs no extra data, so it works at any file size.
     *
     *  Off by default — it adds chrome, and a viewer shouldn't grow a
     *  control the host didn't ask for. Bind `usePersistedState` to the
     *  URL and the choice becomes shareable (`?hide=a,b`). */
    columnPicker?: boolean;
    /** Columns hidden initially, by name. Independent of `columnPicker`:
     *  set this alone to drop columns the reader can't restore. */
    hiddenColumns?: readonly string[];
    /** Load the whole table at or below this many bytes, which unlocks
     *  sorting and an exact row count. Above it the viewer streams as it
     *  always has and those controls are *absent* — not disabled.
     *  Default `DEFAULT_FULL_LOAD_MAX_BYTES` (~5 MB); `0` never loads,
     *  `Infinity` always does.
     *
     *  Bytes rather than rows: it's the number a viewer knows before
     *  reading anything, and a row count is only knowable after the
     *  decision it would inform. */
    fullLoadMaxBytes?: number;
    /** Called when the rendered page changes — the rows now on screen,
     *  for a sibling widget: a map of the current page, a chart, a
     *  summary. The viewer can't render these itself; consumers lay the
     *  table and the widget out side by side (ctbk's is a full-height
     *  flex sibling), so the data has to flow *out*.
     *
     *  The callback is held in a ref, so an inline arrow is safe — its
     *  identity changing every render will not re-fire this. */
    onPage?: (ctx: TablePageCtx<C>) => void;
    /** Called with the cell under the cursor, and `null` on leave.
     *
     *  For one rich preview panel driven by the table, rather than a
     *  tooltip per cell. Same ref treatment as `onPage`. */
    onCellHover?: (ctx: TableCellCtx<C> | null) => void;
    /** Per-column comparator override, for when the default (numeric if
     *  both values parse as numbers, else locale string order) reads a
     *  column wrong — a version string, an ordered enum. */
    sortComparators?: SortComparators;
    /** How long cell values that outgrow their column are rendered — the
     *  clip and the way the full value comes back. `true`/absent is the
     *  batteries-included default (clip at 30em, native `title` = the full
     *  value); `false` turns clipping off entirely; an object overrides
     *  individual axes ({@link ElideConfig}). See {@link resolveElide}. */
    elide?: ElideConfig | boolean;
    /** Let the reader drag a column's right edge to pin its width (and
     *  double-click the handle to auto-fit the widest cell). Off by default
     *  — a viewer shouldn't grow a handle on every header unasked. A pinned
     *  width overrides the `elide` cap for that column.
     *
     *  `true` remembers widths per `(path, column)` via `usePersistedState`
     *  (shareable `?cw=…`). Pass `{ scope }` to widen that — `'schema'`
     *  (same-column-set files share, in `localStorage`), `'column'` (by name,
     *  global), or your own `(columns, path) => string`. See `columnResize`
     *  and {@link ResizeScope}. */
    resizableColumns?: boolean | ColumnResizeConfig;
}
/** Options for {@link TableViewerOptions.resizableColumns} beyond a bare
 *  `true`. */
interface ColumnResizeConfig {
    scope?: ResizeScope;
}
/** One elidable cell, as an `elide` tooltip sees it. */
interface ElideCtx<C extends TableColumn = TableColumn> {
    value: unknown;
    /** The full value as text — what the tooltip should show — or `undefined`
     *  when the value has no readable scalar form (see {@link cellTitle}). */
    text: string | undefined;
    /** The node the cell renders (the viewer default, or a consumer
     *  `renderCell`), for a tooltip render-prop to wrap. */
    node: ReactNode;
    column: C;
    row: Record<string, unknown>;
    path: string;
}
/** How a table viewer handles a value too wide for its column: the clip,
 *  and the tooltip that brings the clipped tail back. Every field has a
 *  default (see {@link ELIDE_DEFAULTS}); the top-level `elide: true` preset
 *  binds them all, and each is independently overridable — so a consumer
 *  moves along one axis without restating the rest.
 *
 *  Not yet exposed, but the natural next axes on this same seam:
 *  `ellipsis: 'middle'` (keep a path's tail; needs JS measurement, as CSS
 *  `text-overflow` only clips the end) and `onlyWhenClipped` (surface the
 *  tooltip only when the value is *measured* to overflow, rather than on
 *  every scalar — costs a `ResizeObserver`). */
interface ElideConfig<C extends TableColumn = TableColumn> {
    /** The column's width cap. A CSS length clips and ellipsizes overflow;
     *  `false` renders at natural width so an outer scroller can reveal the
     *  whole column (the "wide mode" escape hatch). Default `'30em'`. */
    maxWidth?: string | false;
    /** The tooltip that recovers the clipped tail:
     *   - `'native'` (default): a browser `title` tooltip = the full value.
     *     Applied only to a default-rendered scalar cell — a consumer
     *     `renderCell` may reformat the value, so it owns its own title.
     *   - `false`: none.
     *   - `(ctx) => ReactNode`: your own (rich) tooltip — usually a floating
     *     panel, though any node is fair game. `file-tree` stays free of any
     *     tooltip dependency; you supply it, wrapping `ctx.node` and reading
     *     `ctx.text`. Applied whether or not a `renderCell` is present —
     *     passing it *is* the opt-in. */
    tooltip?: 'native' | false | ((ctx: ElideCtx<C>) => ReactNode);
    /** What the tooltip shows for a value, when not the full raw text.
     *  Default {@link cellTitle} (scalars → their string, others → nothing). */
    content?: (value: unknown) => string | undefined;
}
/** {@link ElideConfig} with every default filled in. */
interface ResolvedElide<C extends TableColumn = TableColumn> {
    maxWidth: string | false;
    tooltip: 'native' | false | ((ctx: ElideCtx<C>) => ReactNode);
    content: (value: unknown) => string | undefined;
}
/** The batteries-included preset `elide: true` (and the absent default)
 *  resolve to: clip at 30em, recover the full value via a native `title`. */
declare const ELIDE_DEFAULTS: ResolvedElide;
/** Fold an `elide` option down to a fully-resolved strategy. `true`/absent
 *  → the {@link ELIDE_DEFAULTS} preset; `false` → clip and tooltip both off;
 *  an object → the preset with its axes overridden. */
declare function resolveElide<C extends TableColumn>(elide: ElideConfig<C> | boolean | undefined): ResolvedElide<C>;
/** The style contribution of an elide strategy: only the width cap, since
 *  the clip idiom (`nowrap`/`overflow`/`ellipsis`) already lives in
 *  {@link TD_STYLE}. `maxWidth: false` → `'none'` (natural width). */
declare function elideCellStyle(el: ResolvedElide): CSSProperties;
/** The per-cell result of an elide strategy: a `title` to hang on the
 *  `<td>` (the native tooltip), and the node to render (possibly a tooltip
 *  render-prop's wrapper). */
interface ElideCell {
    title?: string;
    node: ReactNode;
}
/** Apply an elide strategy's *tooltip* to one cell — the width cap is a
 *  style concern ({@link elideCellStyle}); this is the tooltip half.
 *  `hasCustomRender` gates the `'native'` default (a `renderCell` owns its
 *  own title), but a tooltip render-prop applies regardless. */
declare function applyElide<C extends TableColumn>(el: ResolvedElide<C>, args: {
    value: unknown;
    node: ReactNode;
    hasCustomRender: boolean;
    column: C;
    row: Record<string, unknown>;
    path: string;
}): ElideCell;
/** Shared `<td>` / `<th>` styling, so the table viewers look like each
 *  other rather than merely similar. */
declare const TD_STYLE: CSSProperties;
/** Full-value text to hang on a cell's native `title`, so the tail that
 *  `TD_STYLE`'s `maxWidth`/ellipsis clips stays recoverable on hover —
 *  a long GCS path renders as a bare `…` otherwise, unreadable and
 *  uncopyable. Returns `undefined` for values a cell draws as its *own*
 *  node (null/undefined, byte blobs, plain objects), where a title would
 *  only add `[object Object]` noise, not the value. Callers skip it
 *  entirely when a consumer `renderCell` owns the cell — a custom render
 *  carries its own title. */
declare function cellTitle(value: unknown): string | undefined;
declare const TH_STYLE: CSSProperties;
declare const NUMERIC_ALIGN: CSSProperties;
/** Resolve per-column `<td>`/`<th>` styling once per column rather than
 *  once per cell — the hooks are pure in `(column, path)`, and a table
 *  is mostly cells. */
declare function resolveColStyles<C extends TableColumn>(columns: readonly C[], path: string, opts: Pick<TableViewerOptions<C>, 'cellProps' | 'headerProps'>, isNumeric: (col: C) => boolean, el?: ResolvedElide): Map<string, {
    cell: CSSProperties;
    header: CSSProperties;
    cellClass?: string;
    headerClass?: string;
}>;

/** `"name:220,dir:480"` → `{ name: 220, dir: 480 }`. Tolerant: skips
 *  empty / malformed pairs rather than throwing on a hand-edited URL. */
declare function parseWidths(raw: string): Map<string, number>;
/** Inverse of {@link parseWidths}; widths rounded to whole px. Order is
 *  insertion order, so the string is stable across writes that don't
 *  change the set. */
declare function serializeWidths(m: ReadonlyMap<string, number>): string;
/** What identity a pinned width is remembered under — the ladder from
 *  narrow to broad sharing:
 *   - `'path'` (default): this exact file. Rides `usePersistedState`, so a
 *     consumer on `useUrlPersistedState` gets a shareable `?cw=…`.
 *   - `'schema'`: every file with the same column *set* (a fingerprint of
 *     the sorted names) shares — so sibling parquets carry widths, but an
 *     unrelated table doesn't bleed. Stored in `localStorage`.
 *   - `'column'`: by column *name*, across every table — one global map,
 *     so a `name` column keeps its width everywhere (at the cost of two
 *     unrelated `name` columns sharing). Stored in `localStorage`.
 *   - a function `(columns, path) => string`: your own identity.
 *
 *  `'schema'`/`'column'`/fn use `localStorage` (not the URL), since the
 *  point is to carry a width *across* paths, which a per-URL param can't. */
type ResizeScope = 'path' | 'schema' | 'column' | ((columns: readonly TableColumn[], path: string) => string);
/** Stable fingerprint of a column *set* (order-independent), for
 *  `'schema'` scope. A djb2 hash keeps the `localStorage` key short. */
declare function columnFingerprint(columns: readonly TableColumn[]): string;
/** The `localStorage` sub-key for a non-`path` scope (`path` never hits
 *  `localStorage`; its widths live in `usePersistedState`). */
declare function scopeKey(scope: ResizeScope, columns: readonly TableColumn[], path: string): string;
interface UseColumnWidthsArgs {
    /** Whether resizing is on — off short-circuits to no pinned widths and
     *  inert gestures, so a viewer with the feature disabled ignores any
     *  stored widths entirely. */
    on: boolean;
    scope: ResizeScope;
    /** The full column set (not the visible subset — hiding a column
     *  shouldn't change a `'schema'` fingerprint). */
    columns: readonly TableColumn[];
    path: string;
    usePersistedState?: PersistedState;
}
interface ColumnWidths {
    /** Style to pin one column's `<th>`/`<td>` — `width`+`min`+`max` so it
     *  holds against content and overrides the elide cap — or `{}` when the
     *  column has no pinned width. Reflects the live drag for the column
     *  being dragged. */
    styleFor(col: string): CSSProperties;
    /** Begin a drag from a handle's `pointerdown`. Tracks the pointer on
     *  `document` (so it keeps working past the handle's edge) and commits
     *  on release. */
    startResize(col: string, e: PointerEvent): void;
    /** Auto-fit a column to its widest rendered cell (a handle's
     *  `dblclick`), measured via `scrollWidth` so a clipped cell still
     *  reports its full content width. */
    autoFit(col: string, e: MouseEvent): void;
}
/** Per-column pinned widths, drag/auto-fit gestures, and the style each
 *  contributes. Backed by `usePersistedState` for `'path'` scope (so the
 *  URL stays the shareable store) and by `localStorage` for the broader
 *  scopes. See {@link ColumnWidths} and {@link ResizeScope}. */
declare function useColumnWidths({ on, scope, columns, path, usePersistedState }: UseColumnWidthsArgs): ColumnWidths;
/** The drag target at a header's right edge. Invisible until hovered
 *  (then a grip line), `col-resize` cursor throughout. `stopPropagation`
 *  on click keeps a drag from also toggling the header's sort. */
declare function ColumnResizeHandle({ col, widths }: {
    col: string;
    widths: ColumnWidths;
}): react_jsx_runtime.JSX.Element;

export { columnFingerprint as A, parseWidths as B, type ColumnResizeConfig as C, DEFAULT_FULL_LOAD_MAX_BYTES as D, ELIDE_DEFAULTS as E, scopeKey as F, serializeWidths as G, useColumnWidths as H, NUMERIC_ALIGN as N, type ResolvedElide as R, type SortComparators as S, type TableViewerOptions as T, type UseColumnWidthsArgs as U, type TableColumn as a, type TableCellCtx as b, type TableCellRenderer as c, type TableColumnProps as d, type TableHeaderCtx as e, type TableHeaderRenderer as f, type SortDir as g, type SortState as h, compareValues as i, useSortedRows as j, type ElideCell as k, type ElideConfig as l, type ElideCtx as m, TD_STYLE as n, TH_STYLE as o, type TablePageCtx as p, applyElide as q, cellTitle as r, sortGlyph as s, elideCellStyle as t, useSort as u, resolveColStyles as v, resolveElide as w, ColumnResizeHandle as x, type ColumnWidths as y, type ResizeScope as z };
