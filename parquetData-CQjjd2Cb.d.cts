import { Store } from './index.cjs';
import { a as TableColumn } from './table-ZN60aKsl.cjs';

/** Temporal inference + formatting for tabular cells.
 *
 *  Epoch integers are the single worst-reading thing in a data table:
 *  `1777075200000` is correct, unreadable, and usually the column you
 *  scan most. This module decides whether a column *is* temporal and,
 *  if so, how precisely to print it.
 *
 *  **Signals, strongest first, stop at first hit:**
 *
 *  a. **Type annotation** — `TIMESTAMP(unit)` / `DATE`, via either the
 *     modern `logical_type` or the legacy `converted_type`.
 *     Unambiguous and free, but absent from a lot of real files: a
 *     pyramid/DuckDB-style writer often emits epoch millis as a bare
 *     `INT64` with no annotation at all.
 *  b. **Value range** — every sampled value landing inside one unit's
 *     plausible-epoch window (see `WINDOWS`). The windows sit ~3 orders
 *     of magnitude apart, so cross-*unit* confusion isn't a real risk;
 *     the risk is a non-temporal integer (an id, a byte count) landing
 *     in a window. Hence:
 *  c. **Name as a gate, not a trigger** — (b) only applies to a column
 *     whose name already looks temporal. A large-integer `id` column
 *     must never become a date, and a name alone must never be enough
 *     (a `date` column of strings is already fine as-is).
 *
 *  When the signals disagree, render raw: a silently mis-rendered
 *  timestamp is worse than a visible integer. */
/** How to interpret a raw numeric value as a point in time. */
type TemporalUnit = 'DAYS' | 'SECONDS' | 'MILLIS' | 'MICROS' | 'NANOS';
/** How much of the time to print. Chosen from the sampled values'
 *  alignment, so a column of midnight-aligned days doesn't render as a
 *  wall of zeros. */
type TemporalPrecision = 'day' | 'min' | 'sec' | 'ms';
/** Which signal produced the interpretation — `inferred` is the
 *  heuristic (b+c) and is worth surfacing in UI, since it's a guess. */
type TemporalSource = 'logical' | 'converted' | 'inferred';
interface TemporalFormat {
    unit: TemporalUnit;
    precision: TemporalPrecision;
    source: TemporalSource;
}
/** Structural subset of a column descriptor that inference reads.
 *  Declared here (rather than imported) so this module stays free of
 *  renderer/parquet imports; callers pass any compatible shape. */
interface TemporalColumn {
    name: string;
    /** Parquet physical type, e.g. `INT64`, `DOUBLE`, `BYTE_ARRAY`. */
    physicalType?: string;
    /** Logical-type annotation, e.g. `TIMESTAMP`, `DATE`, `STRING`. */
    logicalType?: string;
    /** Unit of a `TIMESTAMP` / `TIME` logical type. */
    timeUnit?: 'MILLIS' | 'MICROS' | 'NANOS';
    /** Legacy converted-type annotation, e.g. `TIMESTAMP_MILLIS`. */
    convertedType?: string;
}
/** Interpret a raw cell as epoch milliseconds, or `null` if it isn't a
 *  number-like value. `Date`s short-circuit the unit: a reader that
 *  understood the file's annotation (hyparquet does this for
 *  `TIMESTAMP`/`DATE` columns) has already done the conversion. */
declare function toMillis(v: unknown, unit: TemporalUnit): number | null;
/** Decide whether `col` is temporal, and how precisely to print it.
 *  `values` must be re-iterable (it's traversed more than once).
 *
 *  `infer` gates only the heuristic — annotated `TIMESTAMP`/`DATE`
 *  columns still format when it's off. */
declare function inferTemporalFormat(col: TemporalColumn, values: Iterable<unknown>, { infer }?: {
    infer?: boolean;
}): TemporalFormat | null;
/** Render a cell as a UTC instant, or `null` if it isn't one.
 *  Always UTC with an explicit `Z`: these are analytical files, and
 *  coercing to local time invents a timezone the data doesn't carry. */
declare function formatTemporal(v: unknown, fmt: TemporalFormat): string | null;
/** Per-column formats for a page of rows, keyed by column name.
 *  Columns with no temporal reading are absent from the map. */
declare function inferColumnFormats(cols: TemporalColumn[], rows: Record<string, unknown>[] | null, opts?: {
    infer?: boolean;
}): Map<string, TemporalFormat>;

/** Physical types we read as numbers — for alignment, and for the
 *  coarse `kind` every table viewer speaks. */
declare const NUMERIC_TYPES: Set<string>;
/** How many decoded row groups to keep. Paging back and forth across a
 *  boundary is common; re-decoding on every crossing is not cheap. */
declare const RG_CACHE_SIZE = 4;
/** A leaf column of the file's schema. The parquet-specific detail
 *  (`physicalType`, `logicalType`, …) rides on top of the
 *  format-neutral `TableColumn` every table viewer shares. */
interface ParquetColumn extends TemporalColumn, TableColumn {
}
/** Per-column statistics from a row group's footer metadata. Not
 *  reconstructible from decoded rows — only the footer has them, and
 *  absent when the writer omitted them. */
interface ParquetColumnStats {
    min?: unknown;
    max?: unknown;
    nullCount?: number;
}
/** One entry of a row group's declared sort order. Present only when
 *  the writer recorded it — most don't. */
interface SortingColumn {
    columnIdx: number;
    descending: boolean;
    nullsFirst: boolean;
}
interface RowGroupInfo {
    index: number;
    numRows: number;
    rowStart: number;
    rowEnd: number;
    uncompressedBytes: number;
    compressedBytes: number | null;
    /** Keyed by column name; empty when the writer wrote no statistics. */
    stats: Map<string, ParquetColumnStats>;
    /** Columns this row group is sorted by, if the writer said so. When a
     *  file is sorted on a column, its row groups' ranges are disjoint and
     *  ordered — so a predicate on that column prunes down to one or two
     *  groups instead of scanning every footer range. */
    sortingColumns: SortingColumn[];
}
interface ParquetMeta {
    schema: ParquetColumn[];
    totalRows: number;
    byteSize: number;
    rowGroups: RowGroupInfo[];
}
/** Parquet's physical type collapsed to the coarse reading every table
 *  viewer speaks. Temporal isn't decidable here — a `TIMESTAMP` is an
 *  `INT64` until inference runs over the values — so callers finalise
 *  that once a row group is decoded. */
declare function coarseKind(physicalType: string): TableColumn['kind'];
/** Footer only — schema, row-group index, and per-column statistics.
 *  One range read; no column data is decoded. */
declare function useParquetMeta(store: Store, path: string): {
    meta: ParquetMeta | null;
    error: string | null;
};
/** Decoded rows of one row group, LRU-cached.
 *
 *  A row group is parquet's unit of compression, so this is also the
 *  unit of fetch: there's no sub-group slicing to be had, which is why
 *  the writer's row-group size decides how browsing feels (see the
 *  README).
 *
 *  Cache is keyed by row-group index within the current `(store, path)`
 *  and dropped when either changes — the indices mean something
 *  different in a different file, and reusing them would silently
 *  mis-render. */
declare function useRowGroup(store: Store, path: string, meta: ParquetMeta | null, index: number, cacheSize?: number): {
    rows: Record<string, unknown>[] | null;
    error: string | null;
};
/** Every row of every row group, for small-table mode.
 *
 *  Only runs when `enabled`; the caller decides from `meta.byteSize`
 *  whether the file is small enough. One `parquetRead` over the whole
 *  file rather than per-group, so hyparquet can plan it.
 */
declare function useAllRows(store: Store, path: string, meta: ParquetMeta | null, enabled: boolean): {
    rows: Record<string, unknown>[] | null;
    error: string | null;
};
/** A comparison a row-group's footer statistics can be tested against.
 *  Deliberately narrow: `min`/`max` can rule out a *range*, and nothing
 *  else — a substring or regex tells you nothing about a range, so
 *  pruning is only ever sound for these. */
interface Predicate {
    column: string;
    op: '=' | '<' | '<=' | '>' | '>=';
    value: string;
}
/** `col=value`, `col>=3`, … or `null` when the text isn't a comparison
 *  (which is the common case — a bare word is a substring search). */
declare function parsePredicate(text: string): Predicate | null;
/** Could this row group contain a matching row?
 *
 *  Conservative in both directions that matter: a group with no
 *  statistics for the column, or unreadable ones, is kept — pruning may
 *  only ever remove groups that *provably* cannot match. */
declare function rowGroupMatches(rg: RowGroupInfo, p: Predicate): boolean;
/** Row groups that could contain a match.
 *
 *  This is the one filter that works *above* the size threshold: it
 *  reads only the footer, which is already loaded. On a file sorted by
 *  the predicate's column the ranges are disjoint, so it typically
 *  leaves one or two groups out of hundreds. */
declare function pruneRowGroups(rowGroups: readonly RowGroupInfo[], p: Predicate): RowGroupInfo[];
/** Is the file sorted by this column, per the writer's own metadata?
 *  Used to tell the reader *why* a filter was cheap. */
declare function isSortedBy(meta: ParquetMeta, column: string): boolean;

export { NUMERIC_TYPES as N, type ParquetColumn as P, RG_CACHE_SIZE as R, type SortingColumn as S, type TemporalColumn as T, type ParquetColumnStats as a, type ParquetMeta as b, type RowGroupInfo as c, type TemporalFormat as d, type TemporalPrecision as e, type TemporalSource as f, type TemporalUnit as g, coarseKind as h, formatTemporal as i, inferColumnFormats as j, inferTemporalFormat as k, useRowGroup as l, type Predicate as m, isSortedBy as n, pruneRowGroups as o, parsePredicate as p, useAllRows as q, rowGroupMatches as r, toMillis as t, useParquetMeta as u };
