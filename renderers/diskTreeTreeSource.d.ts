import { TreeSource, TreeDiffNode, ScanJob } from './treeSource.js';

interface DiskTreeTreeSourceOptions {
    /** The disk-tree server, e.g. `http://localhost:5001`. `/api/…` is
     *  appended. */
    baseUrl: string;
    /** The tree's root on the server: a scanned path or URI. */
    uri: string;
    /** Label for the root node. Default: `uri`'s basename, else `'root'`. */
    rootLabel?: string;
    /** Offer `scan()`/`scanStatus()` (the server's `/api/scan/start`).
     *  Default `true`; `false` for a read-only view of a shared server. */
    scan?: boolean;
    /** Auth headers, an `AbortSignal`, or a test double. Defaults to
     *  global `fetch`. */
    fetch?: typeof fetch;
}
/** A row of `/api/scan`'s `root`/`children` (disk-tree's `Row`, plus
 *  server-side annotations this adapter ignores). Unscanned children of
 *  a virtual root carry no stats. */
interface DiskTreeRow {
    path: string;
    uri?: string;
    kind?: string;
    size?: number | null;
    mtime?: number | null;
    mtime_mean?: number | null;
    n_desc?: number | null;
    n_children?: number | null;
}
/** `GET /api/scan`. */
interface DiskTreeScanResponse {
    root: DiskTreeRow;
    children: DiskTreeRow[];
    time: string | null;
    scan_path: string | null;
    scan_status: 'full' | 'partial' | 'none';
}
/** One entry of `GET /api/scans/history` (newest first). */
interface DiskTreeHistoryEntry {
    id: number;
    path: string;
    time: string;
    size: number | null;
    n_children: number | null;
    n_desc: number | null;
    scan_path: string;
}
/** A row of `GET /api/compare` (non-recursive). `size`/`n_desc` are the
 *  newer side's, or the only side's for `added`/`removed`; `*_old` are
 *  present on rows in both scans. */
interface DiskTreeCompareRow {
    path: string;
    kind: string;
    status: TreeDiffNode['status'];
    size?: number | null;
    size_old?: number | null;
    n_desc?: number | null;
    n_desc_old?: number | null;
}
/** `GET /api/compare`. */
interface DiskTreeCompareResponse {
    uri: string;
    scan1: {
        id: number;
        time: string;
        size: number | null;
        n_desc: number | null;
    };
    scan2: {
        id: number;
        time: string;
        size: number | null;
        n_desc: number | null;
    };
    rows: DiskTreeCompareRow[];
}
/** `GET /api/scan/status/<id>` (and `POST /api/scan/start`'s subset). */
interface DiskTreeJob {
    job_id: string;
    path?: string;
    status: ScanJob['status'];
    error?: string;
}
declare function diskTreeTreeSource(opts: DiskTreeTreeSourceOptions): TreeSource;

export { type DiskTreeCompareResponse, type DiskTreeCompareRow, type DiskTreeHistoryEntry, type DiskTreeJob, type DiskTreeRow, type DiskTreeScanResponse, type DiskTreeTreeSourceOptions, diskTreeTreeSource };
