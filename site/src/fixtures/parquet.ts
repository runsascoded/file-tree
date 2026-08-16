/** Synthetic parquet for the `MockStore` demo, generated in-browser so
 *  `/mock` stays self-contained (no bucket, no worker).
 *
 *  Built to exercise the parquet viewer's timestamp inference, which
 *  has to make a judgement call per column:
 *
 *  | column     | written as            | expected rendering          |
 *  |------------|-----------------------|-----------------------------|
 *  | `dt`       | bare `INT64` ms       | `2026-04-25 00:00Z` (guess) |
 *  | `event_ts` | bare `INT64` ms       | `…00:00:37Z` (guess)        |
 *  | `recorded` | annotated `TIMESTAMP` | `…00:00:37Z` (declared)     |
 *  | `id`       | bare `INT64` ms-range | raw integer (name gate)     |
 *
 *  `id` is the important one: its values sit squarely inside the epoch
 *  window, so only the name gate stops it from becoming a date. If a
 *  change ever breaks that gate, this file shows it immediately. */
import { parquetWriteBuffer } from 'hyparquet-writer'

const DAY_MS = 86_400_000
/** 2026-04-25T00:00:00Z. */
const EPOCH_START = 1_777_075_200_000
const N = 240

function build(): Uint8Array {
  const dt = new BigInt64Array(N)
  const eventTs = new BigInt64Array(N)
  const id = new BigInt64Array(N)
  const recorded = new Array<Date>(N)
  const region = new Array<string>(N)
  const value = new Float64Array(N)

  for (let i = 0; i < N; i++) {
    // Day-aligned: the common "partition column" shape, and the case
    // that should elide to minute precision rather than a wall of zeros.
    dt[i] = BigInt(EPOCH_START + Math.floor(i / 24) * DAY_MS)
    // Same instants at second granularity, so the column renders one
    // tier finer than `dt`.
    const at = EPOCH_START + i * 37_000
    eventTs[i] = BigInt(at)
    recorded[i] = new Date(at)
    // Deliberately epoch-ms-shaped and deliberately not a timestamp.
    id[i] = BigInt(EPOCH_START + i * 7)
    region[i] = ['nyc', 'sfo', 'lax'][i % 3]
    value[i] = Math.round(((i * 37) % 1000) * 100) / 100
  }

  const buf = parquetWriteBuffer({
    columnData: [
      { name: 'dt', data: dt, type: 'INT64' },
      { name: 'event_ts', data: eventTs, type: 'INT64' },
      { name: 'recorded', data: recorded, type: 'TIMESTAMP' },
      { name: 'id', data: id, type: 'INT64' },
      { name: 'region', data: region, type: 'STRING' },
      { name: 'value', data: value, type: 'DOUBLE' },
    ],
  })
  return new Uint8Array(buf)
}

export const EVENTS_PARQUET = build()
