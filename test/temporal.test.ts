import { describe, expect, it } from 'vitest'
import {
  formatTemporal,
  inferColumnFormats,
  inferTemporalFormat,
  toMillis,
  type TemporalColumn,
  type TemporalFormat,
} from '../src/renderers/temporal'

/** Midnight UTC 2026-04-25, the value from the ctbk shard that
 *  motivated the heuristic. */
const DT_MS = 1777075200000
const DT_S = DT_MS / 1000
const DT_US = DT_MS * 1000
const DT_NS = BigInt(DT_MS) * 1000000n

/** A column as the pyramid writer emits it: epoch millis in a bare
 *  INT64 with no logical or converted annotation. */
const bareInt64 = (name: string): TemporalColumn => ({ name, physicalType: 'INT64' })

/** Format each value the way the viewer would: infer over the column,
 *  then render. Returns `null` for a column read as non-temporal, so a
 *  test can assert "renders raw" as a single equality. */
function render(col: TemporalColumn, values: unknown[], opts?: { infer?: boolean }): string[] | null {
  const fmt = inferTemporalFormat(col, values, opts ?? {})
  if (!fmt) return null
  return values.map(v => formatTemporal(v, fmt) ?? String(v))
}

describe('signal (a): type annotations', () => {
  it('reads a TIMESTAMP logical type at its declared unit', () => {
    const col: TemporalColumn = { name: 'whenever', physicalType: 'INT64', logicalType: 'TIMESTAMP', timeUnit: 'MICROS' }
    expect(inferTemporalFormat(col, [DT_US])).toEqual<TemporalFormat>({ unit: 'MICROS', precision: 'min', source: 'logical' })
    expect(render(col, [DT_US])).toEqual(['2026-04-25 00:00Z'])
  })

  it('reads legacy converted types', () => {
    expect(inferTemporalFormat({ name: 'x', physicalType: 'INT64', convertedType: 'TIMESTAMP_MILLIS' }, [DT_MS]))
      .toEqual<TemporalFormat>({ unit: 'MILLIS', precision: 'min', source: 'converted' })
    expect(inferTemporalFormat({ name: 'x', physicalType: 'INT64', convertedType: 'TIMESTAMP_MICROS' }, [DT_US]))
      .toEqual<TemporalFormat>({ unit: 'MICROS', precision: 'min', source: 'converted' })
  })

  it('renders DATE as a bare day, from days-since-epoch', () => {
    const col: TemporalColumn = { name: 'whatever', physicalType: 'INT32', logicalType: 'DATE' }
    expect(inferTemporalFormat(col, [DT_MS / 86400000])).toEqual<TemporalFormat>({ unit: 'DAYS', precision: 'day', source: 'logical' })
    expect(render(col, [DT_MS / 86400000])).toEqual(['2026-04-25'])
  })

  it('fires on a name the gate would reject — annotation needs no gate', () => {
    const col: TemporalColumn = { name: 'id', physicalType: 'INT64', logicalType: 'TIMESTAMP', timeUnit: 'MILLIS' }
    expect(render(col, [DT_MS])).toEqual(['2026-04-25 00:00Z'])
  })

  it('reads Date values as already-converted, whatever the name', () => {
    // hyparquet resolves annotated TIMESTAMP columns to JS `Date`, so
    // the annotation can be invisible by the time we see the values.
    const col: TemporalColumn = { name: 'id', physicalType: 'INT64' }
    expect(inferTemporalFormat(col, [new Date(DT_MS)])).toEqual<TemporalFormat>({ unit: 'MILLIS', precision: 'min', source: 'logical' })
    expect(render(col, [new Date(DT_MS)])).toEqual(['2026-04-25 00:00Z'])
  })
})

describe('signals (b)+(c): range heuristic behind a name gate', () => {
  it('renders the motivating ctbk case as a readable instant', () => {
    // `dt` in avail-v6/3m/8d/2026-04-25.parquet: bare INT64 epoch ms.
    expect(render(bareInt64('dt'), [DT_MS])).toEqual(['2026-04-25 00:00Z'])
  })

  it('labels the reading as inferred, not as a declared type', () => {
    expect(inferTemporalFormat(bareInt64('dt'), [DT_MS]))
      .toEqual<TemporalFormat>({ unit: 'MILLIS', precision: 'min', source: 'inferred' })
  })

  it('picks the unit from the value range', () => {
    const unitOf = (name: string, v: unknown) => inferTemporalFormat(bareInt64(name), [v])?.unit ?? null
    expect([
      unitOf('ts', DT_S),
      unitOf('ts', DT_MS),
      unitOf('ts', DT_US),
      unitOf('ts', DT_NS),
    ]).toEqual(['SECONDS', 'MILLIS', 'MICROS', 'NANOS'])
  })

  it('accepts each gated name form and rejects the rest', () => {
    const gated = (name: string) => inferTemporalFormat(bareInt64(name), [DT_MS]) !== null
    expect(['dt', 'ts', 'time', 'timestamp', 'date', 'DT', 'requested_at', 'start_time', 'event_ts', 'run_date'].map(gated))
      .toEqual([true, true, true, true, true, true, true, true, true, true])
    expect(['id', 'count', 'size', 'count_sum', 'duration_sum', 'station_id', 'dtype', 'update'].map(gated))
      .toEqual([false, false, false, false, false, false, false, false])
  })

  it('renders an epoch-windowed id column raw — the name gate holds', () => {
    // Acceptance: an INT64 whose values land in a plausible epoch
    // window must not become a date on the strength of the range alone.
    expect(render(bareInt64('id'), [DT_MS])).toBe(null)
    expect(render(bareInt64('count'), [DT_S])).toBe(null)
  })

  it('renders raw when sampled values disagree on a unit', () => {
    expect(render(bareInt64('ts'), [DT_S, DT_MS])).toBe(null)
  })

  it('renders raw when any sampled value is outside every window', () => {
    expect(render(bareInt64('ts'), [DT_MS, 42])).toBe(null)
    expect(render(bareInt64('ts'), [DT_MS, 9.9e18])).toBe(null)
  })

  it('renders raw for a non-numeric column, however named', () => {
    // A string date is already readable; nothing to infer.
    expect(render({ name: 'date', physicalType: 'BYTE_ARRAY', logicalType: 'STRING' }, ['2026-04-25'])).toBe(null)
    expect(render(bareInt64('ts'), [DT_MS, 'n/a'])).toBe(null)
  })

  it('only considers INT64 / DOUBLE physical types', () => {
    expect(render({ name: 'ts', physicalType: 'INT32' }, [DT_S])).toBe(null)
    expect(render({ name: 'ts', physicalType: 'DOUBLE' }, [DT_S])).toEqual(['2026-04-25 00:00Z'])
  })

  it('skips nulls rather than disqualifying the column', () => {
    expect(render(bareInt64('ts'), [null, DT_MS, undefined])).toEqual(['null', '2026-04-25 00:00Z', 'undefined'])
  })

  it('reads bigint values, and keeps ms precision past 2^53', () => {
    expect(render(bareInt64('ts'), [BigInt(DT_MS)])).toEqual(['2026-04-25 00:00Z'])
    // A nanosecond epoch exceeds Number.MAX_SAFE_INTEGER; narrowing
    // before dividing would lose whole milliseconds.
    expect(toMillis(DT_NS + 123456789n, 'NANOS')).toBe(DT_MS + 123)
  })

  it('is suppressed by `infer: false`, which leaves annotations alone', () => {
    expect(render(bareInt64('dt'), [DT_MS], { infer: false })).toBe(null)
    const annotated: TemporalColumn = { name: 'dt', physicalType: 'INT64', logicalType: 'TIMESTAMP', timeUnit: 'MILLIS' }
    expect(render(annotated, [DT_MS], { infer: false })).toEqual(['2026-04-25 00:00Z'])
  })
})

describe('precision tiers', () => {
  const precisionOf = (values: unknown[]) => inferTemporalFormat(bareInt64('ts'), values)?.precision ?? null

  it('elides to the coarsest unit that loses nothing', () => {
    expect([
      precisionOf([DT_MS]),                 // midnight
      precisionOf([DT_MS + 60000]),         // minute-aligned
      precisionOf([DT_MS + 1000]),          // whole second
      precisionOf([DT_MS + 1500]),          // sub-second
    ]).toEqual(['min', 'min', 'sec', 'ms'])
  })

  it('renders each tier with an explicit UTC marker', () => {
    expect([
      render(bareInt64('ts'), [DT_MS]),
      render(bareInt64('ts'), [DT_MS + 1000]),
      render(bareInt64('ts'), [DT_MS + 1500]),
    ]).toEqual([
      ['2026-04-25 00:00Z'],
      ['2026-04-25 00:00:01Z'],
      ['2026-04-25 00:00:01.500Z'],
    ])
  })

  it('takes the finest tier any sampled value requires', () => {
    // One ragged value drags the whole column to sub-second, so rows
    // stay column-aligned rather than each formatting independently.
    expect(render(bareInt64('ts'), [DT_MS, DT_MS + 1500])).toEqual([
      '2026-04-25 00:00:00.000Z',
      '2026-04-25 00:00:01.500Z',
    ])
  })

  it('keeps sub-ms nanosecond detail out of the display', () => {
    // Nothing below a millisecond is renderable, so a ns column that's
    // ms-aligned stays at the minute tier.
    expect(render(bareInt64('ts'), [DT_NS + 500n])).toEqual(['2026-04-25 00:00Z'])
  })
})

describe('inferColumnFormats', () => {
  it('maps only the columns it reads as temporal', () => {
    // The real ctbk shard's schema, verbatim from the spec.
    const schema: TemporalColumn[] = [
      { name: 'cell', physicalType: 'BYTE_ARRAY', logicalType: 'STRING', convertedType: 'UTF8' },
      { name: 'dt', physicalType: 'INT64' },
      { name: 'count_sum', physicalType: 'DOUBLE' },
      { name: 'duration_sum', physicalType: 'DOUBLE' },
    ]
    const rows = [
      { cell: '89283082803ffff', dt: DT_MS, count_sum: 3.0, duration_sum: 1777075200.5 },
      { cell: '89283082807ffff', dt: DT_MS + 86400000, count_sum: 7.0, duration_sum: 1777075200.5 },
    ]
    expect([...inferColumnFormats(schema, rows).entries()]).toEqual([
      ['dt', { unit: 'MILLIS', precision: 'min', source: 'inferred' }],
    ])
  })

  it('is empty for no rows', () => {
    expect([...inferColumnFormats([bareInt64('dt')], []).entries()]).toEqual([])
    expect([...inferColumnFormats([bareInt64('dt')], null).entries()]).toEqual([])
  })
})
