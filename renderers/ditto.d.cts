import { ReactNode } from 'react';
import { a as TableColumn, c as TableCellRenderer } from '../columnResize-BtIe50BE.cjs';
import 'react/jsx-runtime';
import '../persistedState-CB_wfbcb.cjs';

/** The ditto mark a collapsed repeated value renders instead of its text.
 *  Dimmed and centered so a run reads as one block and the changes stand
 *  out; `〃` (U+3003) rather than a straight quote so it reads as "same as
 *  above" even mid-column. `value` goes on the mark's `title`, so the
 *  repeated value stays recoverable on hover. */
declare function dittoMark(value?: unknown): ReactNode;
/** A cell renderer collapsing repeated values in `columns` to {@link dittoMark}
 *  (see {@link repeatsAbove}); other cells pass `defaultNode` through. Empty
 *  values (`null`/`undefined`/`''`) never collapse — a run of blanks already
 *  reads as one, and a mark over nothing is noise. Chain it
 *  ahead of your own renderer with `chainCellRenderers`, or pass the viewer's
 *  `ditto` option, which does exactly that. */
declare function dittoRenderer<C extends TableColumn = TableColumn>(columns: readonly string[]): TableCellRenderer<C>;

export { dittoMark, dittoRenderer };
