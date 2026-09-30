/** A disk-tree snapshot library for the `/snapshots` demo, built in-browser
 *  so the route stays self-contained: the same layout `disk-tree snapshots`
 *  publishes (`snapshots.json` + `snapshots/<id>/tree.parquet`, rows sorted
 *  `(depth, path)`, `path` relative to the scan root `'.'`, disk-tree's
 *  column names), just written by `hyparquet-writer` instead of pandas.
 *  (The unit tests read a library disk-tree itself published —
 *  `test/fixtures/gen-snapshots.py`.)
 *
 *  Two scans of the `/mock` tree: the newest *is* `DEMO_FIXTURE`, so the
 *  listing and the snapshot agree; the older one is a month earlier —
 *  a few logs and a sample not yet written, a shorter intro, and a cache
 *  file since deleted. */
import { parquetWriteBuffer } from 'hyparquet-writer'
import { DEMO_FIXTURE } from './demo'

export const SNAPSHOT_ROOT = 'mock://demo-bucket'

const byteLen = (v: unknown): number =>
  typeof v === 'string' ? new TextEncoder().encode(v).byteLength
    : v instanceof Uint8Array ? v.byteLength
      : (v as { bytes: Uint8Array }).bytes.byteLength

interface File { size: number; mtime: number }

const T_OLD = Date.parse('2026-08-01T00:00:00Z') / 1000
const T_NEW = Date.parse('2026-09-01T00:00:00Z') / 1000

const NEW: Record<string, File> = Object.fromEntries(
  Object.entries(DEMO_FIXTURE).map(([k, v]) => [k, { size: byteLen(v), mtime: T_OLD - 86_400 }]),
)
for (const k of ['logs/2026-01-05.log', 'logs/2026-01-06.log', 'logs/2026-01-07.log', 'samples/events.pqt', 'docs/intro.md']) {
  if (NEW[k]) NEW[k] = { ...NEW[k], mtime: T_NEW - 86_400 }
}
const OLD: Record<string, File> = {
  ...Object.fromEntries(Object.entries(NEW).filter(([k]) => !/^logs\/2026-01-0[5-7]|^samples\/events\.pqt$/.test(k))),
  'docs/intro.md': { size: Math.round(NEW['docs/intro.md']!.size / 2), mtime: T_OLD - 86_400 },
  'tmp/cache.bin': { size: 4096, mtime: T_OLD - 86_400 },
}

interface Row {
  path: string; size: number; mtime: number; kind: 'file' | 'dir'; parent: string; uri: string
  n_desc: number; n_children: number; depth: number
}

/** disk-tree's rollup rows for a flat `key → file` bucket: one per file and
 *  per dir, dirs carrying recursive size, newest mtime, and subtree node
 *  count (`n_desc`, self included, as disk-tree's imported scans do). */
function rollup(files: Record<string, File>): Row[] {
  const rows = new Map<string, Row & { kids: Set<string> }>()
  const dir = (p: string, depth: number) => {
    let r = rows.get(p)
    if (!r) {
      const parent = p === '.' ? '' : p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.'
      r = { path: p, size: 0, mtime: 0, kind: 'dir', parent, uri: p === '.' ? SNAPSHOT_ROOT : `${SNAPSHOT_ROOT}/${p}`, n_desc: 1, n_children: 0, depth, kids: new Set() }
      rows.set(p, r)
    }
    return r
  }
  dir('.', 0)
  for (const [key, f] of Object.entries(files)) {
    const parts = key.split('/')
    rows.set(key, {
      path: key, size: f.size, mtime: f.mtime, kind: 'file',
      parent: parts.length > 1 ? parts.slice(0, -1).join('/') : '', uri: `${SNAPSHOT_ROOT}/${key}`,
      n_desc: 1, n_children: 0, depth: parts.length, kids: new Set(),
    })
    for (let i = 0; i < parts.length; i++) {
      const anc = dir(i === 0 ? '.' : parts.slice(0, i).join('/'), i)
      anc.size += f.size
      anc.mtime = Math.max(anc.mtime, f.mtime)
      anc.kids.add(parts.slice(0, i + 1).join('/'))
      if (i + 1 < parts.length) dir(parts.slice(0, i + 1).join('/'), i + 1)
    }
  }
  // A dir's `n_desc`: itself + every row strictly beneath it.
  const all = [...rows.values()]
  for (const r of all) {
    r.n_children = r.kids.size
    if (r.kind === 'dir') {
      r.n_desc = 1 + all.filter(o => o.path !== '.' && (r.path === '.' || o.path.startsWith(`${r.path}/`))).length
    }
  }
  return all
    .map(({ kids: _, ...r }) => r)
    .sort((a, b) => a.depth - b.depth || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

function treeParquet(rows: Row[]): Uint8Array {
  const col = <K extends keyof Row>(k: K) => rows.map(r => r[k])
  return new Uint8Array(parquetWriteBuffer({
    columnData: [
      { name: 'path', data: col('path'), type: 'STRING' },
      { name: 'size', data: col('size').map(BigInt), type: 'INT64' },
      { name: 'mtime', data: col('mtime').map(BigInt), type: 'INT64' },
      { name: 'kind', data: col('kind'), type: 'STRING' },
      { name: 'parent', data: col('parent'), type: 'STRING' },
      { name: 'uri', data: col('uri'), type: 'STRING' },
      { name: 'n_desc', data: col('n_desc').map(BigInt), type: 'INT64' },
      { name: 'n_children', data: col('n_children').map(BigInt), type: 'INT64' },
      { name: 'depth', data: col('depth').map(BigInt), type: 'INT64' },
    ],
    // Small groups, so level reads actually prune (disk-tree uses 64K).
    rowGroupSize: 8,
  }))
}

const SCANS = [
  { id: 11, time: '2026-08-01T00:00:00', files: OLD },
  { id: 12, time: '2026-09-01T00:00:00', files: NEW },
]

/** `{ key: bytes }` for a `MockStore`: the library at the store root. */
export const SNAPSHOT_LIBRARY: Record<string, Uint8Array | string> = (() => {
  const out: Record<string, Uint8Array | string> = {}
  const snapshots = SCANS.map(s => {
    const rows = rollup(s.files)
    const root = rows[0]!
    const tree = `snapshots/${s.id}/tree.parquet`
    out[tree] = treeParquet(rows)
    return { id: s.id, path: SNAPSHOT_ROOT, time: s.time, size: root.size, n_desc: root.n_desc, n_children: root.n_children, tree }
  })
  out['snapshots.json'] = JSON.stringify({
    version: 1,
    columns: ['path', 'size', 'mtime', 'kind', 'parent', 'uri', 'n_desc', 'n_children', 'depth', 'mtime_mean?'],
    row_group_size: 8,
    snapshots,
  }, null, 2)
  return out
})()
