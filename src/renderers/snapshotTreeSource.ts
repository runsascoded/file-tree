/** Layer 1: a `TreeSource` over a published disk-tree snapshot library —
 *  precomputed rollups read straight out of a bucket, no live compute.
 *
 *  The layout is disk-tree's `disk-tree snapshots DEST` output (its
 *  `specs/file-tree-integration.md`, B1):
 *
 *      <path>/snapshots.json                   index: { version, columns, snapshots: [{ id, path, time, size, n_desc, n_children, tree }] }
 *      <path>/snapshots/<id>/tree.parquet      one row per file *and* dir, dirs carrying recursive totals
 *
 *  Each `tree.parquet` is sorted `(depth, path)` in 64K-row groups, with
 *  `path` relative to the scan root (the root row is `'.'`). So a level —
 *  the node at depth `d` plus its children at `d+1` — is a
 *  `depth == d+1 && path ∈ [P/, P0)` range per depth, and the footer's
 *  min/max statistics prune it to a row group or two; only those are
 *  fetched and decoded, through whatever `Store` holds the library (R2,
 *  HTTP, S3, Mock…).
 *
 *  Diffs are derived, not read: `diff()` joins the same level of two
 *  snapshots (`diffLevels`), which works for *any* pair — disk-tree's
 *  optional `-d` diff blobs only cover consecutive ones.
 *
 *  Row columns are disk-tree's snake_case (`n_desc`, `n_children`,
 *  `mtime_mean`), mapped to `TreeNode`'s camelCase here. Two contract
 *  nuances, per disk-tree: `n_desc` counts the subtree *including self*
 *  for imported (bucket) scans, and is passed through as-is ("subtree
 *  node count", advisory); and int64 columns arrive from hyparquet as
 *  `bigint`, so every numeric field goes through `Number`.
 *
 *  See `specs/tree-sources-and-treemap.md`.
 */
import { parquetMetadataAsync, parquetRead, type Compressors, type FileMetaData } from 'hyparquet'
import { asyncBufferFromStore, type AsyncBuffer } from '../react/asyncBuffer'
import { NotFoundError, type Store } from '../types'
import { withDefaultCompressors } from './parquetCompressors'
import {
  diffLevels, nodeName, SnapshotNotFoundError,
  type ChildrenRequest, type DiffLevel, type DiffRequest, type Snapshot, type TreeLevel,
  type TreeNode, type TreeSource,
} from './treeSource'

/** One entry of `snapshots.json`. */
export interface SnapshotManifestEntry {
  id: number | string
  /** The scan root (absolute path or URI, e.g. `gcs://bucket`). */
  path: string
  /** ISO-8601. */
  time: string
  size: number | null
  n_desc?: number | null
  n_children?: number | null
  /** The tree parquet, relative to the library root. */
  tree: string
  diffs?: { from: number | string; to: number | string; blob: string }[]
}

/** `snapshots.json`. */
export interface SnapshotManifest {
  version: number
  columns: string[]
  row_group_size?: number
  snapshots: SnapshotManifestEntry[]
}

/** The layout version this reader understands. */
export const SNAPSHOT_LAYOUT_VERSION = 1

export interface SnapshotTreeSourceOptions {
  store: Store
  /** Store prefix the library was published under — where
   *  `snapshots.json` lives. Default `''` (the store root). */
  path?: string
  /** Which scan root to serve, when the index holds several (disk-tree
   *  publishes the newest scan *per path*). Default: the index's only
   *  root; more than one is an error naming them. One tree = one source. */
  root?: string
  /** Label for the root node. Default: the scan root's basename
   *  (`gcs://bucket` → `bucket`), else `'root'`. */
  rootLabel?: string
  /** Snapshot id a request without one reads. Default: the newest. Lets a
   *  consumer pin every view (listing sizes, treemap) to one point in
   *  history without threading `snapshot` through each call. */
  snapshot?: string
  /** Extra decompressors, merged over the built-in ZSTD. */
  compressors?: Compressors
}

/** Only the columns a `TreeNode` needs; `uri`/`parent` are left unread. */
const NODE_COLUMNS = ['path', 'size', 'mtime', 'kind', 'n_desc', 'n_children', 'depth', 'mtime_mean']

type Row = Record<string, unknown>

/** Row-group bounds, from the footer statistics. `null` = no usable stats
 *  (the group is always read). */
export interface GroupBounds {
  rowStart: number
  rowEnd: number
  depth: [number, number] | null
  path: [string, string] | null
}

interface TreeFile {
  file: AsyncBuffer
  metadata: FileMetaData
  columns: string[]
  groups: GroupBounds[]
}

/** Which rows a level read wants at one depth: `path` in `[lo, hi]`
 *  (inclusive) or `[lo, hi)`, or every row at that depth. */
export interface DepthRange { depth: number; lo?: string; hi?: string; hiInclusive?: boolean }

const TEXT = new TextDecoder('utf-8', { fatal: true })

function statString(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v instanceof Uint8Array) {
    try { return TEXT.decode(v) } catch { return undefined }
  }
  return undefined
}

function statNumber(v: unknown): number | undefined {
  if (typeof v === 'number' || typeof v === 'bigint') return Number(v)
  return undefined
}

/** Code-point order, which is UTF-8 byte order — what parquet's string
 *  statistics use. (JS `<` compares UTF-16 units, which disagrees past
 *  the BMP.) */
function cmpBytes(a: string, b: string): number {
  if (a === b) return 0
  const ai = a[Symbol.iterator](), bi = b[Symbol.iterator]()
  for (;;) {
    const x = ai.next(), y = bi.next()
    if (x.done) return y.done ? 0 : -1
    if (y.done) return 1
    const cx = x.value.codePointAt(0)!, cy = y.value.codePointAt(0)!
    if (cx !== cy) return cx - cy
  }
}

function inRange(p: string, r: DepthRange): boolean {
  if (r.lo !== undefined && cmpBytes(p, r.lo) < 0) return false
  if (r.hi !== undefined) {
    const c = cmpBytes(p, r.hi)
    if (r.hiInclusive ? c > 0 : c >= 0) return false
  }
  return true
}

/** Could `g` hold a row matching `r`? Conservative: only a group whose
 *  stats *prove* it can't is skipped. Path stats are only trusted when
 *  the group sits entirely at `r.depth` — across depths they're mixed. */
function groupMayMatch(g: GroupBounds, r: DepthRange): boolean {
  if (!g.depth) return true
  const [dMin, dMax] = g.depth
  if (r.depth < dMin || r.depth > dMax) return false
  if (dMin !== dMax || !g.path) return true
  const [pMin, pMax] = g.path
  if (r.lo !== undefined && cmpBytes(pMax, r.lo) < 0) return false
  if (r.hi !== undefined) {
    const c = cmpBytes(pMin, r.hi)
    if (r.hiInclusive ? c > 0 : c >= 0) return false
  }
  return true
}

/** The `[rowStart, rowEnd)` spans worth reading for `ranges`: row groups
 *  whose stats allow a match, adjacent ones merged so each span is one
 *  `parquetRead`. Exported for tests. */
export function rowSpans(groups: readonly GroupBounds[], ranges: readonly DepthRange[]): [number, number][] {
  const spans: [number, number][] = []
  for (const g of groups) {
    if (!ranges.some(r => groupMayMatch(g, r))) continue
    const last = spans[spans.length - 1]
    if (last && last[1] === g.rowStart) last[1] = g.rowEnd
    else spans.push([g.rowStart, g.rowEnd])
  }
  return spans
}

/** disk-tree's `path_prefix_bounds`: `[P/, P0)` holds exactly the strings
 *  under `P/`, since `'0'` is the code point after `'/'`. */
function descendantRange(depth: number, prefix: string): DepthRange {
  return prefix ? { depth, lo: `${prefix}/`, hi: `${prefix}0` } : { depth }
}

const pathDepth = (p: string) => (p ? p.split('/').length : 0)
const parentOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i) }
const num = (v: unknown): number | null => (v == null ? null : Number(v))

export function snapshotTreeSource(opts: SnapshotTreeSourceOptions): TreeSource {
  const { store } = opts
  const base = opts.path ? `${opts.path.replace(/\/+$/, '')}/` : ''
  const compressors = withDefaultCompressors(opts.compressors)

  let manifestP: Promise<{ entries: SnapshotManifestEntry[]; rootLabel: string }> | null = null
  const trees = new Map<string, Promise<TreeFile>>()
  /** Levels by `snapshot\0path`. Snapshots are immutable, so this never
   *  goes stale; in-flight reads live here too, so concurrent drills
   *  share one. */
  const levels = new Map<string, Promise<TreeLevel>>()

  /** This root's snapshots, newest first. */
  function manifest() {
    manifestP ??= (async () => {
      const r = await store.get(`${base}snapshots.json`)
      const m = JSON.parse(new TextDecoder().decode(r.bytes)) as SnapshotManifest
      if (m.version !== SNAPSHOT_LAYOUT_VERSION) {
        throw new Error(`snapshots.json: layout version ${m.version}, this reader understands ${SNAPSHOT_LAYOUT_VERSION}`)
      }
      const roots = [...new Set(m.snapshots.map(s => s.path))]
      const root = opts.root ?? (roots.length === 1 ? roots[0] : undefined)
      if (root === undefined) {
        throw new Error(`snapshots.json holds ${roots.length} roots (${roots.join(', ')}); pass \`root\` to pick one`)
      }
      const entries = m.snapshots
        .filter(s => s.path === root)
        .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
      const rootLabel = opts.rootLabel ?? (nodeName(root.replace(/^[a-z0-9]+:\/\//i, '')) || 'root')
      return { entries, rootLabel }
    })()
    manifestP.catch(() => { manifestP = null })
    return manifestP
  }

  async function entryFor(requested: string | undefined): Promise<SnapshotManifestEntry> {
    const { entries } = await manifest()
    const snapshot = requested ?? opts.snapshot
    if (snapshot === undefined) {
      const newest = entries[0]
      if (!newest) throw new SnapshotNotFoundError('(newest)')
      return newest
    }
    const e = entries.find(s => String(s.id) === snapshot)
    if (!e) throw new SnapshotNotFoundError(snapshot)
    return e
  }

  function treeFile(e: SnapshotManifestEntry): Promise<TreeFile> {
    const id = String(e.id)
    let p = trees.get(id)
    if (!p) {
      p = (async () => {
        const file = await asyncBufferFromStore(store, `${base}${e.tree}`)
        const metadata = await parquetMetadataAsync(file)
        const names = metadata.schema.slice(1).map(el => el.name)
        const columns = NODE_COLUMNS.filter(c => names.includes(c))
        const groups: GroupBounds[] = []
        let cum = 0
        for (const rg of metadata.row_groups) {
          const n = Number(rg.num_rows)
          const stat = (col: string) =>
            rg.columns.find(c => c.meta_data?.path_in_schema.join('.') === col)?.meta_data?.statistics
          const ds = stat('depth'), ps = stat('path')
          const dMin = statNumber(ds?.min_value ?? ds?.min), dMax = statNumber(ds?.max_value ?? ds?.max)
          const pMin = statString(ps?.min_value ?? ps?.min), pMax = statString(ps?.max_value ?? ps?.max)
          groups.push({
            rowStart: cum,
            rowEnd: cum + n,
            depth: dMin !== undefined && dMax !== undefined ? [dMin, dMax] : null,
            path: pMin !== undefined && pMax !== undefined ? [pMin, pMax] : null,
          })
          cum += n
        }
        return { file, metadata, columns, groups }
      })()
      p.catch(() => trees.delete(id))
      trees.set(id, p)
    }
    return p
  }

  /** Rows matching any of `ranges`, reading only the row groups whose
   *  statistics allow a match (contiguous ones in one `parquetRead`). */
  async function readRanges(t: TreeFile, ranges: DepthRange[]): Promise<Row[]> {
    const out: Row[] = []
    for (const [rowStart, rowEnd] of rowSpans(t.groups, ranges)) {
      await parquetRead({
        file: t.file,
        metadata: t.metadata,
        columns: t.columns,
        rowStart,
        rowEnd,
        compressors,
        rowFormat: 'object',
        onComplete: (rows: Row[]) => {
          for (const r of rows) {
            const d = Number(r.depth)
            const p = String(r.path)
            if (ranges.some(rg => rg.depth === d && inRange(p, rg))) out.push(r)
          }
        },
      })
    }
    return out
  }

  function toNode(r: Row, rootLabel: string): TreeNode {
    const raw = String(r.path)
    const path = raw === '.' ? '' : raw
    return {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: r.kind === 'dir' ? 'dir' : 'file',
      size: num(r.size),
      nChildren: Number(r.n_children ?? 0),
      ...(r.n_desc != null ? { nDesc: Number(r.n_desc) } : {}),
      mtime: num(r.mtime),
      ...('mtime_mean' in r ? { mtimeMean: num(r.mtime_mean) } : {}),
    }
  }

  /** Read `path`'s node and `depth` levels below it, caching the level of
   *  every directory whose children were all read. */
  async function load(e: SnapshotManifestEntry, path: string, depth: number): Promise<Map<string, TreeLevel>> {
    const { rootLabel } = await manifest()
    const t = await treeFile(e)
    const d = pathDepth(path)
    const ranges: DepthRange[] = [
      path ? { depth: d, lo: path, hi: path, hiInclusive: true } : { depth: 0, lo: '.', hi: '.', hiInclusive: true },
    ]
    for (let k = 1; k <= depth; k++) ranges.push(descendantRange(d + k, path))
    const rows = await readRanges(t, ranges)

    const nodes = rows.map(r => toNode(r, rootLabel))
    const kids = new Map<string, TreeNode[]>()
    for (const n of nodes) {
      if (n.path === path) continue
      const p = parentOf(n.path)
      const list = kids.get(p)
      if (list) list.push(n)
      else kids.set(p, [n])
    }
    const snapshot = String(e.id)
    const out = new Map<string, TreeLevel>()
    for (const n of nodes) {
      if (n.kind !== 'dir' || pathDepth(n.path) >= d + depth) continue
      out.set(n.path, { node: n, children: kids.get(n.path) ?? [], snapshot })
    }
    const self = nodes.find(n => n.path === path)
    if (!self) throw new NotFoundError(path || '(root)')
    // A file has no level of its own above; serve it childless.
    if (!out.has(path)) out.set(path, { node: self, children: [], snapshot })
    return out
  }

  async function children(req: ChildrenRequest = {}): Promise<TreeLevel> {
    const path = (req.path ?? '').replace(/^\/+|\/+$/g, '')
    const e = await entryFor(req.snapshot)
    const key = (p: string) => `${e.id}\u0000${p}`
    const hit = levels.get(key(path))
    if (hit) return hit

    const loaded = load(e, path, Math.max(1, req.depth ?? 1))
    const mine = loaded.then(m => m.get(path)!)
    mine.catch(() => {})  // surfaced via `await loaded` below
    levels.set(key(path), mine)
    try {
      const m = await loaded
      for (const [p, level] of m) if (p !== path && !levels.has(key(p))) levels.set(key(p), Promise.resolve(level))
      return await mine
    } catch (err) {
      // Don't cache a failure: a transient read error should retry.
      levels.delete(key(path))
      throw err
    }
  }

  async function snapshots(): Promise<readonly Snapshot[]> {
    const { entries } = await manifest()
    return entries.map(s => ({ id: String(s.id), time: s.time, size: s.size }))
  }

  /** `null` where the node doesn't exist in that snapshot. */
  async function levelOrNull(path: string | undefined, snapshot: string): Promise<TreeLevel | null> {
    try {
      return await children({ ...(path !== undefined ? { path } : {}), snapshot })
    } catch (err) {
      if (err instanceof Error && err.name === 'NotFoundError') return null
      throw err
    }
  }

  async function diff(req: DiffRequest): Promise<DiffLevel> {
    const [a, b] = await Promise.all([levelOrNull(req.path, req.a), levelOrNull(req.path, req.b)])
    if (!a && !b) throw new NotFoundError(req.path || '(root)')
    return diffLevels(a, b)
  }

  return {
    capabilities: { history: true, diff: true, scan: false, lazy: true },
    children,
    snapshots,
    diff,
  }
}
