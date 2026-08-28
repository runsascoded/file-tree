import { Store } from './index.js';
import { TableColumn } from './renderers/table.js';

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
interface RowGroupInfo {
    index: number;
    numRows: number;
    rowStart: number;
    rowEnd: number;
    uncompressedBytes: number;
    compressedBytes: number | null;
    /** Keyed by column name; empty when the writer wrote no statistics. */
    stats: Map<string, ParquetColumnStats>;
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

export { NUMERIC_TYPES as N, type ParquetColumn as P, RG_CACHE_SIZE as R, type TemporalColumn as T, type ParquetColumnStats as a, type ParquetMeta as b, type RowGroupInfo as c, type TemporalFormat as d, type TemporalPrecision as e, type TemporalSource as f, type TemporalUnit as g, coarseKind as h, formatTemporal as i, inferColumnFormats as j, inferTemporalFormat as k, useRowGroup as l, toMillis as t, useParquetMeta as u };
