import { OmnibarEndpointAsyncConfig } from 'use-kbd';
import { TreeSource, TreeNode } from './renderers/treeSource.cjs';

/** ⌘K path search over a `TreeSource`, as a `use-kbd` omnibar endpoint.
 *
 *  The search corpus is the same tree `<FileTree treeSource>` already reads
 *  for dir sizes and the treemap, so this is a third reader of that seam, not
 *  a new data source. Opt-in: nothing here is imported by `<FileTree>`, and
 *  `use-kbd` is only named in types (an optional peer), so a consumer who
 *  doesn't mount an omnibar bundles none of it.
 *
 *  ```tsx
 *  useOmnibarEndpoint('files', treePathEndpoint(treeSource, { routeBase: '/files' }))
 *  <Omnibar onExecuteRemote={e => 'href' in e && e.href && navigate(e.href)} />
 *  ```
 *
 *  See `specs/done/omnibar-path-search.md`. */

/** Default cap on the nodes {@link treePathIndex} enumerates. */
declare const DEFAULT_INDEX_MAX_NODES = 50000;
interface TreePathIndexOptions {
    /** Subtree to index (tree-relative, `''` = the whole tree). The scope root
     *  itself is not an entry. */
    path?: string;
    /** Stop and throw {@link TreeTooLargeError} past this many nodes. Default
     *  {@link DEFAULT_INDEX_MAX_NODES}. */
    maxNodes?: number;
}
/** Every node under `path`, breadth-first (so shallower nodes come first),
 *  via `source.children`. On a `walkTreeSource` that has already walked the
 *  tree (for sizes or the treemap), every level is a cache hit. */
declare function treePathIndex(source: TreeSource, opts?: TreePathIndexOptions): Promise<TreeNode[]>;
/** Fuzzy score of `query` against a tree path, or `null` if some token misses.
 *  Whitespace separates tokens, each of which must match (in any order), so
 *  `csv data` finds `data/2024/sales.csv`. A token matched in the basename
 *  scores above the same match in a parent segment, and among equal matches a
 *  shorter path wins. Case-insensitive. Dependency-free, and deliberately
 *  separate from the dir filter's substring/glob `makeMatcher`, whose
 *  semantics stay unchanged. */
declare function scorePath(query: string, path: string): number | null;
interface TreePathEndpointOptions extends TreePathIndexOptions {
    /** Route base the hrefs resolve against: the `<FileTree routeBase>`. */
    routeBase: string;
    /** Omnibar group label. Default `'Files'`; `null` for none (e.g. the
     *  current folder's scope, whose hits' paths already say where they are).
     *  Register one endpoint per scope (this subtree at a higher `priority`,
     *  ancestors lower) to rank nearer hits first. */
    group?: string | null;
    /** Group ordering among endpoints (higher first). Default 50. */
    priority?: number;
    /** Skip this subtree (tree-relative; the node and everything under it).
     *  For an ancestor-scope endpoint, so hits a nearer-scope endpoint already
     *  shows aren't listed twice. */
    excludePath?: string;
    /** Restrict entries to files or dirs. Default both. */
    kinds?: ReadonlyArray<'file' | 'dir'>;
    /** Passed through to `use-kbd` (e.g. off for an "elsewhere" scope while at
     *  the root, where it would repeat every hit). Default `true`. */
    enabled?: boolean;
    /** Minimum query length before searching. Default 1. */
    minQueryLength?: number;
    /** Results per page. Default `use-kbd`'s. */
    pageSize?: number;
}
/** A `use-kbd` omnibar endpoint searching the paths under a `TreeSource`.
 *  Each hit is a link entry: basename as label, path (plus size, when known)
 *  as description, and the same `routeBase/<path>` href a listing click
 *  navigates to (dirs with a trailing `/`). Pass `<Omnibar onExecuteRemote>`
 *  an SPA `navigate` so selecting a hit doesn't full-reload the page.
 *
 *  The index is built on the first query and cached per source; results are
 *  ranked here by {@link scorePath} (`sort: 'none'`), not re-ranked by the
 *  omnibar. A tree past `maxNodes` yields a single explanatory entry rather
 *  than a silent empty list. */
declare function treePathEndpoint(source: TreeSource, opts: TreePathEndpointOptions): OmnibarEndpointAsyncConfig;

export { DEFAULT_INDEX_MAX_NODES, type TreePathEndpointOptions, type TreePathIndexOptions, scorePath, treePathEndpoint, treePathIndex };
