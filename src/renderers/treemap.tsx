/** A treemap view over a `TreeSource`, wrapping `@disk-tree/react`'s
 *  generic `<Treemap>`.
 *
 *  This is the *aggregate* half of the browser: `<DirListing>` renders
 *  "what's in this prefix" a level at a time; this renders "how big is
 *  everything under it" as nested area. The two share one `TreeSource`
 *  — the same recursive-size numbers that fill the listing's dir rows
 *  drive the map — so a consumer wires the source once and offers both.
 *
 *  `@disk-tree/react` is an *optional peer*: this module statically
 *  imports it and is marked external, so it never lands in the main
 *  bundle. Consumers install it (pin the `dist` branch by SHA, e.g.
 *  `@disk-tree/react`: `github:runsascoded/disk-tree#<dist-sha>`) and
 *  lazy-load this subpath (`@rdub/file-tree/renderers/treemap`), then
 *  pass the component to `<FileTree treemapRenderer={…}>` — so a page
 *  that never opens the map downloads neither the peer nor this chunk.
 *
 *  `<Treemap>` is data-shape-agnostic: every read goes through an
 *  accessor, and it drives its own lazy drill through `loadChildren`.
 *  So the whole adapter is a handful of `TreeNode` accessors plus a
 *  `path → children` cache that `getChildren` reads synchronously as
 *  `loadChildren` fills it. Drill is internal to the map (click a
 *  directory tile to descend); it needs no router.
 *
 *  See `specs/tree-sources-and-treemap.md`.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Treemap } from '@disk-tree/react'
import { fmtSize } from '../react/fmt'
import type { TreeNode, TreeSource } from './treeSource'

export interface TreeMapViewProps {
  /** The recursively-sized tree to render. */
  source: TreeSource
  /** Tree-relative path to root the map at (default `''` = whole tree);
   *  pass the current directory so the map opens where the browser is. */
  path?: string
  /** Label for the root node, which has no basename. Default `'root'`. */
  rootLabel?: string
  /** Height of the map area. `<Treemap>` fills its container, so it
   *  needs an explicit one; default `'70vh'`. */
  height?: number | string
  className?: string
  style?: CSSProperties
}

/** `<Treemap<TreeNode>>` driven by a `TreeSource`. Loads the root level
 *  on mount (and whenever `source`/`path` change), then lets the map
 *  drive its own drill via `loadChildren`, caching each fetched level so
 *  `getChildren` can answer synchronously. */
export function TreeMapView({ source, path = '', rootLabel = 'root', height = '70vh', className, style }: TreeMapViewProps) {
  const norm = path.replace(/^\/+|\/+$/g, '')
  const [root, setRoot] = useState<TreeNode | null>(null)
  const [error, setError] = useState<Error | null>(null)
  /** `node.path → children`, primed as levels resolve; `getChildren`
   *  reads it synchronously. A ref (not state) because filling it is
   *  `<Treemap>`'s own concern — it re-renders off its internal cache,
   *  not ours. Reset when the source or root path changes. */
  const kids = useRef<Map<string, readonly TreeNode[]>>(new Map())

  useEffect(() => {
    let cancelled = false
    setRoot(null)
    setError(null)
    kids.current = new Map()
    source.children({ path: norm }).then(
      level => {
        if (cancelled) return
        kids.current.set(level.node.path, level.children)
        setRoot(level.node)
      },
      e => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))) },
    )
    return () => { cancelled = true }
  }, [source, norm])

  const accessors = useMemo(() => ({
    getSize: (n: TreeNode) => n.size ?? 0,
    getChildren: (n: TreeNode) => kids.current.get(n.path) as TreeNode[] | undefined,
    hasChildren: (n: TreeNode) => n.kind === 'dir' && (n.nChildren ?? 1) > 0,
    loadChildren: async (n: TreeNode) => {
      const level = await source.children({ path: n.path })
      kids.current.set(n.path, level.children)
      return level.children as TreeNode[]
    },
    getId: (n: TreeNode) => n.path,
    getLabel: (n: TreeNode) => n.name || rootLabel,
  }), [source, rootLabel])

  if (error) return <div style={{ opacity: 0.7 }}>Treemap unavailable: {error.message}</div>
  if (!root) return <div style={{ opacity: 0.7 }}>Loading treemap…</div>

  return (
    <div className={className} style={{ height, ...style }}>
      <Treemap<TreeNode>
        root={root}
        formatSize={fmtSize}
        // Give a dominant-child tree's tail its own legible side-by-side
        // band instead of full-height slivers. `remainderTail`'s sliver
        // cutoff is `minCellSide`, whose default (7px) is below the
        // width of these columns — raise it so the tail is caught (with
        // `remainderTail` on, the widget skips its own thin-fold, so this
        // only widens the band, it doesn't hide anything).
        remainderTail={0.2}
        minCellSide={24}
        {...accessors}
      />
    </div>
  )
}
