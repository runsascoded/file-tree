import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { Store } from '../index.cjs';
import { P as ParquetColumn, a as ParquetColumnStats } from '../parquetData-f-woyz58.cjs';
export { N as NUMERIC_TYPES, b as ParquetMeta, R as RG_CACHE_SIZE, c as RowGroupInfo, T as TemporalColumn, d as TemporalFormat, e as TemporalPrecision, f as TemporalSource, g as TemporalUnit, h as coarseKind, i as formatTemporal, j as inferColumnFormats, k as inferTemporalFormat, t as toMillis, u as useParquetMeta, l as useRowGroup } from '../parquetData-f-woyz58.cjs';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { TableCellCtx, TableCellRenderer, TableColumnProps, TableHeaderCtx, TableViewerOptions } from './table.cjs';
export { TableColumn, TableHeaderRenderer } from './table.cjs';

type ParquetCellCtx = TableCellCtx<ParquetColumn>;
type ParquetCellRenderer = TableCellRenderer<ParquetColumn>;
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
/** LRU cache size for decoded RG rows. Keyed by RG index within the
 *  current `(store, path)`; on revisit of a recently-viewed RG (e.g.
 *  bouncing between two neighboring RGs, or the "row groups (N)"
 *  jump-table), we short-circuit both fetch and decode. Bounded so
 *  a stroll through a 40-RG shard doesn't accumulate a decoded copy
 *  of the entire file in memory — the last 4 RGs give roughly-linear
 *  scan enough runway to feel free. */
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
declare function ParquetViewer({ store, path, usePersistedState, renderCell, renderHeader, cellProps, headerProps, inferTimestamps, alignNumeric, columnPicker, hiddenColumns }: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
} & ParquetViewerOptions): react_jsx_runtime.JSX.Element;

export { type ParquetCellCtx, type ParquetCellRenderer, ParquetColumn, type ParquetColumnProps, ParquetColumnStats, type ParquetHeaderCtx, type ParquetHeaderRenderer, ParquetViewer, type ParquetViewerOptions, TableCellCtx, TableCellRenderer, TableColumnProps, TableHeaderCtx, TableViewerOptions, ParquetViewer as default, makeParquetViewer };
