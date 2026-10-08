import * as react_jsx_runtime from 'react/jsx-runtime';
import { Store } from '../index.cjs';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { RowsTableOptions } from './rowsTable.cjs';
import './tableBrowser.cjs';
import 'react';
import '../columnResize-Bskkv32Y.cjs';
import './tableSource.cjs';
import './memoryTableSource.cjs';

/** Bytes read. Above this, the head is read and its last partial line
 *  dropped. */
declare const JSONL_MAX_BYTES: number;
/** Records kept. */
declare const JSONL_MAX_ROWS = 10000;
interface JsonlParse {
    rows: Record<string, unknown>[];
    /** Lines that weren't valid JSON: 1-based line number + parser message. */
    errors: {
        line: number;
        message: string;
    }[];
    /** More records followed than `maxRows` kept. */
    truncated: boolean;
}
/** Parse line-delimited JSON. Blank lines are skipped; a final line
 *  without a newline counts. */
declare function parseJsonl(text: string, opts?: {
    maxRows?: number;
}): JsonlParse;
interface JsonlViewerOptions extends Omit<RowsTableOptions, 'columns'> {
    maxBytes?: number;
    maxRows?: number;
}
/** Options bound up front, like `makeCsvViewer`. Module scope: this
 *  mints a component type. */
declare function makeJsonlViewer(opts?: JsonlViewerOptions): (props: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
}) => react_jsx_runtime.JSX.Element;
declare function JsonlViewer({ store, path, usePersistedState, maxBytes, maxRows, elide, ...table }: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
} & JsonlViewerOptions): react_jsx_runtime.JSX.Element;

export { JSONL_MAX_BYTES, JSONL_MAX_ROWS, type JsonlParse, JsonlViewer, type JsonlViewerOptions, JsonlViewer as default, makeJsonlViewer, parseJsonl };
