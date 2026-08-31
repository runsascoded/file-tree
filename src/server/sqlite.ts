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
import { createSqliteModule, SqliteDb, type SqliteRuntime, type SqliteWasmSource } from '../sqlite/db'
import { sqliteTableSource } from '../sqlite/tableSource'
import { rangeReaderFromStore, type StoreVFSOptions } from '../sqlite/vfs'
import { cachedRangeReaderFromStore, type BlockCache, type CachedRangeReader } from '../sqlite/blockCache'
import type { PageRequest } from '../renderers/tableSource'
import type { Store } from '../types'
import type { HandlerContext, Handlers } from './index'

export interface CreateTableHandlersOptions {
  /** Where the SQLite wasm comes from. In a Worker this is
   *  `{ wasmModule }` from a `.wasm` import; in Node, `{ wasmBinary }`. */
  wasm: SqliteWasmSource
  /** Path the endpoints hang off. Defaults to `/`. */
  basePath?: string
  /** CORS origin. Defaults to `*`; `null` skips the headers. */
  corsOrigin?: string | null
  /** Block sizes and cache ceiling for each connection's `StoreVFS`.
   *
   *  Worth raising here. A Worker's reads through an R2 binding are
   *  colocated, so bandwidth is nearly free and round-trips are what's
   *  left to save — the opposite balance from a browser. */
  vfs?: StoreVFSOptions
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
  maxConnections?: number
  /** Cap on `limit`, so a client can't ask for a million rows. Default
   *  1000. */
  maxLimit?: number
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
  blockCache?: BlockCache
  /** Granularity of `blockCache` entries. Default 64 KiB. */
  blockBytes?: number
}

const DEFAULT_MAX_CONNECTIONS = 4
const DEFAULT_MAX_LIMIT = 1000

interface Cached {
  db: SqliteDb
  key: string
  /** Present when `blockCache` is in play; its `flush()` is what a
   *  Worker hands to `ctx.waitUntil`. */
  reader?: CachedRangeReader
}

export function createTableHandlers(store: Store, opts: CreateTableHandlersOptions): Handlers {
  const base = (opts.basePath ?? '').replace(/\/+$/, '')
  const cors = opts.corsOrigin === undefined ? '*' : opts.corsOrigin
  const corsHeaders: Record<string, string> = cors ? { 'Access-Control-Allow-Origin': cors } : {}
  const maxConnections = opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS
  const maxLimit = opts.maxLimit ?? DEFAULT_MAX_LIMIT

  // One instantiated runtime for every connection: the wasm is a
  // megabyte and compiling it per request would dwarf the queries.
  let runtimePromise: Promise<SqliteRuntime> | null = null

  /** Open connections, most-recently-used last. */
  const open: Cached[] = []

  /** Identity of the bytes, not just their location.
   *
   *  A connection holds a page cache, so keying it by path alone means
   *  a re-uploaded file keeps being served from the previous one's
   *  pages for as long as the isolate lives. */
  const cacheKey = (path: string, version: string | null) => `${path}\u0000${version ?? ''}`

  async function connectionFor(path: string, version: string | null): Promise<Cached> {
    const key = cacheKey(path, version)
    const hit = open.findIndex(c => c.key === key)
    if (hit >= 0) {
      const [cached] = open.splice(hit, 1)
      open.push(cached!)
      return cached!
    }

    let cachedReader: CachedRangeReader | undefined
    if (opts.blockCache && version) {
      cachedReader = await cachedRangeReaderFromStore(store, path, {
        cache: opts.blockCache,
        key: `${path}@${version}`,
        ...(opts.blockBytes === undefined ? {} : { blockBytes: opts.blockBytes }),
      })
    }
    const reader = cachedReader ?? await rangeReaderFromStore(store, path)

    runtimePromise ??= createSqliteModule(opts.wasm)
    const db = await SqliteDb.open(reader, opts.wasm, { ...opts.vfs, runtime: await runtimePromise })
    const entry: Cached = { db, key, ...(cachedReader ? { reader: cachedReader } : {}) }
    if (maxConnections <= 0) return entry
    open.push(entry)
    while (open.length > maxConnections) {
      const evicted = open.shift()!
      void evicted.db.close()
    }
    return entry
  }

  /** Close a connection that isn't being kept. */
  async function release(entry: Cached): Promise<void> {
    if (!open.includes(entry)) await entry.db.close()
  }

  return {
    async handle(request: Request, ctx?: HandlerContext): Promise<Response | null> {
      const url = new URL(request.url)
      const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null
      if (route !== '/objects' && route !== '/page') return null

      const path = url.searchParams.get('path')
      if (!path) return json({ error: 'path required' }, 400, corsHeaders)

      let entry: Cached
      try {
        entry = await connectionFor(path, url.searchParams.get('version'))
      } catch (e) {
        return errorJson(e, corsHeaders)
      }
      const { db } = entry

      try {
        if (route === '/objects') {
          return json({ objects: await db.objects() }, 200, corsHeaders)
        }

        const table = url.searchParams.get('table')
        if (!table) return json({ error: 'table required' }, 400, corsHeaders)
        // The table name reaches SQL as an identifier, which can't be
        // bound — so it's checked against the file's real objects here,
        // and quoted downstream. Both, not either.
        if (!(await db.objects()).some(o => o.name === table)) {
          return json({ error: `no such table: ${table}` }, 404, corsHeaders)
        }

        const sort = url.searchParams.get('sort')
        const req: PageRequest = {
          offset: clampInt(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
          limit: clampInt(url.searchParams.get('limit'), 25, 0, maxLimit),
          ...(url.searchParams.get('filter') ? { filter: url.searchParams.get('filter')! } : {}),
          ...(sort ? { sort: { column: sort, dir: url.searchParams.get('dir') === 'desc' ? 'desc' as const : 'asc' as const } } : {}),
        }
        return json(await sqliteTableSource(db, table).page(req), 200, corsHeaders)
      } catch (e) {
        return errorJson(e, corsHeaders)
      } finally {
        // Cache writes are never awaited on the read path; without a
        // `waitUntil` a write racing the response may simply be
        // dropped, which costs a future hit and nothing more.
        if (entry.reader) ctx?.waitUntil?.(entry.reader.flush())
        await release(entry)
      }
    },
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

function errorJson(e: unknown, extra: Record<string, string>): Response {
  // `name === 'NotFoundError'` rather than `instanceof`: subpath-export
  // bundles each carry their own copy of `../types`.
  if (e instanceof Error && e.name === 'NotFoundError') {
    return json({ error: e.message }, 404, extra)
  }
  return json({ error: e instanceof Error ? e.message : String(e) }, 500, extra)
}
