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
import { s2 } from 's2js'
import type { LatLng } from '../lib/s2geo'

const { cellid, LatLng: S2LatLng } = s2
const D2R = Math.PI / 180

const DAY_MS = 86_400_000
/** 2026-04-25T00:00:00Z. */
const EPOCH_START = 1_777_075_200_000
const N = 240

/** Real city coordinates, a few sub-centres each so the scatter isn't a
 *  uniform disc. This is a *locator*, not a street map — the question it
 *  answers is "whereabouts in this region does the cell sit", which
 *  needs real geography (an S2 token is tied to actual coordinates) but
 *  not real streets. ctbk gets a recognizable outline for free because
 *  it has 2,340 genuine station positions; a synthetic fixture can't
 *  fake that convincingly, so it doesn't try. */
const REGION_CENTRES: Record<string, LatLng[]> = {
  nyc: [[40.758, -73.986], [40.706, -74.009], [40.717, -73.957], [40.762, -73.925]],
  sfo: [[37.775, -122.419], [37.795, -122.394], [37.760, -122.435]],
  lax: [[34.052, -118.244], [34.101, -118.327], [34.019, -118.491]],
}
const REGIONS = Object.keys(REGION_CENTRES)

/** L13 is ~1.2 km on a side — a few px across a ~13 km locator, big
 *  enough to see and small enough that the ring the preview draws
 *  around it still earns its place. */
const S2_LEVEL = 13

/** Deterministic jitter: e2e asserts on this fixture, so it can't move
 *  between runs. */
function lcg(seed: number): () => number {
  let x = seed
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296
}

function s2Token([lat, lng]: LatLng): string {
  const ci = cellid.fromLatLng(new S2LatLng(lat * D2R, lng * D2R))
  return cellid.toToken(cellid.parent(ci, S2_LEVEL))
}

/** Points per region — the preview draws the row's own region, so the
 *  cell has somewhere to sit. */
export const REGION_POINTS: Record<string, LatLng[]> = { nyc: [], sfo: [], lax: [] }

function build(): Uint8Array {
  const dt = new BigInt64Array(N)
  const eventTs = new BigInt64Array(N)
  const id = new BigInt64Array(N)
  const recorded = new Array<Date>(N)
  const region = new Array<string>(N)
  const value = new Float64Array(N)
  const s2Cell = new Array<string>(N)
  const rnd = lcg(20260425)

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
    const reg = REGIONS[i % REGIONS.length]!
    region[i] = reg
    value[i] = Math.round(((i * 37) % 1000) * 100) / 100

    const centres = REGION_CENTRES[reg]!
    const [cLat, cLng] = centres[i % centres.length]!
    const pt: LatLng = [cLat + (rnd() - 0.5) * 0.05, cLng + (rnd() - 0.5) * 0.06]
    REGION_POINTS[reg]!.push(pt)
    s2Cell[i] = s2Token(pt)
  }

  const buf = parquetWriteBuffer({
    columnData: [
      { name: 'dt', data: dt, type: 'INT64' },
      { name: 'event_ts', data: eventTs, type: 'INT64' },
      { name: 'recorded', data: recorded, type: 'TIMESTAMP' },
      { name: 'id', data: id, type: 'INT64' },
      { name: 'region', data: region, type: 'STRING' },
      { name: 's2_cell', data: s2Cell, type: 'STRING' },
      { name: 'value', data: value, type: 'DOUBLE' },
    ],
  })
  return new Uint8Array(buf)
}

export const EVENTS_PARQUET = build()
