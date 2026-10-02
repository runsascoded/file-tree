import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { Compressors } from 'hyparquet';
import { Store } from '../index.cjs';
import { P as ParquetColumn, a as ParquetColumnStats } from '../parquetData-CKgKDo60.cjs';
export { N as NUMERIC_TYPES, b as ParquetMeta, R as RG_CACHE_SIZE, c as RowGroupInfo, T as TemporalColumn, d as TemporalFormat, e as TemporalPrecision, f as TemporalSource, g as TemporalUnit, h as coarseKind, i as formatTemporal, j as inferColumnFormats, k as inferTemporalFormat, r as readParquetRows, t as toMillis, u as useAllRows, l as useParquetMeta, m as useRowGroup } from '../parquetData-CKgKDo60.cjs';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { d as TableCellCtx, e as TableCellRenderer, h as TableColumnProps, i as TableHeaderCtx, T as TableViewerOptions } from '../columnResize-B7qeVwqU.cjs';
export { D as DittoOption, P as PathMode, b as PathsOption, R as RunMode, c as RunSpec, a as TableColumn, j as TableHeaderRenderer, f as TableRun, g as chainCellRenderers, r as repeatsAbove } from '../columnResize-B7qeVwqU.cjs';
export { dittoMark, dittoRenderer } from './ditto.cjs';
export { defaultCompressors, withDefaultCompressors } from './parquetCompressors.cjs';

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
    /** Drop columns whose value is constant across the whole file from the
     *  grid, stating each once above the table (`bucket = marin-us-east5`) —
     *  zero information lost, a column of width recovered. Read from the
     *  footer ({@link constantColumns}): a column folds only when every row
     *  group's stats agree on one non-null value, so a file without stats
     *  folds nothing.
     *
     *  Default `false` — folding a column out of the grid is surprising, and
     *  a reader may want the constant column visible regardless. Parquet-only
     *  (CSV never has whole-file stats). */
    foldConstantColumns?: boolean;
    /** Extra/override hyparquet decompressors, merged over the built-in
     *  `defaultCompressors` (which already decodes ZSTD via `fzstd`). Pass e.g.
     *  `hyparquet-compressors`' set for brotli/gzip/lz4. Keep it referentially
     *  stable (a module-level constant): a new object re-decodes. */
    compressors?: Compressors;
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
declare function ParquetViewer({ store, path, usePersistedState, renderCell, renderHeader, cellProps, headerProps, inferTimestamps, alignNumeric, columnPicker, hiddenColumns, fullLoadMaxBytes, sortComparators, pageSize, ditto, paths, foldConstantColumns, compressors, onPage, onCellHover, elide, resizableColumns }: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
} & ParquetViewerOptions): react_jsx_runtime.JSX.Element;

export { type ParquetCellCtx, type ParquetCellRenderer, ParquetColumn, type ParquetColumnProps, ParquetColumnStats, type ParquetHeaderCtx, type ParquetHeaderRenderer, ParquetViewer, type ParquetViewerOptions, TableCellCtx, TableCellRenderer, TableColumnProps, TableHeaderCtx, TableViewerOptions, ParquetViewer as default, makeParquetViewer };
