import { a as TableColumn, S as SortComparators } from '../columnResize-D0JjwQTC.js';
import { TableSource, TableCatalog } from './tableSource.js';
import 'react/jsx-runtime';
import 'react';
import '../persistedState-CB_wfbcb.js';

/** A `TableSource` over rows already in memory — a consumer's own
 *  `Record<string, unknown>[]` — so they get the table viewers' sort, page,
 *  filter, resize, `ditto` and `paths` features instead of a hand-rolled
 *  `<table>`. See `<RowsTable>` for the component. */

/** A column's coarse `kind`, read off its first non-empty value. */
declare function inferKind(value: unknown): TableColumn['kind'];
/** Columns of `rows`: every key, in first-seen order, each with the
 *  {@link inferKind} of its first non-empty value. */
declare function inferColumns(rows: readonly Record<string, unknown>[]): TableColumn[];
interface MemoryTableOptions<C extends TableColumn = TableColumn> {
    /** Columns, in order. Default {@link inferColumns}. */
    columns?: readonly C[];
    /** Per-column comparator override (default `compareValues`). */
    sortComparators?: SortComparators;
}
/** Sort, filter and page `rows` in memory. Everything is pushed "down"
 *  because there's nowhere further to push it. */
declare function memoryTableSource<C extends TableColumn = TableColumn>(rows: readonly Record<string, unknown>[], opts?: MemoryTableOptions<C>): TableSource<C>;
/** A one-table catalog, for `<TableBrowser>`. */
declare function singleTableCatalog<C extends TableColumn = TableColumn>(name: string, source: TableSource<C>): TableCatalog<C>;

export { type MemoryTableOptions, inferColumns, inferKind, memoryTableSource, singleTableCatalog };
