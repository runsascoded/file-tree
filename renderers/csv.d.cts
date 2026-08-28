import * as react_jsx_runtime from 'react/jsx-runtime';
import { Store } from '../index.cjs';
export { HEADER_PROBE_BYTES, PAGE_BYTES, parseLine, useCsvHeader, useCsvPage } from './csvData.cjs';
import { TableViewerOptions, TableColumn } from './table.cjs';
export { TableCellCtx, TableCellRenderer } from './table.cjs';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
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
declare function CsvViewer({ store, path, delimiter, usePersistedState, renderCell, renderHeader, cellProps, headerProps, columnPicker, hiddenColumns }: {
    store: Store;
    path: string;
    delimiter: string;
    usePersistedState?: PersistedState;
} & CsvViewerOptions): react_jsx_runtime.JSX.Element;

export { CsvViewer, type CsvViewerOptions, TableColumn, TableViewerOptions, CsvViewer as default, makeCsvViewer };
