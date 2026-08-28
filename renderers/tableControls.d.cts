import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { a as TableColumn } from '../table-Bhl7BV7o.cjs';
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

export { ColumnPicker, type ColumnVisibility, FilterInput, filterRows, useColumnVisibility, useFilter };
