import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, CSSProperties, MouseEvent, PointerEvent } from 'react';
import { P as PersistedState } from './persistedState-CB_wfbcb.cjs';

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

/** How a run of equal values in a column is drawn:
 *  - `'mark'`: every cell after the first renders `〃` (value on its title).
 *  - `'sticky'`: the run's cells merge into one, whose value floats at the
 *    top of the run's visible part as the table scrolls.
 *  - `'line'`: the first cell shows the value; a thin rule runs down through
 *    the rest and ends with a tick on the run's last row.
 *  - `'arrow'`: `'line'`, ending in an arrowhead instead of a tick.
 *  - `'none'`: runs are computed (see `TableCellCtx.run`) but not drawn — a
 *    `renderCell` draws its own treatment. */
type RunMode = 'mark' | 'sticky' | 'line' | 'arrow' | 'none';
interface RunSpec {
    mode: RunMode;
    /** Key a run on this instead of the raw value: e.g. a relative-time
     *  bucket ("5w ago"), so rows a second apart don't break the run. A
     *  `null`/`undefined` key, like an empty value, is never part of a run. */
    key?: (value: unknown, row: Record<string, unknown>) => unknown;
    /** Shortest run to collapse. Default 2. */
    min?: number;
}
/** The viewers' `ditto` option: a list of columns (each `'mark'`), or a
 *  mode / {@link RunSpec} per column. */
type DittoOption = readonly string[] | Readonly<Record<string, RunMode | RunSpec>>;
interface ResolvedRunSpec {
    mode: RunMode;
    key?: (value: unknown, row: Record<string, unknown>) => unknown;
    min: number;
}
/** A cell's place in a run of equal values, on the current page. */
interface TableRun {
    /** First cell of the run. */
    start: boolean;
    /** Last cell of the run. */
    end: boolean;
    /** Cells in the run. */
    length: number;
    /** This cell's position in the run, from 0. */
    index: number;
}
/** How a column of `/`-separated paths is drawn:
 *  - `'dim'`: the whole segments shared with the row above render dimmed.
 *  - `'tree'`: consecutive rows with the same parent are grouped under a
 *    parent row showing that parent once; the rows show only their tail.
 *    Only when the page is sorted by the column; otherwise `'dim'`. */
type PathMode = 'dim' | 'tree';
/** The viewers' `paths` option: a list of columns (each `'dim'`), or a mode
 *  per column. */
type PathsOption = readonly string[] | Readonly<Record<string, PathMode>>;
declare function normalizeDitto(ditto: DittoOption | undefined): Map<string, ResolvedRunSpec>;
declare function normalizePaths(paths: PathsOption | undefined): Map<string, PathMode>;
/** The value a run is keyed on, or `undefined` when the cell can't be part
 *  of one (an empty value, or a key that maps to `null`/`undefined`). */
declare function runKey(spec: Pick<ResolvedRunSpec, 'key'>, value: unknown, row: Record<string, unknown>): unknown;
/** Runs of equal keys in `column`, one entry per row: `undefined` for a row
 *  in no run (its own value, an empty value, or a run shorter than `min`).
 *  Keys compare with `Object.is`. */
declare function computeRuns(rows: readonly Record<string, unknown>[], column: string, spec: Pick<ResolvedRunSpec, 'key' | 'min'>): (TableRun | undefined)[];
/** Length of the leading `scheme://` of a path, or 0. A scheme counts as
 *  part of the path's first segment, so `gs://` alone is never "shared". */
declare function schemeLength(p: string): number;
/** Length of the prefix `a` shares with `b` in whole `/`-segments: up to
 *  and including the last `/` both have in common, past any scheme. */
declare function sharedPathPrefix(a: string, b: string): number;
/** Split a path into its parent (through the last `/`) and its tail. A
 *  trailing `/` (a directory) stays on the tail: `a/b/` → `['a/', 'b/']`.
 *  A path with no parent past its scheme has parent `''`. */
declare function splitParent(p: string): [string, string];
/** Whether `rows` are in order (ascending or descending, per
 *  `compareValues`) by `column` — a page sorted by it, by the viewer or by
 *  nature. */
declare function isSortedBy(rows: readonly Record<string, unknown>[], column: string): boolean;
/** One row of the rendered body: a data row (`i` indexes the page), or a
 *  synthetic parent row that `'tree'` path mode inserts above a group. */
type BodyItem = {
    kind: 'row';
    i: number;
    tree?: {
        last: boolean;
    };
} | {
    kind: 'parent';
    column: string;
    prefix: string;
    first: number;
};
/** The page as the body draws it. */
interface TableLayout {
    items: BodyItem[];
    /** Per run column, one entry per page row (see {@link computeRuns}). */
    runs: Map<string, (TableRun | undefined)[]>;
    specs: Map<string, ResolvedRunSpec>;
    /** Per path column, the mode in effect on this page (`'tree'` falls back
     *  to `'dim'` on an unsorted page). */
    paths: Map<string, PathMode>;
    /** The column grouping rows into a tree, if any. */
    tree?: string;
    /** A note per column whose requested mode isn't in effect, for its
     *  header's tooltip. */
    notes: Map<string, string>;
}
declare const TREE_FALLBACK_NOTE = "Paths group into a tree only when sorted by this column; showing shared prefixes dimmed.";
/** The path mode in effect per `paths` column on a page: `'tree'` needs
 *  the page sorted by its column (else `'dim'`, with a note for the header),
 *  and only one column can group rows — a second `'tree'` column gets
 *  `'dim'`. Cheap (one pass per `'tree'` column), so a viewer can call it
 *  for header notes without memoizing. */
declare function pathModes(rows: readonly Record<string, unknown>[], columns: readonly Pick<TableColumn, 'name'>[], paths: PathsOption | undefined): Pick<TableLayout, 'paths' | 'tree' | 'notes'>;
/** Lay out a page: runs for the `ditto` columns, the path mode in effect
 *  per `paths` column (see {@link pathModes}), and — with a `'tree'`
 *  column — the parent rows to insert. */
declare function tableLayout(rows: readonly Record<string, unknown>[], columns: readonly Pick<TableColumn, 'name'>[], opts: {
    ditto?: DittoOption;
    paths?: PathsOption;
}): TableLayout;

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
    /** The row `dRow` positions from this one, in display order (after
     *  sort/filter) *on the current page*: `at(-1)` is the row above, `at(1)`
     *  the row below, `at(0)` this row. `undefined` past either edge of the
     *  page. Lazy — a renderer that never calls it costs nothing — so it's the
     *  seam for anything that depends on neighboring rows (run collapsing, deltas,
     *  group boundaries); see {@link repeatsAbove}, `dittoRenderer`. */
    at: (dRow: number) => Record<string, unknown> | undefined;
    /** @deprecated `at(-1)`. A getter over it, so equally lazy. */
    readonly prevRow?: Record<string, unknown>;
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
    /** This cell's place in a run of equal values on the page, for a column
     *  listed in the viewer's `ditto` option; `undefined` otherwise, or when
     *  the cell is in no run. A `ditto` mode of `'none'` computes runs without
     *  drawing them, so a `renderCell` can draw its own. */
    run?: TableRun;
}
/** Per-cell render hook: called for every cell, decorate the ones you
 *  care about and return `ctx.defaultNode` for the rest. Mirrors
 *  `renderCell` (dir listing) and `renderValue` (JSON tree) — the
 *  library hands back the node it would have rendered and gets out of
 *  the way. */
type TableCellRenderer<C extends TableColumn = TableColumn> = (ctx: TableCellCtx<C>) => ReactNode;
/** Build a {@link TableCellCtx}, with `prevRow` as a lazy getter over `at`. */
declare function tableCellCtx<C extends TableColumn>(ctx: Omit<TableCellCtx<C>, 'prevRow'>): TableCellCtx<C>;
/** Compose cell renderers left to right: each receives the previous one's
 *  output as `defaultNode`, so a stage that returns `defaultNode` for cells it
 *  doesn't touch passes them through. `undefined` stages are skipped, so an
 *  optional renderer can be chained unconditionally. E.g.
 *  `chainCellRenderers(dittoRenderer(['owner']), formatMoney)` — `formatMoney`
 *  sees the ditto mark as `defaultNode` on a repeated `owner`. */
declare function chainCellRenderers<C extends TableColumn>(...renderers: readonly (TableCellRenderer<C> | undefined)[]): TableCellRenderer<C> | undefined;
/** Whether this cell's value repeats the row above's (same column, on the
 *  page). `Object.is`, so a run of equal strings/numbers counts but two
 *  distinct `Date`/blob objects (ref-unequal) never do. The first row of a
 *  page has nothing above it, so never repeats. */
declare function repeatsAbove(ctx: Pick<TableCellCtx, 'value' | 'column' | 'at'>): boolean;
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
    /** Rows per page, for viewers that paginate by *rows* — parquet, which
     *  pages within a row group. Ignored where a viewer paginates by bytes
     *  (CSV reads fixed byte ranges, so it has no rows-per-page). Default
     *  100. */
    pageSize?: number;
    /** Columns whose runs of equal values collapse, so the eye lands where
     *  a column changes. A list of names draws each run with a ditto mark
     *  (`〃`, value on its title); a record picks a mode per column — `'mark'`,
     *  `'sticky'` (one merged cell whose value floats at the top of the run's
     *  visible part), `'line'` (a rule down the run), or `'none'` (computed
     *  for `ctx.run`, not drawn) — optionally with a `key` (run on a derived
     *  value, e.g. a relative-time bucket) and a `min` length. See
     *  {@link RunSpec}.
     *
     *  Runs are computed on the rendered page in display order, so a run
     *  spanning a page boundary restarts. Empty values never join a run.
     *  `'mark'`/`'line'` chain ahead of `renderCell` (which receives the mark
     *  as `defaultNode`); a `'sticky'` run renders its first cell only. */
    ditto?: DittoOption;
    /** Columns holding `/`-separated paths, drawn so the part that changes
     *  stands out. A list of names dims, in each row, the whole segments it
     *  shares with the row above; a record picks `'dim'` or `'tree'` per column
     *  (`'tree'`: rows with a common parent are grouped under one parent row,
     *  and show only their tail — when the page is sorted by that column, else
     *  `'dim'`, noted in the header's tooltip). The cell's title is always the
     *  full path, and copying it yields the full path. A `scheme://` counts as
     *  part of the first segment. See {@link PathMode}. */
    paths?: PathsOption;
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
    /** The underlying scalar as text, when the cell shows a lossy
     *  *interpretation* of it (a temporal integer drawn as a date; later, a
     *  formatted number). Absent when the cell shows the value verbatim. A
     *  rich tooltip can surface this ("raw: …") alongside {@link text}. */
    raw?: string;
    /** The node the cell renders (the viewer default, or a consumer
     *  `renderCell`), for a tooltip render-prop to wrap. */
    node: ReactNode;
    column: C;
    row: Record<string, unknown>;
    path: string;
}
/** Which side of a too-wide value the ellipsis consumes. See
 *  {@link ElideConfig.ellipsis}. */
type EllipsisMode = 'end' | 'start' | 'middle';
/** How many trailing characters `ellipsis: 'middle'` keeps verbatim — the
 *  informative tail of a path (shard id, step, extension). Matches mgu's
 *  `elideMid` default. */
declare const MIDDLE_TAIL = 12;
/** How a table viewer handles a value too wide for its column: the clip,
 *  and the tooltip that brings the clipped tail back. Every field has a
 *  default (see {@link ELIDE_DEFAULTS}); the top-level `elide: true` preset
 *  binds them all, and each is independently overridable — so a consumer
 *  moves along one axis without restating the rest.
 *
 *  `ellipsis` (below) is the newest axis: where the value is clipped, not
 *  just how wide the column is. */
interface ElideConfig<C extends TableColumn = TableColumn> {
    /** The column's width cap. A CSS length clips and ellipsizes overflow;
     *  `false` renders at natural width so an outer scroller can reveal the
     *  whole column (the "wide mode" escape hatch). Default `'30em'`. */
    maxWidth?: string | false;
    /** Which side of a clipped value the ellipsis eats — the informative
     *  characters differ by column, so this is per-column:
     *   - `'end'` (default): CSS clip, `checkpoints/adam-lr1.00e-…`. Right for
     *     prose; useless for keys that share a long prefix (every row shows
     *     the same head, the ellipsis hides the only part that differs).
     *   - `'start'`: keep the tail, `…step-042000/shard-00000.safetensors`.
     *     Pure CSS (`direction: rtl` on the cell + a `<bdi>` around the value,
     *     so a path's own characters keep their order). The prefix-sharing fix.
     *   - `'middle'`: keep both ends, `checkpoints/adam-…00000.safetensors`.
     *     Pure CSS too — a flex `head`(clip-end) + fixed last-{@link MIDDLE_TAIL}
     *     chars `tail` — no measurement. Only splits a **string** cell rendered
     *     by default (a custom `renderCell` or non-string value falls back to
     *     `'end'`, since there's no text to split).
     *
     *  A bare mode applies to every column; a `{ name: 'start' }` record or a
     *  `(column) => mode` picks per column — a table mixes paths (tail matters)
     *  with prose (head matters). Default `'end'`. */
    ellipsis?: EllipsisMode | Partial<Record<string, EllipsisMode>> | ((column: C) => EllipsisMode | undefined);
    /** Surface the native `title` only when the cell is *measured* to clip
     *  its value — a tooltip that just repeats a fully-visible value is
     *  noise. Default `true`. `false` = a title on every scalar, as before.
     *
     *  Measured on hover (`scrollWidth > clientWidth`, see
     *  {@link cellClipped}), so it costs nothing until a pointer arrives —
     *  no per-cell `ResizeObserver`. Governs the `'native'` strategy; an
     *  *interpreted* cell (see {@link ElideCtx.raw}) titles regardless, since
     *  its tooltip shows something the cell doesn't. A `tooltip` render-prop
     *  owns its own hover, so gate it there ({@link cellClipped} on the
     *  `<td>`), as the reference demo does. */
    onlyWhenClipped?: boolean;
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
    onlyWhenClipped: boolean;
    /** Per-column ellipsis mode, normalized from {@link ElideConfig.ellipsis}'s
     *  mode / record / function shapes. Defaults to `'end'`. */
    ellipsis: (column: C) => EllipsisMode;
}
/** The batteries-included preset `elide: true` (and the absent default)
 *  resolve to: clip at 30em, recover the full value via a native `title`,
 *  shown only where the value actually clips, ellipsis at the end. */
declare const ELIDE_DEFAULTS: ResolvedElide;
/** Fold an `elide` option down to a fully-resolved strategy. `true`/absent
 *  → the {@link ELIDE_DEFAULTS} preset; `false` → clip and tooltip both off;
 *  an object → the preset with its axes overridden. */
declare function resolveElide<C extends TableColumn>(elide: ElideConfig<C> | boolean | undefined): ResolvedElide<C>;
/** The style contribution of an elide strategy: only the width cap, since
 *  the clip idiom (`nowrap`/`overflow`/`ellipsis`) already lives in
 *  {@link TD_STYLE}. `maxWidth: false` → `'none'` (natural width). */
declare function elideCellStyle(el: ResolvedElide): CSSProperties;
/** Whether a cell clips its content — its full text is wider than the box,
 *  so the ellipsis is actually hiding something. The measurement behind
 *  `onlyWhenClipped`, and the blessed check for a `tooltip` render-prop that
 *  wants to open only on clipped cells: call it in the tooltip's own hover
 *  handler with the `<td>` (a length heuristic mis-fires on narrow columns
 *  and under `maxWidth: false`). The `+1` absorbs sub-pixel rounding. */
declare function cellClipped(el: HTMLElement): boolean;
/** The per-cell result of an elide strategy: what to hang on the `<td>` for
 *  the native tooltip — either a static `title`, or an `onMouseEnter` that
 *  sets one only once the cell is measured to clip ({@link cellClipped}) —
 *  and the node to render (possibly a tooltip render-prop's wrapper). */
interface ElideCell {
    title?: string;
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    node: ReactNode;
}
/** Apply an elide strategy's *tooltip* to one cell — the width cap is a
 *  style concern ({@link elideCellStyle}); this is the tooltip half.
 *  `hasCustomRender` (a `renderCell` replaced the default node, so owns its
 *  own title) gates the `'native'` default, but a tooltip render-prop
 *  applies regardless. */
declare function applyElide<C extends TableColumn>(el: ResolvedElide<C>, args: {
    value: unknown;
    node: ReactNode;
    hasCustomRender: boolean;
    column: C;
    row: Record<string, unknown>;
    path: string;
    raw?: string;
    ellipsis?: EllipsisMode;
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
/** Header cells earn a visible distinction from the body — on a dark
 *  background `fontWeight: 500` with a hairline border read as just
 *  another row. A heavier weight, a 2px rule, and a faint grey tint (a
 *  neutral that works in either theme) set the header apart by default;
 *  a consumer overrides any of it via `headerProps`. */
declare const TH_STYLE: CSSProperties;
declare const NUMERIC_ALIGN: CSSProperties;
/** Resolve per-column `<td>`/`<th>` styling once per column rather than
 *  once per cell — the hooks are pure in `(column, path)`, and a table
 *  is mostly cells. */
declare function resolveColStyles<C extends TableColumn>(columns: readonly C[], path: string, opts: Pick<TableViewerOptions<C>, 'cellProps' | 'headerProps'>, isNumeric: (col: C) => boolean, el?: ResolvedElide): Map<string, ColStyle>;
/** Per-column resolved styling, plus the ellipsis mode a viewer applies to
 *  the cell node at render time (see `ellipsisWrap`). */
interface ColStyle {
    cell: CSSProperties;
    header: CSSProperties;
    ellipsis: EllipsisMode;
    cellClass?: string;
    headerClass?: string;
}

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

export { elideCellStyle as $, runKey as A, type BodyItem as B, schemeLength as C, type DittoOption as D, sharedPathPrefix as E, splitParent as F, tableLayout as G, type ColStyle as H, type ColumnResizeConfig as I, ELIDE_DEFAULTS as J, type ElideCell as K, type ElideConfig as L, type ElideCtx as M, type EllipsisMode as N, MIDDLE_TAIL as O, type PathMode as P, NUMERIC_ALIGN as Q, type RunMode as R, type SortComparators as S, type TableViewerOptions as T, type ResolvedElide as U, TD_STYLE as V, TH_STYLE as W, type TablePageCtx as X, applyElide as Y, cellClipped as Z, cellTitle as _, type TableColumn as a, resolveColStyles as a0, resolveElide as a1, tableCellCtx as a2, ColumnResizeHandle as a3, type ColumnWidths as a4, type ResizeScope as a5, type UseColumnWidthsArgs as a6, columnFingerprint as a7, parseWidths as a8, scopeKey as a9, serializeWidths as aa, useColumnWidths as ab, type PathsOption as b, type RunSpec as c, type TableCellCtx as d, type TableCellRenderer as e, type TableRun as f, chainCellRenderers as g, type TableColumnProps as h, type TableHeaderCtx as i, type TableHeaderRenderer as j, DEFAULT_FULL_LOAD_MAX_BYTES as k, type SortDir as l, type SortState as m, compareValues as n, useSortedRows as o, type ResolvedRunSpec as p, TREE_FALLBACK_NOTE as q, repeatsAbove as r, sortGlyph as s, type TableLayout as t, useSort as u, computeRuns as v, isSortedBy as w, normalizeDitto as x, normalizePaths as y, pathModes as z };
