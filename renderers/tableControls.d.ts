import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
import { a as TableColumn } from '../table-ClgyajEc.js';
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

export { ColumnPicker, type ColumnVisibility, useColumnVisibility };
