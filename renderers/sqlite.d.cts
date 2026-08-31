import * as react_jsx_runtime from 'react/jsx-runtime';
import { Store } from '../index.cjs';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { SqliteWasmSource, SqliteRuntime } from '../sqlite/db.cjs';
import { SqliteTableSourceOptions } from '../sqlite/tableSource.cjs';
import { StoreVFSOptions } from '../sqlite/vfs.cjs';
import { TableBrowserOptions } from './tableBrowser.cjs';
export { DEFAULT_PAGE_SIZE } from './tableBrowser.cjs';
import './tableSource.cjs';
import '../table-ZN60aKsl.cjs';
import 'react';

interface SqliteViewerOptions extends TableBrowserOptions, SqliteTableSourceOptions {
    /** Where the SQLite wasm comes from. Required — the library can't
     *  guess a URL that works under an arbitrary bundler, and baking one
     *  in would put a megabyte in everyone's bundle. Under Vite:
     *
     *      import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url'
     *      <SqliteViewer wasm={{ wasmUrl }} … />
     */
    wasm: SqliteWasmSource;
    /** Share one instantiated wasm runtime across viewers. */
    runtime?: SqliteRuntime;
    /** Block sizes and cache ceiling for the underlying `StoreVFS`. A
     *  Worker proxying this should raise them; a browser on a slow link
     *  should not. */
    vfs?: StoreVFSOptions;
    /** Show the ranged-read counter — how many requests this view has
     *  actually made, and how many it served from cache. Off by default;
     *  it explains the design more than it helps a reader. */
    showStats?: boolean;
}
declare function SqliteViewer({ store, path, usePersistedState, wasm, runtime, vfs, showStats, countRows, ...browser }: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
} & SqliteViewerOptions): react_jsx_runtime.JSX.Element;

export { SqliteViewer, type SqliteViewerOptions, SqliteViewer as default };
