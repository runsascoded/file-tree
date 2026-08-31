import { Store } from '../index.cjs';
import { TreeSource } from './treeSource.cjs';

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

interface WalkTreeSourceOptions {
    /** Store-key prefix that is the tree's root. `''` (default) is the
     *  whole store; `'listing/'` scopes the tree to a sub-prefix. */
    root?: string;
    /** Label for the root node, which has no basename. Default `'root'`;
     *  `store.describe?.()` is a natural choice. */
    rootLabel?: string;
    /** Give up past this many walked entries (files + dirs). Default
     *  50,000 — small enough to stay a few seconds of `list` calls, large
     *  enough for most single-app buckets. */
    maxNodes?: number;
}
declare function walkTreeSource(store: Store, opts?: WalkTreeSourceOptions): TreeSource;

export { type WalkTreeSourceOptions, walkTreeSource };
