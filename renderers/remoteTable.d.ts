import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
import { HttpTableCatalogOptions } from './httpTableSource.js';
import { TableBrowserOptions } from './tableBrowser.js';
import './tableSource.js';
import '../table-BDoOyrVw.js';
import 'react';

interface RemoteTableViewerOptions extends TableBrowserOptions, Omit<HttpTableCatalogOptions, 'path'> {
}
declare function RemoteTableViewer({ path, usePersistedState, baseUrl, version, fetch: doFetch, capabilities, ...browser }: {
    path: string;
    usePersistedState?: PersistedState;
} & RemoteTableViewerOptions): react_jsx_runtime.JSX.Element;

export { RemoteTableViewer, type RemoteTableViewerOptions, RemoteTableViewer as default };
