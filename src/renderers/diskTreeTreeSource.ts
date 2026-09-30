/** A `TreeSource` over a live disk-tree server's existing Flask API — no
 *  server change, no FT-native protocol. disk-tree's API is already a
 *  tree source in all but name (its `specs/file-tree-integration.md`,
 *  B2/B3); this maps it:
 *
 *  | `TreeSource`        | disk-tree endpoint                                   |
 *  | ------------------- | ---------------------------------------------------- |
 *  | `children`          | `GET /api/scan?uri=&depth=1&expand_single=false[&scan_id=]` |
 *  | `snapshots`         | `GET /api/scans/history?uri=`                        |
 *  | `diff`              | `GET /api/compare?uri=&scan1=&scan2=&depth=1`        |
 *  | `scan`              | `POST /api/scan/start {path}`                        |
 *  | `scanStatus`        | `GET /api/scan/status/<job_id>`                      |
 *
 *  One source = one tree, rooted at `uri` (an absolute path or
 *  `s3://`/`gcs://` URI the server has scanned); `TreeNode.path` is
 *  relative to it, and becomes `uri/path` on the wire. Snapshot ids are
 *  disk-tree's integer scan ids, stringified — accepted back by
 *  `scan_id=` and `scan1=`/`scan2=`. Rows are snake_case and mapped here.
 *
 *  `expand_single=false` matters: by default the server collapses
 *  single-child directory chains into the viewed node, which would make a
 *  level's node something other than the one asked for.
 *
 *  See `specs/tree-sources-and-treemap.md`.
 */
import { NotFoundError } from '../types'
import {
  nodeName, SnapshotNotFoundError,
  type ChildrenRequest, type DiffLevel, type DiffRequest, type ScanJob, type ScanRequest,
  type Snapshot, type TreeDiffNode, type TreeLevel, type TreeNode, type TreeSource,
} from './treeSource'

export interface DiskTreeTreeSourceOptions {
  /** The disk-tree server, e.g. `http://localhost:5001`. `/api/…` is
   *  appended. */
  baseUrl: string
  /** The tree's root on the server: a scanned path or URI. */
  uri: string
  /** Label for the root node. Default: `uri`'s basename, else `'root'`. */
  rootLabel?: string
  /** Offer `scan()`/`scanStatus()` (the server's `/api/scan/start`).
   *  Default `true`; `false` for a read-only view of a shared server. */
  scan?: boolean
  /** Auth headers, an `AbortSignal`, or a test double. Defaults to
   *  global `fetch`. */
  fetch?: typeof fetch
}

/** A row of `/api/scan`'s `root`/`children` (disk-tree's `Row`, plus
 *  server-side annotations this adapter ignores). Unscanned children of
 *  a virtual root carry no stats. */
export interface DiskTreeRow {
  path: string
  uri?: string
  kind?: string
  size?: number | null
  mtime?: number | null
  mtime_mean?: number | null
  n_desc?: number | null
  n_children?: number | null
}

/** `GET /api/scan`. */
export interface DiskTreeScanResponse {
  root: DiskTreeRow
  children: DiskTreeRow[]
  time: string | null
  scan_path: string | null
  scan_status: 'full' | 'partial' | 'none'
}

/** One entry of `GET /api/scans/history` (newest first). */
export interface DiskTreeHistoryEntry {
  id: number
  path: string
  time: string
  size: number | null
  n_children: number | null
  n_desc: number | null
  scan_path: string
}

/** A row of `GET /api/compare` (non-recursive). `size`/`n_desc` are the
 *  newer side's, or the only side's for `added`/`removed`; `*_old` are
 *  present on rows in both scans. */
export interface DiskTreeCompareRow {
  path: string
  kind: string
  status: TreeDiffNode['status']
  size?: number | null
  size_old?: number | null
  n_desc?: number | null
  n_desc_old?: number | null
}

/** `GET /api/compare`. */
export interface DiskTreeCompareResponse {
  uri: string
  scan1: { id: number; time: string; size: number | null; n_desc: number | null }
  scan2: { id: number; time: string; size: number | null; n_desc: number | null }
  rows: DiskTreeCompareRow[]
}

/** `GET /api/scan/status/<id>` (and `POST /api/scan/start`'s subset). */
export interface DiskTreeJob {
  job_id: string
  path?: string
  status: ScanJob['status']
  error?: string
}

/** disk-tree's SQLite times are `YYYY-MM-DD HH:MM:SS[.ffffff]`; make them ISO. */
function isoTime(t: string): string {
  return t.replace(/^(\d{4}-\d\d-\d\d) /, '$1T')
}

const num = (v: number | null | undefined): number | null => (v == null ? null : v)

export function diskTreeTreeSource(opts: DiskTreeTreeSourceOptions): TreeSource {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const root = opts.uri === '/' ? '/' : opts.uri.replace(/\/+$/, '')
  const rootLabel = opts.rootLabel ?? (nodeName(root.replace(/^[a-z0-9]+:\/\//i, '')) || 'root')

  const uriFor = (path: string) => (!path ? root : root === '/' ? `/${path}` : `${root}/${path}`)
  const join = (path: string, rel: string) => (path ? `${path}/${rel}` : rel)

  async function call<T>(url: string, what: string, init?: RequestInit): Promise<T> {
    const res = await doFetch(url, init)
    let body: unknown = null
    try { body = await res.json() } catch { /* not JSON — the status line is all there is */ }
    if (!res.ok) {
      const detail = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`
      if (res.status === 404) {
        const e = new NotFoundError(what)
        e.message = `${what}: ${detail}`
        throw e
      }
      throw new Error(`disk-tree ${res.status}: ${detail}`)
    }
    return body as T
  }

  function toNode(r: DiskTreeRow, path: string): TreeNode {
    return {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: r.kind === 'dir' ? 'dir' : 'file',
      size: num(r.size),
      ...(r.n_children != null ? { nChildren: r.n_children } : {}),
      ...(r.n_desc != null ? { nDesc: r.n_desc } : {}),
      mtime: num(r.mtime),
      ...(r.mtime_mean !== undefined ? { mtimeMean: num(r.mtime_mean) } : {}),
    }
  }

  async function children(req: ChildrenRequest = {}): Promise<TreeLevel> {
    const path = (req.path ?? '').replace(/^\/+|\/+$/g, '')
    // One level per call: `rows` (deeper levels) is size-truncated
    // server-side (`max_rows`), so it can't be cached as complete levels.
    const params = new URLSearchParams({ uri: uriFor(path), depth: '1', expand_single: 'false' })
    if (req.snapshot) params.set('scan_id', req.snapshot)
    const r = await call<DiskTreeScanResponse>(`${base}/api/scan?${params}`, uriFor(path))
    return {
      node: toNode(r.root, path),
      children: r.children.map(c => toNode(c, join(path, c.path))),
      ...(req.snapshot ? { snapshot: req.snapshot } : {}),
    }
  }

  async function snapshots(): Promise<readonly Snapshot[]> {
    const params = new URLSearchParams({ uri: root })
    const rows = await call<DiskTreeHistoryEntry[]>(`${base}/api/scans/history?${params}`, root)
    return rows.map(s => ({ id: String(s.id), time: isoTime(s.time), size: s.size }))
  }

  async function diff(req: DiffRequest): Promise<DiffLevel> {
    const path = (req.path ?? '').replace(/^\/+|\/+$/g, '')
    const params = new URLSearchParams({ uri: uriFor(path), scan1: req.a, scan2: req.b, depth: '1' })
    let r: DiskTreeCompareResponse
    try {
      r = await call<DiskTreeCompareResponse>(`${base}/api/compare?${params}`, uriFor(path))
    } catch (e) {
      // The only 404 `/api/compare` sends is "Scan not found".
      if (e instanceof Error && e.name === 'NotFoundError') throw new SnapshotNotFoundError(`${req.a}|${req.b}`)
      throw e
    }
    const { scan1: a, scan2: b } = r
    const nodeStatus: TreeDiffNode['status'] =
      a.size == null && b.size != null ? 'added'
        : a.size != null && b.size == null ? 'removed'
          : a.size !== b.size || a.n_desc !== b.n_desc ? 'changed'
            : 'unchanged'
    const node: TreeDiffNode = {
      path, name: path ? nodeName(path) : rootLabel, kind: 'dir', status: nodeStatus,
      sizeA: a.size, sizeB: b.size, nDescA: a.n_desc, nDescB: b.n_desc,
    }
    const kids = r.rows.map((row): TreeDiffNode => {
      const p = join(path, row.path)
      const [sizeA, sizeB, nDescA, nDescB] =
        row.status === 'added' ? [null, num(row.size), null, num(row.n_desc)]
          : row.status === 'removed' ? [num(row.size), null, num(row.n_desc), null]
            : [num(row.size_old), num(row.size), num(row.n_desc_old), num(row.n_desc)]
      return {
        path: p, name: nodeName(p), kind: row.kind === 'dir' ? 'dir' : 'file', status: row.status,
        sizeA, sizeB, nDescA, nDescB,
      }
    })
    return { node, children: kids }
  }

  const toJob = (j: DiskTreeJob): ScanJob => ({
    id: j.job_id, status: j.status, error: j.error ? j.error : null,
  })

  async function scan(req: ScanRequest = {}): Promise<ScanJob> {
    const path = (req.path ?? '').replace(/^\/+|\/+$/g, '')
    const res = await doFetch(`${base}/api/scan/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: uriFor(path) }),
    })
    const body = await res.json() as DiskTreeJob & { error?: string }
    // 409: that path is already being scanned — attach to that job
    // rather than fail; polling it is what the caller wanted anyway.
    if (res.status === 409 && body.job_id) return { id: body.job_id, status: 'running', error: null }
    if (!res.ok) throw new Error(`disk-tree ${res.status}: ${body.error ?? res.statusText}`)
    return toJob(body)
  }

  async function scanStatus(id: string): Promise<ScanJob> {
    return toJob(await call<DiskTreeJob>(`${base}/api/scan/status/${encodeURIComponent(id)}`, `scan job ${id}`))
  }

  const canScan = opts.scan ?? true
  return {
    capabilities: { history: true, diff: true, scan: canScan, lazy: true },
    children,
    snapshots,
    diff,
    ...(canScan ? { scan, scanStatus } : {}),
  }
}
