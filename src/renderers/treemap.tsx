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
import { Treemap, type CellStyle } from '@disk-tree/react'
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
  /** Cross-highlight ("scrub") input: the tree-relative path of the tile
   *  to emphasize (the listing row under the cursor, in `<FileTree>`'s
   *  split view). `null`/absent emphasizes nothing. */
  highlightedPath?: string | null
  /** Persistent selection: the tree-relative path of a pinned tile,
   *  emphasized more strongly (and differently) than a hover. Set by
   *  `onSelectPath` when a *file* tile is clicked. */
  selectedPath?: string | null
  /** Called to toggle selection when a file (leaf) tile is clicked — the
   *  clicked node's path, or `null` to clear (clicking the selected tile
   *  again). Directory tiles are left to drill as usual. */
  onSelectPath?: (path: string | null) => void
  /** The reverse brush edge (map → listing): the tree-relative path of the
   *  tile under the cursor, or `null` when the cursor leaves every cell. Wire
   *  it to the listing's row highlight for bidirectional linked highlighting. */
  onHoverPath?: (path: string | null) => void
  /** How a brushed cell (and, for spotlight-style strategies, every *other*
   *  cell) is styled. A `BrushStyle` maps a cell's role — `selected`,
   *  `hovered`, or `other` — plus its resolved `CellStyle` to an override (or
   *  `null` to leave it as-is). Defaults to {@link brushRing}. Swap in
   *  {@link brushSpotlight}/{@link brushSaturate}/{@link brushBold}, or pass
   *  your own — the whole point of the `lens` hook is that this is yours to
   *  define. Only consulted while *something* is brushed. */
  brushStyle?: BrushStyle
  className?: string
  style?: CSSProperties
}

/** Which brush a cell is wearing when the map recomputes styles: the pinned
 *  `selected` cell, the transient `hovered` one, or any `other` cell (only
 *  ever passed while something else is selected/hovered, so a strategy can
 *  fade the field around the focus). */
export type BrushRole = 'selected' | 'hovered' | 'other'
export interface BrushContext {
  role: BrushRole
  /** The cell's node, for strategies that vary by kind/size/depth. */
  node: TreeNode
}
/** A pluggable emphasis strategy: given a cell's resolved `CellStyle` and its
 *  {@link BrushRole}, return an override `CellStyle` (or `null` to leave the
 *  cell untouched). Every field DT resolves is fair game — `bg` (fill),
 *  `ink` (label), `ring` (a mode-independent emphasis border), `opacity`,
 *  `hatch` — so a strategy can lighten, ring, dim, or desaturate at will. */
export type BrushStyle = (s: CellStyle, ctx: BrushContext) => CellStyle | null

/** The emphasis border is white so it pops on any tile fill (a blue ring on a
 *  blue tile vanishes). Selected rings are drawn thicker than hovered ones, so
 *  the two read apart even though both are white. */
const RING = '#ffffff'
/** Draw the ring *outset* (in the gutter), not inset. DT paints each cell's
 *  fill on a full-bleed layer that sits *over* an inset ring — so an inset ring
 *  in the default `gaps` tiling only bleeds through at the fill's ~8%
 *  translucency (all but invisible). An outset ring lands in the inter-cell
 *  gutter, above the fill, and reads as a crisp frame. */
const OUTSET = false
/** Used for the *fill* tint + label recolour in the ring brush (not the ring
 *  itself) — the one place a hue still says "selected". */
const SELECTED_ACCENT = '#4a9eff'

/** Mix `accent` into the cell's own fill (DT's `ageFade`/`dimUnmatched` idiom),
 *  falling back to the flat accent when the resolved style has no `bg`. */
function tintFill(s: CellStyle, accent: string, pct: number): string {
  return s.bg ? `color-mix(in oklch, ${s.bg}, ${accent} ${pct}%)` : accent
}

/** A bold white `ring` (an outset frame in the gutter) plus a same-hue fill
 *  tint and label recolour. The white border is the primary cue — it stands
 *  out on any fill; the blue fill tint is the secondary "selected" hue. Other
 *  cells untouched. This is file-tree's original brush and the default. */
export const brushRing: BrushStyle = (s, { role }) =>
  role === 'selected' ? { ...s, bg: tintFill(s, SELECTED_ACCENT, 30), ink: RING, ring: { color: RING, width: 5, inset: OUTSET }, opacity: 1 }
    : role === 'hovered' ? { ...s, bg: tintFill(s, RING, 14), ink: RING, ring: { color: RING, width: 3, inset: OUTSET }, opacity: 1 }
      : null

/** Spotlight: the focus keeps its own colour (with a bold white ring so you
 *  can't miss it) while *every other* cell fades right back. Emphasis from
 *  dimming the field, not lightening the target — the inverse of the instinct
 *  that a highlighted thing should get *brighter*. */
export const brushSpotlight: BrushStyle = (s, { role }) =>
  role === 'selected' ? { ...s, ring: { color: RING, width: 5, inset: OUTSET }, opacity: 1 }
    : role === 'hovered' ? { ...s, ring: { color: RING, width: 3, inset: OUTSET }, opacity: 1 }
      : { ...s, opacity: 0.22 }

/** Pure border emphasis: a thick white `ring` and nothing else — no fill or
 *  label recolour, no dimming — for when the frame alone should carry it. */
export const brushBold: BrushStyle = (s, { role }) =>
  role === 'selected' ? { ...s, ring: { color: RING, width: 7, inset: OUTSET } }
    : role === 'hovered' ? { ...s, ring: { color: RING, width: 4, inset: OUTSET } }
      : null

/** `<Treemap<TreeNode>>` driven by a `TreeSource`. Loads the root level
 *  on mount (and whenever `source`/`path` change), then lets the map
 *  drive its own drill via `loadChildren`, caching each fetched level so
 *  `getChildren` can answer synchronously. */
export function TreeMapView({ source, path = '', rootLabel = 'root', height = '70vh', highlightedPath, selectedPath, onSelectPath, onHoverPath, brushStyle = brushRing, className, style }: TreeMapViewProps) {
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
        // Cross-highlight: a `lens` (post-resolution style transform) tags each
        // cell's brush role — `selected` (persistent), `hovered` (transient),
        // or `other` — and hands it to `brushStyle` to style. Selection wins
        // when a tile is both. Skipped entirely when nothing is brushed, so an
        // untouched map pays nothing; once something is, every cell is offered
        // (that's what lets a spotlight strategy fade the field around the focus).
        lens={selectedPath == null && highlightedPath == null ? undefined : (n, _path, _depth, _ctx, s) => {
          const role: BrushRole = selectedPath != null && n.path === selectedPath ? 'selected'
            : highlightedPath != null && n.path === highlightedPath ? 'hovered'
              : 'other'
          return brushStyle(s, { role, node: n })
        }}
        // Click a *file* tile to toggle its selection (a dir tile is left to
        // drill). `true` marks the click handled so the map skips its default.
        onCellClick={onSelectPath == null ? undefined : n => {
          if (n.kind === 'dir') return
          onSelectPath(n.path === selectedPath ? null : n.path)
          return true
        }}
        // Reverse brush edge: report the hovered tile's path up to the listing
        // (`null` when the cursor leaves every cell), so a row lights up under
        // the mapped tile just as a hovered row lights up its tile.
        onCellHover={onHoverPath == null ? undefined : (n) => onHoverPath(n ? n.path : null)}
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
