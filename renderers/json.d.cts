import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';

interface JsonValueCtx {
    /** The scalar itself (string / number / boolean / null). */
    value: unknown;
    /** jq-style path to it, e.g. `.foo[0].bar`. */
    path: string;
    /** Object key it sits under; `undefined` for array elements + root. */
    key?: string;
    /** What the tree would have rendered for it. */
    defaultNode: ReactNode;
}
/** Per-scalar render hook: called for every string / number / boolean /
 *  null in the document; return `ctx.defaultNode` for the ones you don't
 *  care about. Use it to annotate domain-specific values — epoch
 *  timestamps as dates, byte counts as KiB, ids as names:
 *
 *    renderValue: ({ key, value, defaultNode }) =>
 *      key === 'ts' && typeof value === 'number'
 *        ? <>{defaultNode} <em>{new Date(value * 1000).toISOString()}</em></>
 *        : defaultNode
 *
 *  Containers (objects / arrays) are not passed through it — they own
 *  the disclosure carets and child layout. */
type JsonValueRenderer = (ctx: JsonValueCtx) => ReactNode;
/** Build a `jsonRenderer` with per-value decoration. `renderJsonTree` is
 *  this with no options; both take `(source, usePersistedState?)`. */
declare function makeJsonTreeRenderer({ renderValue }?: {
    renderValue?: JsonValueRenderer;
}): (source: string, usePersistedState?: PersistedState) => react_jsx_runtime.JSX.Element;
/** Accepts an optional `usePersistedState` hook; the default
 *  `renderJsonTree` (no second arg) wires plain `useState`. Consumers
 *  who want URL state pass `useUrlPersistedState` via `<FileTree>`'s
 *  `jsonRenderer` and forward it. */
declare const renderJsonTree: (source: string, usePersistedState?: PersistedState) => react_jsx_runtime.JSX.Element;

export { type JsonValueCtx, type JsonValueRenderer, makeJsonTreeRenderer, renderJsonTree };
