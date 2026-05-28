import * as react_jsx_runtime from 'react/jsx-runtime';
import { Store } from '../index.js';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';

declare function ParquetViewer({ store, path, usePersistedState }: {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
}): react_jsx_runtime.JSX.Element;

export { ParquetViewer };
