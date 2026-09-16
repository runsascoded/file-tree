/** Demo of `foldConstantColumns` — a GCS-listing-shaped parquet whose
 *  `bucket` and `region` are constant across the whole file. Folding reads
 *  the footer's per-row-group min/max stats, drops those columns from the
 *  grid, and states each once above the table (`bucket = marin-us-east5`),
 *  recovering a column of width with zero information lost.
 *
 *  Off by default (folding a column out of the grid is surprising); the
 *  checkbox flips it live. */
import { useMemo, useState } from 'react'
import { makeParquetViewer } from '@rdub/file-tree/renderers/parquet'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { LISTING_PARQUET } from '../fixtures/parquet'

// Module scope: `makeParquetViewer` mints a component type, so calling it in
// render would remount the table each pass. `foldConstantColumns` rides in as
// a prop on the stable type.
const ParquetViewer = makeParquetViewer({})

export function FoldDemo() {
  const store = useMemo(
    () => MockStore({ 'listing.parquet': LISTING_PARQUET }, { describe: 'mock://gcs-listing/' }),
    [])
  const [fold, setFold] = useState(true)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5em' }}>
      <h2 style={{ marginTop: 0 }}>Constant-column fold</h2>
      <p style={{ opacity: 0.85, maxWidth: '48em' }}>
        A GCS-listing shard whose <code>bucket</code> and <code>region</code> are the same on every
        row — repeated down the grid, they carry no information. <code>foldConstantColumns</code> reads
        the parquet footer's per-row-group min/max stats; a column constant across the whole file is
        dropped from the grid and stated once above it. Off by default; toggle it here.
      </p>

      <label style={{ display: 'inline-flex', gap: '0.5em', alignItems: 'center', margin: '0.5em 0 1em', cursor: 'pointer' }}>
        <input type="checkbox" checked={fold} onChange={e => setFold(e.target.checked)} />
        <code>foldConstantColumns</code>
      </label>

      <div data-testid="fold-table" style={{ border: '1px solid #8883', borderRadius: 8, overflow: 'hidden' }}>
        <ParquetViewer store={store} path="listing.parquet" foldConstantColumns={fold} fullLoadMaxBytes={Infinity} />
      </div>
    </div>
  )
}
