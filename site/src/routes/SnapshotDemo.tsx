/** Layer 1 demo: `snapshotTreeSource` over a disk-tree snapshot library
 *  sitting in a `MockStore` (stand-in for a bucket) — no walk, no live
 *  compute. The listing's dir sizes and the treemap both read precomputed
 *  rollups; the picker pins them to a point in history, and the table
 *  below is `diff()` between the two scans at the root.
 *
 *  The picker and diff table are demo scaffolding: `<FileTree>`'s own
 *  capability-gated snapshot/compare chrome isn't built yet. */
import { useEffect, useMemo, useState } from 'react'
import { FileTree, fmtSize, type DiffLevel, type Snapshot } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { snapshotTreeSource } from '@rdub/file-tree/renderers/snapshotTreeSource'
import { TreeMapView } from '@rdub/file-tree/renderers/treemap'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { DEMO_FIXTURE } from '../fixtures/demo'
import { SNAPSHOT_LIBRARY } from '../fixtures/snapshots'

const STATUS_COLOR: Record<string, string> = {
  added: '#2a2', removed: '#d33', changed: '#d80', touched: '#58c', unchanged: '#888',
}

export function SnapshotDemo() {
  const store = useMemo(() => MockStore(DEMO_FIXTURE, { pageSize: 100, describe: 'mock://demo-bucket/' }), [])
  const library = useMemo(() => MockStore(SNAPSHOT_LIBRARY), [])
  const [snapshot, setSnapshot] = useState<string>('')
  // A fresh source per pin: `snapshot` is the default every un-pinned
  // request (listing sizes, treemap drills) reads.
  const treeSource = useMemo(
    () => snapshotTreeSource({ store: library, ...(snapshot ? { snapshot } : {}) }),
    [library, snapshot])

  const [snapshots, setSnapshots] = useState<readonly Snapshot[]>([])
  const [diff, setDiff] = useState<DiffLevel | null>(null)
  useEffect(() => {
    const src = snapshotTreeSource({ store: library })
    void (async () => {
      const snaps = await src.snapshots!()
      setSnapshots(snaps)
      const [newer, older] = snaps
      if (newer && older) setDiff(await src.diff!({ a: older.id, b: newer.id }))
    })()
  }, [library])

  return (
    <>
      <div style={{ display: 'flex', gap: '0.6em', alignItems: 'center', margin: '0 0 0.8em' }}>
        <label htmlFor="snapshot-pick">Snapshot</label>
        <select id="snapshot-pick" data-testid="snapshot-pick" value={snapshot} onChange={e => setSnapshot(e.target.value)}>
          <option value="">newest</option>
          {snapshots.map(s => (
            <option key={s.id} value={s.id}>#{s.id} · {s.time.slice(0, 10)} · {fmtSize(s.size ?? 0)}</option>
          ))}
        </select>
      </div>
      <FileTree
        key={snapshot}
        store={store}
        routeBase="/snapshots"
        title="Snapshot library"
        treeSource={treeSource}
        treemapRenderer={TreeMapView}
        usePersistedState={useUrlPersistedState}
      />
      {diff && (
        <section style={{ marginTop: '1.5em' }}>
          <h3 style={{ marginBottom: '0.4em' }}>
            <code>diff()</code> at the root, #{snapshots[1]?.id} → #{snapshots[0]?.id}
          </h3>
          <table data-testid="snapshot-diff" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr><th align="left">path</th><th align="left">status</th><th align="right">before</th><th align="right">after</th></tr>
            </thead>
            <tbody>
              {diff.children.map(c => (
                <tr key={c.path}>
                  <td style={{ padding: '0.2em 0.8em 0.2em 0' }}>{c.kind === 'dir' ? `${c.name}/` : c.name}</td>
                  <td style={{ padding: '0.2em 0.8em 0.2em 0', color: STATUS_COLOR[c.status] }}>{c.status}</td>
                  <td align="right" style={{ padding: '0.2em 0.8em 0.2em 0' }}>{c.sizeA == null ? '—' : fmtSize(c.sizeA)}</td>
                  <td align="right" style={{ padding: '0.2em 0' }}>{c.sizeB == null ? '—' : fmtSize(c.sizeB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
