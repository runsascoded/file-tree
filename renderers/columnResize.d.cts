import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties, PointerEvent, MouseEvent } from 'react';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';

/** `"name:220,dir:480"` → `{ name: 220, dir: 480 }`. Tolerant: skips
 *  empty / malformed pairs rather than throwing on a hand-edited URL. */
declare function parseWidths(raw: string): Map<string, number>;
/** Inverse of {@link parseWidths}; widths rounded to whole px. Order is
 *  insertion order, so the string is stable across writes that don't
 *  change the set. */
declare function serializeWidths(m: ReadonlyMap<string, number>): string;
interface ColumnWidths {
    /** Style to pin one column's `<th>`/`<td>` — `width`+`min`+`max` so it
     *  holds against content and overrides the elide cap — or `{}` when the
     *  column has no pinned width. Reflects the live drag for the column
     *  being dragged. */
    styleFor(col: string): CSSProperties;
    /** Begin a drag from a handle's `pointerdown`. Tracks the pointer on
     *  `document` (so it keeps working past the handle's edge) and commits
     *  on release. */
    startResize(col: string, e: PointerEvent): void;
    /** Auto-fit a column to its widest rendered cell (a handle's
     *  `dblclick`), measured via `scrollWidth` so a clipped cell still
     *  reports its full content width. */
    autoFit(col: string, e: MouseEvent): void;
}
/** Per-column pinned widths, drag/auto-fit gestures, and the style each
 *  contributes. See {@link ColumnWidths}. */
declare function useColumnWidths(usePersistedState?: PersistedState, key?: string): ColumnWidths;
/** The drag target at a header's right edge. Invisible until hovered
 *  (then a grip line), `col-resize` cursor throughout. `stopPropagation`
 *  on click keeps a drag from also toggling the header's sort. */
declare function ColumnResizeHandle({ col, widths }: {
    col: string;
    widths: ColumnWidths;
}): react_jsx_runtime.JSX.Element;

export { ColumnResizeHandle, type ColumnWidths, parseWidths, serializeWidths, useColumnWidths };
