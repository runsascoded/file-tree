import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { TableBrowserOptions } from './tableBrowser.cjs';
import { MemoryTableOptions } from './memoryTableSource.cjs';
export { inferColumns, inferKind, memoryTableSource, singleTableCatalog } from './memoryTableSource.cjs';
import 'react';
import '../columnResize-Bskkv32Y.cjs';
import './tableSource.cjs';

interface RowsTableOptions extends TableBrowserOptions, MemoryTableOptions {
}
declare function RowsTable({ rows, columns, sortComparators, path, usePersistedState, ...browser }: {
    rows: readonly Record<string, unknown>[];
    /** Passed to `renderCell` & co., and keys remembered column widths. */
    path?: string;
    usePersistedState?: PersistedState;
} & RowsTableOptions): react_jsx_runtime.JSX.Element;

export { MemoryTableOptions, RowsTable, type RowsTableOptions, RowsTable as default };
