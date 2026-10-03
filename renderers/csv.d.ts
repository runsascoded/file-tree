import * as react_jsx_runtime from 'react/jsx-runtime';
import { Store } from '../index.js';
export { HEADER_PROBE_BYTES, PAGE_BYTES, parseLine, useCsvHeader, useCsvPage } from './csvData.js';
import { T as TableViewerOptions, a as TableColumn } from '../columnResize-1aLrril6.js';
export { D as DittoOption, G as GroupRows, P as PathMode, b as PathsOption, R as RowGroup, c as RunMode, d as RunSpec, e as TableCellCtx, f as TableCellRenderer, g as TableRun, h as chainCellRenderers, p as pathGroups, r as repeatsAbove, i as runGroups } from '../columnResize-1aLrril6.js';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
export { dittoMark, dittoRenderer, runRenderer } from './ditto.js';
import 'react';

/** Note `rowIndex` in `renderCell` is **page-relative** here: pages are
 *  byte ranges, so the viewer never learns how many rows preceded them.
 *
 *  CSV columns carry a name and nothing else: the format has no types,
 *  and guessing one from the bytes is the consumer's call — a column of
 *  digits may well be a zip code. So `kind` stays absent, and numeric
 *  alignment (which parquet does from its schema) is off by default
 *  here rather than inferred. */
interface CsvViewerOptions extends TableViewerOptions<TableColumn> {
}
/** Options bound up front, so `<FileTree csvRenderer={…}>` can take a
 *  customized viewer. Module scope: this mints a component type, and
 *  calling it in render would remount the table on every pass. */
declare function makeCsvViewer(opts?: CsvViewerOptions): (props: {
    store: Store;
    path: string;
    delimiter: string;
    usePersistedState?: PersistedState;
}) => react_jsx_runtime.JSX.Element;
declare function CsvViewer({ store, path, delimiter, usePersistedState, renderCell, renderHeader, cellProps, headerProps, columnPicker, hiddenColumns, fullLoadMaxBytes, sortComparators, ditto, paths, groups, onPage, onCellHover, elide, resizableColumns }: {
    store: Store;
    path: string;
    delimiter: string;
    usePersistedState?: PersistedState;
} & CsvViewerOptions): react_jsx_runtime.JSX.Element;

export { CsvViewer, type CsvViewerOptions, TableColumn, TableViewerOptions, CsvViewer as default, makeCsvViewer };
