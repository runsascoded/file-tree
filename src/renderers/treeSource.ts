/** Where a recursively-sized tree comes from.
 *
 *  The third source seam, sibling to `Store` (bytes + flat listing) and
 *  `TableSource` (pushed-down rows). A directory row in the listing shows
 *  `—` for its size because `Store.list()` only ever knows one level:
 *  a subtree total is not derivable from lazy, ranged, one-level reads
 *  without walking the whole subtree — a *scan*, with its own cost,
 *  storage, and lifetime. `TreeSource` is that scan, abstracted.
 *
 *  It is deliberately *not* a `Store` capability (recursive sizes need
 *  an external, stateful scan most backends can't do — and the hard rule
 *  keeps view/source concerns off `Store`) and *not* a `TableSource`
 *  (a scan's rows are a table, but `page(offset,limit)` is flat, the
 *  wrong shape for hierarchical drill; a tree also has a time axis and a
 *  diff a table doesn't).
 *
 *  Field names are camelCase; disk-tree's wire/parquet use snake_case
 *  (`n_desc`, `n_children`, `mtime_mean`), so the http/snapshot impls map
 *  at the boundary. See `specs/tree-sources-and-treemap.md`.
 */

/** One node in a scanned tree. A file, or a directory whose `size` is
 *  the recursive subtree total. Mirrors disk-tree's `Row`. */
export interface TreeNode {
  /** Key relative to the tree's root. `''` is the root itself. */
  path: string
  /** Basename, for labels. */
  name: string
  kind: 'file' | 'dir'
  /** Bytes. For a `dir`, the recursive total; `null` when a partial scan
   *  couldn't compute it. */
  size: number | null
  /** Immediate children count. `> 0` on a dir is the "drillable" signal. */
  nChildren?: number
  /** Descendant count (files + dirs). */
  nDesc?: number
  /** Newest descendant mtime, epoch seconds. Age/staleness input. */
  mtime?: number | null
  /** Size-weighted mean mtime (disk-tree `--mean-mtime` scans). */
  mtimeMean?: number | null
}

/** What a source can do, so a viewer renders only chrome that works —
 *  the same discipline as `TableSourceCapabilities`. */
export interface TreeSourceCapabilities {
  /** More than one snapshot may exist; `snapshots()` is meaningful. */
  history: boolean
  /** `diff()` is supported. */
  diff: boolean
  /** `scan()` can dispatch a fresh scan. */
  scan: boolean
  /** `children({depth})` fetches a bounded subtree lazily. `false` means
   *  the whole tree arrived in one `children()` and drill is in-memory. */
  lazy: boolean
}

/** A point in a tree's history. `id` is opaque (disk-tree: a scan id). */
export interface Snapshot {
  id: string
  /** ISO-8601, for display. */
  time: string
  size?: number | null
}

/** One level of the tree: the viewed node and its immediate children. */
export interface TreeLevel {
  node: TreeNode
  children: readonly TreeNode[]
  /** Which snapshot answered, when the source has history. */
  snapshot?: string
}

export interface ChildrenRequest {
  /** The node to expand. Absent ⇒ root. */
  path?: string
  /** Prefetch this many levels below `path` (a treemap wants ~1–2).
   *  A hint: an in-memory source may ignore it and serve immediate
   *  children only. Default 1. */
  depth?: number
  /** Read this snapshot rather than the newest. */
  snapshot?: string
}

/** A node under a diff of two snapshots. `status` is disk-tree's enum. */
export interface TreeDiffNode {
  path: string
  name: string
  kind: 'file' | 'dir'
  status: 'added' | 'removed' | 'changed' | 'touched' | 'unchanged'
  sizeA: number | null
  sizeB: number | null
  nDescA?: number | null
  nDescB?: number | null
}

export interface DiffRequest {
  a: string
  b: string
  path?: string
  depth?: number
}

export interface DiffLevel {
  node: TreeDiffNode
  children: readonly TreeDiffNode[]
}

export interface ScanJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Items found so far, when the backend streams progress. */
  itemsFound?: number
  error?: string | null
}

export interface ScanRequest {
  path?: string
}

export interface TreeSource {
  readonly capabilities: TreeSourceCapabilities
  /** The viewed node + its immediate children (optionally deeper). The
   *  one method every source implements; it is exactly a treemap's
   *  `loadChildren` need. */
  children(req?: ChildrenRequest): Promise<TreeLevel>
  /** Timestamped scans, newest first. `[]` (and `history:false`) when
   *  the source has no history. */
  snapshots?(): Promise<readonly Snapshot[]>
  /** Diff two snapshots under `path`. */
  diff?(req: DiffRequest): Promise<DiffLevel>
  /** Dispatch a scan; poll `scanStatus`. What this *does* is the impl's
   *  business — the viewer never learns the backend. */
  scan?(req?: ScanRequest): Promise<ScanJob>
  scanStatus?(id: string): Promise<ScanJob>
}

/** Thrown by a source that would have to read more than its budget to
 *  answer — e.g. `walkTreeSource` asked to walk a tree past its node
 *  cap. Name-based (never `instanceof`) so it survives subpath bundling,
 *  per `CLAUDE.md`. A caller catches it to fall back to a snapshot
 *  source, or to leave the `—` in place. */
export class TreeTooLargeError extends Error {
  override name = 'TreeTooLargeError'
  constructor(
    message: string,
    /** How far the walk got before giving up. */
    readonly nodesWalked: number,
  ) {
    super(message)
  }
}

/** Basename of a store key or tree path. `''` (the root) has none, so
 *  the caller supplies a label. */
export function nodeName(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i < 0 ? trimmed : trimmed.slice(i + 1)
}
