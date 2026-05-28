import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';

/** Accepts an optional `usePersistedState` hook; the default
 *  `renderJsonTree` (no second arg) wires plain `useState`. Consumers
 *  who want URL state pass `useUrlPersistedState` via `<FileTree>`'s
 *  `jsonRenderer` and forward it. */
declare function renderJsonTree(source: string, usePersistedState?: PersistedState): react_jsx_runtime.JSX.Element;

export { renderJsonTree };
