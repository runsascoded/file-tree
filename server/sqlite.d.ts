import { SqliteWasmSource } from '../sqlite/db.js';
import { StoreVFSOptions } from '../sqlite/vfs.js';
import { BlockCache } from '../sqlite/blockCache.js';
import { Store } from '../index.js';
import { Handlers } from './index.js';

/** Server half of the remote table protocol: run SQLite next to the
 *  data and return rows.
 *
 *  Mount alongside `createHandlers` in a Cloudflare Worker (or Node) and
 *  point a browser's `httpTableCatalog` at it. What that buys is in
 *  `specs/sqlite-and-table-sources.md`, but briefly: SQLite's page reads
 *  are dependent, so they can't be pipelined, and a query that costs a
 *  Worker with an R2 binding a few colocated reads costs a browser the
 *  same number of serial round-trips. It also means the database itself
 *  never has to be readable by the browser.
 *
 *  Endpoints (both GET, both returning JSON):
 *
 *      /objects?path=<p>
 *          → { objects: TableObject[] }
 *      /page?path=<p>&table=<t>&offset=&limit=[&sort=&dir=][&filter=]
 *          → PageResult
 *
 *  **Cloudflare Workers**: `wa-sqlite`'s Asyncify build runs there, but
 *  needs two non-obvious options that `createSqliteModule` handles for
 *  you — pass `wasm: { wasmModule }` from a `.wasm` import:
 *
 *      import wasmModule from 'wa-sqlite/dist/wa-sqlite-async.wasm'
 *      const tables = createTableHandlers(store, {
 *        wasm: { wasmModule }, basePath: '/tables',
 *      })
 */

interface CreateTableHandlersOptions {
    /** Where the SQLite wasm comes from. In a Worker this is
     *  `{ wasmModule }` from a `.wasm` import; in Node, `{ wasmBinary }`. */
    wasm: SqliteWasmSource;
    /** Path the endpoints hang off. Defaults to `/`. */
    basePath?: string;
    /** CORS origin. Defaults to `*`; `null` skips the headers. */
    corsOrigin?: string | null;
    /** Block sizes and cache ceiling for each connection's `StoreVFS`.
     *
     *  Worth raising here. A Worker's reads through an R2 binding are
     *  colocated, so bandwidth is nearly free and round-trips are what's
     *  left to save — the opposite balance from a browser. */
    vfs?: StoreVFSOptions;
    /** How many open connections to keep.
     *
     *  This is the single most consequential option, and the reason it
     *  exists is worth stating: a connection owns its VFS page cache, and
     *  an unindexed `ORDER BY` reads the *entire* table before returning
     *  its first row. Opening one per request means paying that on every
     *  click. Workers reuse an isolate across requests, so a module-scope
     *  cache genuinely works — but it is best-effort, since the platform
     *  may evict the isolate at any point. A Durable Object holding one
     *  connection is the version that actually guarantees it.
     *
     *  Default 4. `0` disables caching and closes after each request. */
    maxConnections?: number;
    /** Cap on `limit`, so a client can't ask for a million rows. Default
     *  1000. */
    maxLimit?: number;
    /** A shared block cache under the VFS — on Cloudflare, pass
     *  `workersBlockCache()` from `@rdub/file-tree/sqlite/blockCache`.
     *
     *  This is what makes a *cold* isolate cheap, and it complements
     *  `maxConnections` rather than replacing it: that one keeps a warm
     *  connection when the platform happens to reuse the isolate, this
     *  one keeps the pages when it doesn't.
     *
     *  **Only used when the request carries a `version`.** The cache key
     *  has to identify the file's *contents*: a key of path alone would
     *  serve a re-uploaded database out of the old one's pages, and a
     *  wrong hit is silent corruption where a miss is merely a read.
     *  `httpTableCatalog({ version })` is the client side — pass the
     *  `lastModified` the file listing already carries, or an etag. */
    blockCache?: BlockCache;
    /** Granularity of `blockCache` entries. Default 64 KiB. */
    blockBytes?: number;
}
declare function createTableHandlers(store: Store, opts: CreateTableHandlersOptions): Handlers;

export { type CreateTableHandlersOptions, createTableHandlers };
