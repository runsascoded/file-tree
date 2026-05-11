import { Store } from '../index.js';

/** `MultiStore` — a virtual `Store` that splices N child stores under
 *  named top-level dirs. The first path segment routes to a child;
 *  listing the empty prefix synthesizes a directory entry per child.
 *
 * Usage:
 *   import { MultiStore } from '@rdub/file-tree/stores/multi'
 *   const store = MultiStore({
 *     ctbk: R2Store(env.CTBK, { prefixes: ['gbfs/', 'avail/'] }),
 *     crashes: R2Store(env.NJ_CRASHES, { prefixes: ['raw/'] }),
 *   })
 *
 * Listing `''` returns `[{ key: 'ctbk/', isDir: true }, { key: 'crashes/', isDir: true }]`.
 * Listing `'ctbk/'` delegates to the `ctbk` child with prefix `''`.
 * Listing `'ctbk/gbfs/'` delegates to the `ctbk` child with prefix `'gbfs/'`,
 * then re-prefixes returned keys with `ctbk/` so the UI sees a single
 * unified namespace.
 *
 * `range` capability is the AND of all children — if any child can't
 * range-read, neither can the composite.
 */

type MultiStoreInput = Record<string, Store>;
declare function MultiStore(children: MultiStoreInput): Store;

export { MultiStore, type MultiStoreInput };
