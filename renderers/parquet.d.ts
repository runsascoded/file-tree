import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { Store } from '../index.js';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
import { TableCellCtx, TableColumn, TableCellRenderer, TableColumnProps, TableHeaderCtx, TableViewerOptions } from './table.js';
export { TableHeaderRenderer } from './table.js';

/** Temporal inference + formatting for tabular cells.
 *
 *  Epoch integers are the single worst-reading thing in a data table:
 *  `1777075200000` is correct, unreadable, and usually the column you
 *  scan most. This module decides whether a column *is* temporal and,
 *  if so, how precisely to print it.
 *
 *  **Signals, strongest first, stop at first hit:**
 *
 *  a. **Type annotation** — `TIMESTAMP(unit)` / `DATE`, via either the
 *     modern `logical_type` or the legacy `converted_type`.
 *     Unambiguous and free, but absent from a lot of real files: a
 *     pyramid/DuckDB-style writer often emits epoch millis as a bare
 *     `INT64` with no annotation at all.
 *  b. **Value range** — every sampled value landing inside one unit's
 *     plausible-epoch window (see `WINDOWS`). The windows sit ~3 orders
 *     of magnitude apart, so cross-*unit* confusion isn't a real risk;
 *     the risk is a non-temporal integer (an id, a byte count) landing
 *     in a window. Hence:
 *  c. **Name as a gate, not a trigger** — (b) only applies to a column
 *     whose name already looks temporal. A large-integer `id` column
 *     must never become a date, and a name alone must never be enough
 *     (a `date` column of strings is already fine as-is).
 *
 *  When the signals disagree, render raw: a silently mis-rendered
 *  timestamp is worse than a visible integer. */
/** How to interpret a raw numeric value as a point in time. */
type TemporalUnit = 'DAYS' | 'SECONDS' | 'MILLIS' | 'MICROS' | 'NANOS';
/** How much of the time to print. Chosen from the sampled values'
 *  alignment, so a column of midnight-aligned days doesn't render as a
 *  wall of zeros. */
type TemporalPrecision = 'day' | 'min' | 'sec' | 'ms';
/** Which signal produced the interpretation — `inferred` is the
 *  heuristic (b+c) and is worth surfacing in UI, since it's a guess. */
type TemporalSource = 'logical' | 'converted' | 'inferred';
interface TemporalFormat {
    unit: TemporalUnit;
    precision: TemporalPrecision;
    source: TemporalSource;
}
/** Structural subset of a column descriptor that inference reads.
 *  Declared here (rather than imported) so this module stays free of
 *  renderer/parquet imports; callers pass any compatible shape. */
interface TemporalColumn {
    name: string;
    /** Parquet physical type, e.g. `INT64`, `DOUBLE`, `BYTE_ARRAY`. */
    physicalType?: string;
    /** Logical-type annotation, e.g. `TIMESTAMP`, `DATE`, `STRING`. */
    logicalType?: string;
    /** Unit of a `TIMESTAMP` / `TIME` logical type. */
    timeUnit?: 'MILLIS' | 'MICROS' | 'NANOS';
    /** Legacy converted-type annotation, e.g. `TIMESTAMP_MILLIS`. */
    convertedType?: string;
}
/** Interpret a raw cell as epoch milliseconds, or `null` if it isn't a
 *  number-like value. `Date`s short-circuit the unit: a reader that
 *  understood the file's annotation (hyparquet does this for
 *  `TIMESTAMP`/`DATE` columns) has already done the conversion. */
declare function toMillis(v: unknown, unit: TemporalUnit): number | null;
/** Decide whether `col` is temporal, and how precisely to print it.
 *  `values` must be re-iterable (it's traversed more than once).
 *
 *  `infer` gates only the heuristic — annotated `TIMESTAMP`/`DATE`
 *  columns still format when it's off. */
declare function inferTemporalFormat(col: TemporalColumn, values: Iterable<unknown>, { infer }?: {
    infer?: boolean;
}): TemporalFormat | null;
/** Render a cell as a UTC instant, or `null` if it isn't one.
 *  Always UTC with an explicit `Z`: these are analytical files, and
 *  coercing to local time invents a timezone the data doesn't carry. */
declare function formatTemporal(v: unknown, fmt: TemporalFormat): string | null;
/** Per-column formats for a page of rows, keyed by column name.
 *  Columns with no temporal reading are absent from the map. */
declare function inferColumnFormats(cols: TemporalColumn[], rows: Record<string, unknown>[] | null, opts?: {
    infer?: boolean;
}): Map<string, TemporalFormat>;

/** A leaf column of the file's schema. Passed to `renderCell` so a
 *  consumer can key off type as well as name — the parquet-specific
 *  detail (`physicalType`, `logicalType`, …) rides on top of the
 *  format-neutral `TableColumn` every table viewer shares. */
interface ParquetColumn extends TemporalColumn, TableColumn {
}
type ParquetCellCtx = TableCellCtx<ParquetColumn>;
type ParquetCellRenderer = TableCellRenderer<ParquetColumn>;
/** Per-column statistics from the current row group's footer metadata.
 *  Not reconstructible from the decoded rows a consumer sees — the
 *  footer is only ever read here. Absent when the writer omitted it. */
interface ParquetColumnStats {
    min?: unknown;
    max?: unknown;
    nullCount?: number;
}
/** Parquet's header ctx adds row-group statistics — not reconstructible
 *  from the decoded rows a consumer sees, since only the viewer reads
 *  the footer. */
interface ParquetHeaderCtx extends TableHeaderCtx<ParquetColumn> {
    /** Stats for the row group currently on screen, when the footer
     *  carries them — so the range moves as you page. */
    stats?: ParquetColumnStats;
}
type ParquetHeaderRenderer = (ctx: ParquetHeaderCtx) => ReactNode;
type ParquetColumnProps = TableColumnProps<ParquetColumn>;
interface ParquetViewerOptions extends TableViewerOptions<ParquetColumn> {
    /** Narrowed from `TableViewerOptions` to carry `stats`. */
    renderHeader?: ParquetHeaderRenderer;
    /** Apply the epoch-range heuristic to unannotated numeric columns
     *  (signals b+c). Default `true`. Turning it off keeps annotated
     *  `TIMESTAMP`/`DATE` columns formatted — it only suppresses the
     *  guess. */
    inferTimestamps?: boolean;
    /** Right-align numeric columns with `tabular-nums`, so digits line up
     *  down the column and magnitudes are comparable at a glance.
     *  Default `true`. Columns read as temporal are excluded — they
     *  render as text, not quantities. */
    alignNumeric?: boolean;
}
/** Base cell/header styling, hoisted so per-column overrides merge over
 *  a single source of truth rather than a literal inlined in JSX. */
/** Build a parquet viewer with per-cell decoration and/or the epoch
 *  heuristic disabled. Call at module scope — each call produces a new
 *  component type, so calling it during render would remount the table
 *  on every pass. `ParquetViewer` is this with no options. */
declare function makeParquetViewer(opts?: ParquetViewerOptions): (props: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
} & ParquetViewerOptions) => react_jsx_runtime.JSX.Element;
declare function ParquetViewer({ store, path, usePersistedState, renderCell, renderHeader, cellProps, headerProps, inferTimestamps, alignNumeric }: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
} & ParquetViewerOptions): react_jsx_runtime.JSX.Element;

export { type ParquetCellCtx, type ParquetCellRenderer, type ParquetColumn, type ParquetColumnProps, type ParquetColumnStats, type ParquetHeaderCtx, type ParquetHeaderRenderer, ParquetViewer, type ParquetViewerOptions, TableCellCtx, TableCellRenderer, TableColumn, TableColumnProps, TableHeaderCtx, TableViewerOptions, type TemporalColumn, type TemporalFormat, type TemporalPrecision, type TemporalSource, type TemporalUnit, ParquetViewer as default, formatTemporal, inferColumnFormats, inferTemporalFormat, makeParquetViewer, toMillis };
