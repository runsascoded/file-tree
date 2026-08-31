import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, CSSProperties } from 'react';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
import { T as TableViewerOptions } from '../table-BDoOyrVw.js';
import { TableCatalog, TableObject } from './tableSource.js';

/** Rows per page.
 *
 *  Larger than the parquet viewer's row-group pages because the cost is
 *  different in kind: another hundred rows is a longer `LIMIT` against
 *  pages the engine is already holding, not another range request. */
declare const DEFAULT_PAGE_SIZE = 100;
declare const BTN: CSSProperties;
interface TableBrowserOptions extends Omit<TableViewerOptions, 'fullLoadMaxBytes' | 'sortComparators'> {
    pageSize?: number;
    /** Extra chrome for the summary line — a read counter, a latency
     *  readout, whatever the wiring can say that this component can't. */
    status?: ReactNode;
}
/** Render a value the way the engine handed it over.
 *
 *  `null` is shown rather than left blank: in a database the difference
 *  between NULL and the empty string is meaningful, and a blank cell
 *  reads as neither. */
declare function defaultTableCell(value: unknown): ReactNode;
declare function TableBrowser({ catalog, objects, path, usePersistedState, pageSize, status, renderCell, renderHeader, cellProps, headerProps, columnPicker, hiddenColumns, onPage, onCellHover, }: {
    catalog: TableCatalog;
    /** Already fetched by the wiring, which had to open the file anyway. */
    objects: readonly TableObject[];
    path: string;
    usePersistedState?: PersistedState;
} & TableBrowserOptions): react_jsx_runtime.JSX.Element;

export { BTN, DEFAULT_PAGE_SIZE, TableBrowser, type TableBrowserOptions, TableBrowser as default, defaultTableCell };
