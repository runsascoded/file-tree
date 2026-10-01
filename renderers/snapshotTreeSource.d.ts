import { Compressors } from 'hyparquet';
import { Store } from '../index.js';
import { TreeSource } from './treeSource.js';

/** Layer 1: a `TreeSource` over a published disk-tree snapshot library —
 *  precomputed rollups read straight out of a bucket, no live compute.
 *
 *  The layout is disk-tree's `disk-tree snapshots DEST` output (its
 *  `specs/file-tree-integration.md`, B1):
 *
 *      <path>/snapshots.json                   index: { version, columns, snapshots: [{ id, path, time, size, n_desc, n_children, tree }] }
 *      <path>/snapshots/<id>/tree.parquet      one row per file *and* dir, dirs carrying recursive totals
 *
 *  Each `tree.parquet` is sorted `(depth, path)` in 64K-row groups, with
 *  `path` relative to the scan root (the root row is `'.'`). So a level —
 *  the node at depth `d` plus its children at `d+1` — is a
 *  `depth == d+1 && path ∈ [P/, P0)` range per depth, and the footer's
 *  min/max statistics prune it to a row group or two; only those are
 *  fetched and decoded, through whatever `Store` holds the library (R2,
 *  HTTP, S3, Mock…).
 *
 *  Diffs are derived, not read: `diff()` joins the same level of two
 *  snapshots (`diffLevels`), which works for *any* pair — disk-tree's
 *  optional `-d` diff blobs only cover consecutive ones.
 *
 *  Row columns are disk-tree's snake_case (`n_desc`, `n_children`,
 *  `mtime_mean`), mapped to `TreeNode`'s camelCase here. Two contract
 *  nuances, per disk-tree: `n_desc` counts the subtree *including self*
 *  for imported (bucket) scans, and is passed through as-is ("subtree
 *  node count", advisory); and int64 columns arrive from hyparquet as
 *  `bigint`, so every numeric field goes through `Number`.
 *
 *  See `specs/tree-sources-and-treemap.md`.
 */

/** One entry of `snapshots.json`. */
interface SnapshotManifestEntry {
    id: number | string;
    /** The scan root (absolute path or URI, e.g. `gcs://bucket`). */
    path: string;
    /** ISO-8601. */
    time: string;
    size: number | null;
    n_desc?: number | null;
    n_children?: number | null;
    /** The tree parquet, relative to the library root. */
    tree: string;
    diffs?: {
        from: number | string;
        to: number | string;
        blob: string;
    }[];
}
/** `snapshots.json`. */
interface SnapshotManifest {
    version: number;
    columns: string[];
    row_group_size?: number;
    snapshots: SnapshotManifestEntry[];
}
/** The layout version this reader understands. */
declare const SNAPSHOT_LAYOUT_VERSION = 1;
interface SnapshotTreeSourceOptions {
    store: Store;
    /** Store prefix the library was published under — where
     *  `snapshots.json` lives. Default `''` (the store root). */
    path?: string;
    /** Which scan root to serve, when the index holds several (disk-tree
     *  publishes the newest scan *per path*). Default: the index's only
     *  root; more than one is an error naming them. One tree = one source. */
    root?: string;
    /** Label for the root node. Default: the scan root's basename
     *  (`gcs://bucket` → `bucket`), else `'root'`. */
    rootLabel?: string;
    /** Snapshot id a request without one reads. Default: the newest. Lets a
     *  consumer pin every view (listing sizes, treemap) to one point in
     *  history without threading `snapshot` through each call. */
    snapshot?: string;
    /** Extra decompressors, merged over the built-in ZSTD. */
    compressors?: Compressors;
}
/** Row-group bounds, from the footer statistics. `null` = no usable stats
 *  (the group is always read). */
interface GroupBounds {
    rowStart: number;
    rowEnd: number;
    depth: [number, number] | null;
    path: [string, string] | null;
}
/** Which rows a level read wants at one depth: `path` in `[lo, hi]`
 *  (inclusive) or `[lo, hi)`, or every row at that depth. */
interface DepthRange {
    depth: number;
    lo?: string;
    hi?: string;
    hiInclusive?: boolean;
}
/** The `[rowStart, rowEnd)` spans worth reading for `ranges`: row groups
 *  whose stats allow a match, adjacent ones merged so each span is one
 *  `parquetRead`. Exported for tests. */
declare function rowSpans(groups: readonly GroupBounds[], ranges: readonly DepthRange[]): [number, number][];
declare function snapshotTreeSource(opts: SnapshotTreeSourceOptions): TreeSource;

export { type DepthRange, type GroupBounds, SNAPSHOT_LAYOUT_VERSION, type SnapshotManifest, type SnapshotManifestEntry, type SnapshotTreeSourceOptions, rowSpans, snapshotTreeSource };
