import { ReactNode } from 'react';
import { a as TableColumn, D as DittoOption, f as TableCellRenderer, c as RunMode, m as RunRenderer } from '../columnResize-C8nZPOQ0.js';
import 'react/jsx-runtime';
import '../persistedState-CB_wfbcb.js';

/** The ditto mark a collapsed repeated value renders instead of its text.
 *  Dimmed and centered so a run reads as one block and the changes stand
 *  out; `〃` (U+3003) rather than a straight quote so it reads as "same as
 *  above" even mid-column. `value` goes on the mark's `title`, so the
 *  repeated value stays recoverable on hover. */
declare function dittoMark(value?: unknown): ReactNode;
/** A `'line'`/`'arrow'`-mode cell after a run's first: a thin rule down
 *  the cell's full height (bleeding into the cell's vertical padding, so
 *  rules in consecutive rows join), ending on the run's last row in a tick
 *  (`└`) or an arrowhead. Assumes the default cell padding (`0.2em`
 *  vertical). `value` goes on the rule's `title`. */
declare function runLine(value: unknown, end: boolean, head?: 'tick' | 'arrow'): ReactNode;
/** A cell renderer drawing runs in the `ditto` columns: `'mark'` replaces
 *  each cell after a run's first with {@link dittoMark}, `'line'` and
 *  `'arrow'` with {@link runLine}. Other cells (and `'sticky'`/`'none'` columns, which the
 *  viewer lays out itself) pass `defaultNode` through. Empty values never
 *  join a run. Chain it ahead of your own renderer with
 *  `chainCellRenderers`, or pass the viewer's `ditto` option, which does
 *  exactly that. */
declare function dittoRenderer<C extends TableColumn = TableColumn>(ditto: DittoOption): TableCellRenderer<C>;
/** A path with its first `shared` characters dimmed — the whole segments it
 *  shares with the row above (see `sharedPathPrefix`). Both parts stay in
 *  the text, so a copy yields the full path. */
declare function dimmedPath(path: string, shared: number): ReactNode;
/** A path cell in `'dim'` mode: dimmed against `above` (the row above's
 *  value). */
declare function dimPathNode(path: string, above: unknown): ReactNode;
/** A row's tail under a `'tree'` parent row: a branch glyph (`├`, or `└` on
 *  the group's last row), then the tail. The parent is kept in the text,
 *  visually hidden, so a copy yields the full path. */
declare function treeChildNode(parent: string, tail: string, last: boolean): ReactNode;
/** A built-in {@link RunRenderer}: the run's value (floating under the
 *  sticky header while any of the run is in view, unless `float: false`),
 *  and below it, positioned by `offsets / span`:
 *  - `'sticky'`: nothing.
 *  - `'mark'`: `〃` on each row after the first.
 *  - `'line'`: a rule from the second row to the last, ending in `└`.
 *  - `'arrow'`: a rule with an arrowhead every `every` rows and at the end.
 *
 *  The value sits on an opaque box (`--ft-run-bg`, default `Canvas`), so a
 *  floating value occludes the rule behind it. Uses only {@link RunCellCtx}:
 *  a template for your own. */
declare function runRenderer<C extends TableColumn = TableColumn>(mode: Exclude<RunMode, 'none'>, opts?: {
    float?: boolean;
    every?: number;
}): RunRenderer<C>;

export { dimPathNode, dimmedPath, dittoMark, dittoRenderer, runLine, runRenderer, treeChildNode };
