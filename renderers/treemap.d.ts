import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties } from 'react';
import { CellStyle } from '@rdub/treemap';
import { TreeNode, TreeSource } from './treeSource.js';

interface TreeMapViewProps {
    /** The recursively-sized tree to render. */
    source: TreeSource;
    /** Tree-relative path to root the map at (default `''` = whole tree);
     *  pass the current directory so the map opens where the browser is. */
    path?: string;
    /** Label for the root node, which has no basename. Default `'root'`. */
    rootLabel?: string;
    /** Height of the map area. `<Treemap>` fills its container, so it
     *  needs an explicit one; default `'70vh'`. */
    height?: number | string;
    /** Cross-highlight ("scrub") input: the tree-relative path of the tile
     *  to emphasize (the listing row under the cursor, in `<FileTree>`'s
     *  split view). `null`/absent emphasizes nothing. */
    highlightedPath?: string | null;
    /** Persistent selection: the tree-relative path of a pinned tile,
     *  emphasized more strongly (and differently) than a hover. Set by
     *  `onSelectPath` when a *file* tile is clicked. */
    selectedPath?: string | null;
    /** Called to toggle selection when a file (leaf) tile is clicked — the
     *  clicked node's path, or `null` to clear (clicking the selected tile
     *  again). Directory tiles are left to drill as usual. */
    onSelectPath?: (path: string | null) => void;
    /** The reverse brush edge (map → listing): the tree-relative path of the
     *  tile under the cursor, or `null` when the cursor leaves every cell. Wire
     *  it to the listing's row highlight for bidirectional linked highlighting. */
    onHoverPath?: (path: string | null) => void;
    /** How a brushed cell (and, for spotlight-style strategies, every *other*
     *  cell) is styled. A `BrushStyle` maps a cell's role — `selected`,
     *  `hovered`, or `other` — plus its resolved `CellStyle` to an override (or
     *  `null` to leave it as-is). Defaults to {@link brushRing}. Swap in
     *  {@link brushSpotlight}/{@link brushSaturate}/{@link brushBold}, or pass
     *  your own — the whole point of the `lens` hook is that this is yours to
     *  define. Only consulted while *something* is brushed. */
    brushStyle?: BrushStyle;
    className?: string;
    style?: CSSProperties;
}
/** Which brush a cell is wearing when the map recomputes styles: the pinned
 *  `selected` cell, the transient `hovered` one, or any `other` cell (only
 *  ever passed while something else is selected/hovered, so a strategy can
 *  fade the field around the focus). */
type BrushRole = 'selected' | 'hovered' | 'other';
interface BrushContext {
    role: BrushRole;
    /** The cell's node, for strategies that vary by kind/size/depth. */
    node: TreeNode;
}
/** A pluggable emphasis strategy: given a cell's resolved `CellStyle` and its
 *  {@link BrushRole}, return an override `CellStyle` (or `null` to leave the
 *  cell untouched). Every field DT resolves is fair game — `bg` (fill),
 *  `ink` (label), `ring` (a mode-independent emphasis border), `opacity`,
 *  `hatch` — so a strategy can lighten, ring, dim, or desaturate at will. */
type BrushStyle = (s: CellStyle, ctx: BrushContext) => CellStyle | null;
/** A bold white `ring` (an outset frame in the gutter) plus a same-hue fill
 *  tint and label recolour. The white border is the primary cue — it stands
 *  out on any fill; the blue fill tint is the secondary "selected" hue. Other
 *  cells untouched. This is file-tree's original brush and the default. */
declare const brushRing: BrushStyle;
/** Spotlight: the focus keeps its own colour (with a bold white ring so you
 *  can't miss it) while *every other* cell fades right back. Emphasis from
 *  dimming the field, not lightening the target — the inverse of the instinct
 *  that a highlighted thing should get *brighter*. */
declare const brushSpotlight: BrushStyle;
/** Pure border emphasis: a thick white `ring` and nothing else — no fill or
 *  label recolour, no dimming — for when the frame alone should carry it. */
declare const brushBold: BrushStyle;
/** `<Treemap<TreeNode>>` driven by a `TreeSource`. Loads the root level
 *  on mount (and whenever `source`/`path` change), then lets the map
 *  drive its own drill via `loadChildren`, caching each fetched level so
 *  `getChildren` can answer synchronously. */
declare function TreeMapView({ source, path, rootLabel, height, highlightedPath, selectedPath, onSelectPath, onHoverPath, brushStyle, className, style }: TreeMapViewProps): react_jsx_runtime.JSX.Element;

export { type BrushContext, type BrushRole, type BrushStyle, TreeMapView, type TreeMapViewProps, brushBold, brushRing, brushSpotlight };
