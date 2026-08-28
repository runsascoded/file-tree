import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { a as TableColumn } from '../table-ZN60aKsl.cjs';
import 'react';

interface ColumnVisibility {
    /** Names to render, in schema order. */
    visible: readonly string[];
    toggle: (name: string) => void;
    showAll: () => void;
    hidden: ReadonlySet<string>;
}
/** Which columns to render.
 *
 *  Stored as the *hidden* set rather than the visible one, so that a
 *  file gaining a column shows it by default — an allow-list would
 *  silently hide anything added after the URL was shared.
 *
 *  Goes through `usePersistedState`, so a consumer passing
 *  `useUrlPersistedState` gets `?hide=a,b` and can paste a link to a
 *  column subset. That's most of the point.
 */
declare function useColumnVisibility(columns: readonly TableColumn[], usePersistedState?: PersistedState, initialHidden?: readonly string[]): ColumnVisibility;
/** `columns (5/7)`, opening a checkbox list. Collapsed by default: on a
 *  narrow table it's chrome nobody needs, and the count alone says
 *  whether anything is hidden. */
declare function ColumnPicker({ columns, vis }: {
    columns: readonly TableColumn[];
    vis: ColumnVisibility;
}): react_jsx_runtime.JSX.Element;
/** Free-text filter over the rows the viewer has.
 *
 *  Same idiom as the directory listing's filter and the JSON tree's
 *  search — a plain box, matching anywhere, case-insensitive — rather
 *  than a third thing to learn. Shares `?q=` with them for the same
 *  reason: it's "the search box on this page", and a listing and a file
 *  are never on screen together.
 */
declare function useFilter(usePersistedState?: PersistedState): [string, (v: string) => void];
/** Rows whose *visible* cells contain `q`.
 *
 *  Visible, not all: filtering on a column you've hidden produces rows
 *  with no apparent reason to be there, which reads as a bug. */
declare function filterRows<R extends Record<string, unknown>>(rows: R[] | null, q: string, columns: readonly string[]): R[] | null;
declare function FilterInput({ value, onChange, count, placeholder }: {
    value: string;
    onChange: (v: string) => void;
    /** `matched / total`, shown when filtering. */
    count?: {
        shown: number;
        total: number;
    };
    placeholder?: string;
}): react_jsx_runtime.JSX.Element;
/** Hold a callback in a ref, and return a stable wrapper.
 *
 *  Every outward-facing hook here takes one, because the alternative is
 *  a footgun: a consumer writing `onPage={rows => setRows(rows)}` passes
 *  a new function each render, and an effect depending on it would fire
 *  every render — which, since the callback sets state, never settles.
 *  Requiring `useCallback` on their side would work and would be
 *  forgotten. A ref means the identity simply doesn't matter.
 *
 *  (This — not event volume — is the reason these hooks need care.
 *  `onPage` fires on a click; `onCellHover` on crossing a cell, which a
 *  mouse does a few dozen times a second at most. Neither warrants
 *  throttling; a consumer whose handler is genuinely expensive can wrap
 *  it, and the library guessing a delay would only add latency to
 *  everyone else.) */
declare function useStableCallback<A extends unknown[]>(fn: ((...args: A) => void) | undefined): (...args: A) => void | undefined;
/** Fire `onPage` when the rendered page changes.
 *
 *  Takes a *ref* rather than the context itself, because a viewer only
 *  knows its page well after the guards it has to return early from —
 *  and a hook may not sit after a conditional `return`. The ref is
 *  filled during render and read when the effect fires, so `deps` are
 *  the inputs that decide the page, never the derived rows (a fresh
 *  slice every render would fire this every render). */
declare function usePageNotify<T>(onPage: ((ctx: T) => void) | undefined, ctxRef: {
    current: T;
}, deps: readonly unknown[]): void;

export { ColumnPicker, type ColumnVisibility, FilterInput, filterRows, useColumnVisibility, useFilter, usePageNotify, useStableCallback };
