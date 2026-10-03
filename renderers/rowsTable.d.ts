import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
import { TableBrowserOptions } from './tableBrowser.js';
import { MemoryTableOptions } from './memoryTableSource.js';
export { inferColumns, inferKind, memoryTableSource, singleTableCatalog } from './memoryTableSource.js';
import 'react';
import '../columnResize-1aLrril6.js';
import './tableSource.js';

interface RowsTableOptions extends TableBrowserOptions, MemoryTableOptions {
}
declare function RowsTable({ rows, columns, sortComparators, path, usePersistedState, ...browser }: {
    rows: readonly Record<string, unknown>[];
    /** Passed to `renderCell` & co., and keys remembered column widths. */
    path?: string;
    usePersistedState?: PersistedState;
} & RowsTableOptions): react_jsx_runtime.JSX.Element;

export { MemoryTableOptions, RowsTable, type RowsTableOptions, RowsTable as default };
