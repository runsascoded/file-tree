import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { HttpTableCatalogOptions } from './httpTableSource.cjs';
import { TableBrowserOptions } from './tableBrowser.cjs';
import './tableSource.cjs';
import '../table-ZN60aKsl.cjs';
import 'react';

interface RemoteTableViewerOptions extends TableBrowserOptions, Omit<HttpTableCatalogOptions, 'path'> {
}
declare function RemoteTableViewer({ path, usePersistedState, baseUrl, version, fetch: doFetch, capabilities, ...browser }: {
    path: string;
    usePersistedState?: PersistedState;
} & RemoteTableViewerOptions): react_jsx_runtime.JSX.Element;

export { RemoteTableViewer, type RemoteTableViewerOptions, RemoteTableViewer as default };
