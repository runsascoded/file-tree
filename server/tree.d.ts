import { ScanRequest, ScanJob, TreeSource } from '../renderers/treeSource.js';
import { Handlers } from './index.js';
import '../index.js';

/** Server half of file-tree's remote tree protocol: serve any
 *  `TreeSource` over HTTP, for `httpTreeSource` to read.
 *
 *  Mount beside `createHandlers` in a Cloudflare Worker (or Node). It
 *  wraps *any* source, so the server can sit over a `snapshotTreeSource`
 *  (serve a bucket's published snapshots from a Worker with an R2
 *  binding — colocated range reads instead of a browser's round-trips),
 *  a `walkTreeSource` (walk a private bucket server-side), or a scan
 *  dispatcher. The handler never learns which.
 *
 *  Endpoints (JSON; the matching client is `httpTreeSource`):
 *
 *      GET  /children?path=&depth=&snapshot=   → TreeLevel
 *      GET  /snapshots                         → { snapshots: Snapshot[] }
 *      GET  /diff?a=&b=&path=&depth=           → DiffLevel
 *      POST /scan?path=                        → ScanJob
 *      GET  /scan/status?id=                   → ScanJob
 *
 *  A method the source lacks answers 404 `{ error }`. Errors carry the
 *  thrown error's `name`, so the client re-throws the same typed error
 *  (`NotFoundError`/`SnapshotNotFoundError` → 404, `TreeTooLargeError` →
 *  413 with `nodesWalked`).
 */

interface CreateTreeHandlersOptions {
    /** Path the endpoints hang off. Defaults to `/`. */
    basePath?: string;
    /** CORS origin. Defaults to `*`; `null` skips the headers. */
    corsOrigin?: string | null;
    /** Scan dispatch, when the source itself has none (or to override its
     *  own): whatever "rescan" means here — enqueue a Queue, a
     *  `workflow_dispatch`, a POST to a scan server. */
    scanner?: {
        scan(req: ScanRequest): Promise<ScanJob>;
        status(id: string): Promise<ScanJob>;
    };
    /** Cap on `depth`, so a client can't ask for a whole tree in one
     *  level. Default 4. */
    maxDepth?: number;
}
declare function createTreeHandlers(source: TreeSource, opts?: CreateTreeHandlersOptions): Handlers;

export { type CreateTreeHandlersOptions, createTreeHandlers };
