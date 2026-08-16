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
export type TemporalUnit = 'DAYS' | 'SECONDS' | 'MILLIS' | 'MICROS' | 'NANOS'

/** How much of the time to print. Chosen from the sampled values'
 *  alignment, so a column of midnight-aligned days doesn't render as a
 *  wall of zeros. */
export type TemporalPrecision = 'day' | 'min' | 'sec' | 'ms'

/** Which signal produced the interpretation — `inferred` is the
 *  heuristic (b+c) and is worth surfacing in UI, since it's a guess. */
export type TemporalSource = 'logical' | 'converted' | 'inferred'

export interface TemporalFormat {
  unit: TemporalUnit
  precision: TemporalPrecision
  source: TemporalSource
}

/** Structural subset of a column descriptor that inference reads.
 *  Declared here (rather than imported) so this module stays free of
 *  renderer/parquet imports; callers pass any compatible shape. */
export interface TemporalColumn {
  name: string
  /** Parquet physical type, e.g. `INT64`, `DOUBLE`, `BYTE_ARRAY`. */
  physicalType?: string
  /** Logical-type annotation, e.g. `TIMESTAMP`, `DATE`, `STRING`. */
  logicalType?: string
  /** Unit of a `TIMESTAMP` / `TIME` logical type. */
  timeUnit?: 'MILLIS' | 'MICROS' | 'NANOS'
  /** Legacy converted-type annotation, e.g. `TIMESTAMP_MILLIS`. */
  convertedType?: string
}

/** Plausible-epoch windows, ~1990–2100, in each unit's own scale.
 *  Deliberately narrow: widening them to the full representable range
 *  would start swallowing ordinary counters. */
const WINDOWS: [Exclude<TemporalUnit, 'DAYS'>, number, number][] = [
  ['SECONDS', 6.3e8, 4.1e9],
  ['MILLIS', 6.3e11, 4.1e12],
  ['MICROS', 6.3e14, 4.1e15],
  ['NANOS', 6.3e17, 4.1e18],
]

/** Physical types the range heuristic will consider. Narrow on purpose
 *  — an `INT32` can only reach the seconds window, where it's
 *  indistinguishable from an ordinary large counter. */
const NUMERIC_PHYSICAL = new Set(['INT64', 'DOUBLE'])

/** Name gate for the range heuristic (signal c). Matches a whole name
 *  of `dt` / `ts` / `time` / `timestamp` / `date`, or a `_at` / `_time`
 *  / `_ts` / `_date` suffix. */
const TEMPORAL_NAME = /^(dt|ts|time|timestamp|date)$|_(at|time|ts|date)$/i

/** Rows scanned per column when inferring. Bounds the cost on a
 *  pathologically large row group; the "all sampled values agree"
 *  guarantee is over this prefix, not the whole group. */
const SAMPLE_LIMIT = 10_000

const MS_PER_DAY = 86_400_000

/** Interpret a raw cell as epoch milliseconds, or `null` if it isn't a
 *  number-like value. `Date`s short-circuit the unit: a reader that
 *  understood the file's annotation (hyparquet does this for
 *  `TIMESTAMP`/`DATE` columns) has already done the conversion. */
export function toMillis(v: unknown, unit: TemporalUnit): number | null {
  if (v instanceof Date) {
    const t = v.getTime()
    return Number.isNaN(t) ? null : t
  }
  if (typeof v === 'bigint') {
    // Divide in bigint before narrowing: a nanosecond epoch (~1.7e18)
    // is well past `Number.MAX_SAFE_INTEGER`, so converting first
    // would lose whole milliseconds.
    switch (unit) {
      case 'DAYS': return Number(v) * MS_PER_DAY
      case 'SECONDS': return Number(v) * 1000
      case 'MILLIS': return Number(v)
      case 'MICROS': return Number(v / 1000n)
      case 'NANOS': return Number(v / 1000000n)
    }
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  switch (unit) {
    case 'DAYS': return v * MS_PER_DAY
    case 'SECONDS': return v * 1000
    case 'MILLIS': return v
    case 'MICROS': return v / 1000
    case 'NANOS': return v / 1e6
  }
}

/** Signal (a): the column's own type annotation. */
function unitFromTypes(col: TemporalColumn): { unit: TemporalUnit; source: TemporalSource } | null {
  if (col.logicalType === 'TIMESTAMP' && col.timeUnit) return { unit: col.timeUnit, source: 'logical' }
  if (col.logicalType === 'DATE') return { unit: 'DAYS', source: 'logical' }
  switch (col.convertedType) {
    case 'TIMESTAMP_MILLIS': return { unit: 'MILLIS', source: 'converted' }
    case 'TIMESTAMP_MICROS': return { unit: 'MICROS', source: 'converted' }
    case 'DATE': return { unit: 'DAYS', source: 'converted' }
  }
  return null
}

/** Signals (b)+(c): name gate, then require every sampled value to land
 *  in the same plausible-epoch window. A single value outside every
 *  window — or in a different one — disqualifies the column. */
function unitFromValues(col: TemporalColumn, values: Iterable<unknown>): { unit: TemporalUnit; source: TemporalSource } | null {
  if (!TEMPORAL_NAME.test(col.name)) return null
  if (col.physicalType !== undefined && !NUMERIC_PHYSICAL.has(col.physicalType)) return null
  let unit: Exclude<TemporalUnit, 'DAYS'> | null = null
  let seen = 0
  for (const v of values) {
    if (seen >= SAMPLE_LIMIT) break
    if (v === null || v === undefined) continue
    seen++
    let n: number
    if (typeof v === 'bigint') n = Number(v)
    else if (typeof v === 'number' && Number.isFinite(v)) n = v
    // A non-numeric value in the column means this isn't an epoch
    // column at all (a string date is already readable).
    else return null
    const hit = WINDOWS.find(([, lo, hi]) => n >= lo && n < hi)
    if (!hit) return null
    if (unit === null) unit = hit[0]
    else if (unit !== hit[0]) return null
  }
  return unit === null ? null : { unit, source: 'inferred' }
}

/** Coarsest precision that loses nothing across the sampled values.
 *  Alignment is always measured in milliseconds, after normalization,
 *  so `Date`s and raw integers take the same path. */
function precisionOf(values: Iterable<unknown>, unit: TemporalUnit): TemporalPrecision {
  let subSecond = false
  let withinMinute = false
  let seen = 0
  for (const v of values) {
    if (seen >= SAMPLE_LIMIT) break
    const ms = toMillis(v, unit)
    if (ms === null) continue
    seen++
    if (!Number.isInteger(ms) || ms % 1000 !== 0) { subSecond = true; break }
    if (ms % 60000 !== 0) withinMinute = true
  }
  return subSecond ? 'ms' : withinMinute ? 'sec' : 'min'
}

/** Decide whether `col` is temporal, and how precisely to print it.
 *  `values` must be re-iterable (it's traversed more than once).
 *
 *  `infer` gates only the heuristic — annotated `TIMESTAMP`/`DATE`
 *  columns still format when it's off. */
export function inferTemporalFormat(
  col: TemporalColumn,
  values: Iterable<unknown>,
  { infer = true }: { infer?: boolean } = {},
): TemporalFormat | null {
  let us = unitFromTypes(col)
  if (!us) {
    // A `Date` in the data means the reader already resolved an
    // annotation we couldn't see in the schema — unambiguous, so no
    // name gate applies.
    for (const v of values) {
      if (v === null || v === undefined) continue
      if (v instanceof Date) us = { unit: 'MILLIS', source: 'logical' }
      break
    }
  }
  if (!us && infer) us = unitFromValues(col, values)
  if (!us) return null
  if (us.unit === 'DAYS') return { ...us, precision: 'day' }
  return { ...us, precision: precisionOf(values, us.unit) }
}

/** Render a cell as a UTC instant, or `null` if it isn't one.
 *  Always UTC with an explicit `Z`: these are analytical files, and
 *  coercing to local time invents a timezone the data doesn't carry. */
export function formatTemporal(v: unknown, fmt: TemporalFormat): string | null {
  const ms = toMillis(v, fmt.unit)
  if (ms === null) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const iso = d.toISOString()   // 2026-04-25T00:00:00.000Z
  const day = iso.slice(0, 10)
  switch (fmt.precision) {
    case 'day': return day
    case 'min': return `${day} ${iso.slice(11, 16)}Z`
    case 'sec': return `${day} ${iso.slice(11, 19)}Z`
    case 'ms': return `${day} ${iso.slice(11, 23)}Z`
  }
}

/** Per-column formats for a page of rows, keyed by column name.
 *  Columns with no temporal reading are absent from the map. */
export function inferColumnFormats(
  cols: TemporalColumn[],
  rows: Record<string, unknown>[] | null,
  opts: { infer?: boolean } = {},
): Map<string, TemporalFormat> {
  const out = new Map<string, TemporalFormat>()
  if (!rows || rows.length === 0) return out
  for (const col of cols) {
    // Lazy + re-iterable: inference makes two passes, and
    // materializing a column of a 25k-row group per pass is pure waste.
    const values: Iterable<unknown> = {
      *[Symbol.iterator]() { for (const r of rows) yield r[col.name] },
    }
    const fmt = inferTemporalFormat(col, values, opts)
    if (fmt) out.set(col.name, fmt)
  }
  return out
}
