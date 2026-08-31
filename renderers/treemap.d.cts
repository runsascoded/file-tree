import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties } from 'react';
import { TreeSource } from './treeSource.cjs';

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
    className?: string;
    style?: CSSProperties;
}
/** `<Treemap<TreeNode>>` driven by a `TreeSource`. Loads the root level
 *  on mount (and whenever `source`/`path` change), then lets the map
 *  drive its own drill via `loadChildren`, caching each fetched level so
 *  `getChildren` can answer synchronously. */
declare function TreeMapView({ source, path, rootLabel, height, className, style }: TreeMapViewProps): react_jsx_runtime.JSX.Element;

export { TreeMapView, type TreeMapViewProps };
