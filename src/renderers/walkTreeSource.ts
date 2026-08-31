/** Layer 0: a `TreeSource` that recursively walks a `Store` and rolls
 *  sizes up in JS. No scan infrastructure, no Python, no backend — every
 *  current `<FileTree>` consumer gets recursive directory sizes (and a
 *  treemap) for free, as long as the tree is small enough to walk live.
 *
 *  The honest tension: `Store.list()` gives a level's *shape* cheaply,
 *  but a directory's recursive *size* needs its whole subtree walked. So
 *  this walks the subtree under the viewed node once, caches it (and
 *  every descendant directory, so drilling is a cache hit), and serves
 *  levels from memory — bounded by `maxNodes`. Past the cap it throws
 *  `TreeTooLargeError` rather than hang, the same honesty as CSV's
 *  `fullLoadMaxBytes`; a caller falls back to a snapshot source or leaves
 *  the `—` in place.
 *
 *  See `specs/tree-sources-and-treemap.md`.
 */
import type { Entry, Store } from '../types'
import {
  nodeName, TreeTooLargeError,
  type ChildrenRequest, type TreeLevel, type TreeNode, type TreeSource,
} from './treeSource'

export interface WalkTreeSourceOptions {
  /** Store-key prefix that is the tree's root. `''` (default) is the
   *  whole store; `'listing/'` scopes the tree to a sub-prefix. */
  root?: string
  /** Label for the root node, which has no basename. Default `'root'`;
   *  `store.describe?.()` is a natural choice. */
  rootLabel?: string
  /** Give up past this many walked entries (files + dirs). Default
   *  50,000 — small enough to stay a few seconds of `list` calls, large
   *  enough for most single-app buckets. */
  maxNodes?: number
}

const DEFAULT_MAX_NODES = 50_000

/** `Entry.lastModified` (ISO) → epoch seconds, or null. */
function toEpoch(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function maxMtime(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

/** Exhaust `list(prefix)`'s cursors, capped so a runaway prefix can't
 *  wedge the walk. */
async function listAll(store: Store, prefix: string): Promise<Entry[]> {
  const out: Entry[] = []
  let cursor: string | undefined
  for (let i = 0; i < 1000; i++) {
    const r = await store.list(prefix, cursor ? { cursor } : undefined)
    out.push(...r.entries)
    if (!r.cursor) return out
    cursor = r.cursor
  }
  throw new Error(`walkTreeSource: cursor did not terminate under ${prefix}`)
}

export function walkTreeSource(store: Store, opts: WalkTreeSourceOptions = {}): TreeSource {
  const root = opts.root ?? ''
  const rootLabel = opts.rootLabel ?? 'root'
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES

  /** Fully-walked levels, keyed by node path (`''` = root). Populated
   *  for a walked subtree *and* every descendant directory, so a drill
   *  never re-walks. */
  const levels = new Map<string, TreeLevel>()
  /** In-flight walks, so two drills into the same subtree share one. */
  const inflight = new Map<string, Promise<TreeLevel>>()

  /** Store prefix for a tree-relative path. */
  const keyFor = (path: string) => (path ? `${root}${path}/` : root)

  interface Built { node: TreeNode; children: Built[] }

  async function build(path: string, walked: { n: number }): Promise<Built> {
    const entries = await listAll(store, keyFor(path))
    const children: Built[] = []
    let size = 0
    let nDesc = 0
    let mtime: number | null = null

    for (const e of entries) {
      walked.n++
      if (walked.n > maxNodes) {
        throw new TreeTooLargeError(
          `tree under ${keyFor(path) || '(root)'} exceeds ${maxNodes} entries`,
          walked.n,
        )
      }
      const name = nodeName(e.key)
      const childPath = path ? `${path}/${name}` : name
      if (e.isDir) {
        const sub = await build(childPath, walked)
        children.push(sub)
        size += sub.node.size ?? 0
        nDesc += 1 + (sub.node.nDesc ?? 0)
        mtime = maxMtime(mtime, sub.node.mtime ?? null)
      } else {
        const fileMtime = toEpoch(e.lastModified)
        children.push({
          node: {
            path: childPath, name, kind: 'file',
            size: e.size ?? 0, mtime: fileMtime,
          },
          children: [],
        })
        size += e.size ?? 0
        nDesc += 1
        mtime = maxMtime(mtime, fileMtime)
      }
    }

    const node: TreeNode = {
      path,
      name: path ? nodeName(path) : rootLabel,
      kind: 'dir',
      size,
      nChildren: children.length,
      nDesc,
      mtime,
    }
    return { node, children }
  }

  /** Record a built subtree's every directory level into `levels`. */
  function cache(built: Built): void {
    levels.set(built.node.path, {
      node: built.node,
      children: built.children.map(c => c.node),
    })
    for (const c of built.children) if (c.node.kind === 'dir') cache(c)
  }

  async function children(req: ChildrenRequest = {}): Promise<TreeLevel> {
    const path = (req.path ?? '').replace(/^\/+|\/+$/g, '')
    const cached = levels.get(path)
    if (cached) return cached

    let pending = inflight.get(path)
    if (!pending) {
      pending = (async () => {
        try {
          // A fresh counter per top-level walk: the cap bounds one
          // drill's work, not the process's lifetime cache.
          const built = await build(path, { n: 0 })
          cache(built)
          return levels.get(path)!
        } finally {
          // A failed walk (too large) leaves no in-flight entry, so a
          // retry re-attempts rather than re-returning the rejection.
          inflight.delete(path)
        }
      })()
      inflight.set(path, pending)
    }
    return pending
  }

  return {
    capabilities: { history: false, diff: false, scan: false, lazy: true },
    children,
  }
}
