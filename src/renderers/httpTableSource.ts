/** A `TableCatalog` that lives behind an HTTP endpoint.
 *
 *  This is what makes the three deployment modes one implementation
 *  rather than three forks. The browser either runs the engine itself
 *  (mode 1: `sqliteCatalog` over a `StoreVFS` reading through
 *  `HttpStore`) or asks a server to (modes 2 and 3: this). Same
 *  interface, same viewer, and the choice is a line of wiring.
 *
 *  Why bother, when mode 1 works? Two reasons, both measured in
 *  `specs/sqlite-and-table-sources.md`:
 *
 *  - **Latency.** SQLite's page reads are *dependent* — it can't ask for
 *    the next one until it has read the last — so they can't be
 *    pipelined. A query needing 114 page reads is 114 serial
 *    round-trips from a browser, and about that many microseconds from
 *    a Worker holding an R2 binding. The server is where the seeking
 *    should happen, and the browser should get rows.
 *  - **Access.** Mode 1 needs the database readable by the browser. A
 *    server can read a private object and return only the rows the
 *    viewer asked for.
 *
 *  Deliberately format-blind: nothing here knows the server is running
 *  SQLite. A backend answering these two endpoints from DuckDB,
 *  Postgres, or a native `sqlite3` process (which is mode 3, and what
 *  `~/c/ire/www`'s `server` branch did) serves the same viewer.
 *
 *  The wire protocol is exactly `TableObject[]` and `PageResult` as
 *  JSON — see `createTableHandlers` in `@rdub/file-tree/server/sqlite`
 *  for the other half.
 */
import type { TableColumn } from './table'
import type {
  PageRequest, PageResult, TableCatalog, TableObject, TableSource, TableSourceCapabilities,
} from './tableSource'

export interface HttpTableCatalogOptions {
  /** Base URL the endpoints hang off, e.g. `https://api.example.com/tables`.
   *  `/objects` and `/page` are appended. */
  baseUrl: string
  /** Store key of the file being browsed, forwarded as `path`. */
  path: string
  /** Version of the file's *contents* — an etag, or the `lastModified`
   *  the directory listing already carries.
   *
   *  Forwarded as `version`, and the server's shared block cache is
   *  keyed on it. Omit it and that cache is skipped entirely: a key of
   *  path alone would serve a re-uploaded database out of the previous
   *  one's pages, and a wrong hit is silent corruption where a miss is
   *  only a read. Costs nothing to send, so send it when you have it. */
  version?: string
  /** Escape hatch for auth headers, credentials, an `AbortSignal`, or a
   *  test double. Defaults to global `fetch`. */
  fetch?: typeof fetch
  /** What the server can push down. The client can't discover this, and
   *  guessing wrong means offering a sort that silently does nothing —
   *  so it's declared. Defaults to everything, which is what the
   *  bundled SQLite handler does. */
  capabilities?: TableSourceCapabilities
}

const ALL: TableSourceCapabilities = {
  sort: true, filter: true, total: true, randomAccess: true,
}

async function getJson<T>(
  doFetch: typeof fetch, url: string,
): Promise<T> {
  const res = await doFetch(url)
  if (!res.ok) {
    // Surface the server's own message when it sent one — a SQL error
    // explains far more than "500".
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json() as { error?: string }
      if (body?.error) detail = body.error
    } catch { /* not JSON — the status line is all there is */ }
    throw new Error(detail)
  }
  return await res.json() as T
}

export function httpTableCatalog(opts: HttpTableCatalogOptions): TableCatalog {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const capabilities = opts.capabilities ?? ALL

  let objectsPromise: Promise<readonly TableObject[]> | null = null

  /** The parameters every request carries. */
  const identity = () => {
    const params = new URLSearchParams({ path: opts.path })
    if (opts.version) params.set('version', opts.version)
    return params
  }

  return {
    objects() {
      objectsPromise ??= getJson<{ objects: TableObject[] }>(
        doFetch, `${base}/objects?${identity()}`,
      ).then(r => r.objects)
      return objectsPromise
    },

    source(table: string): TableSource {
      let columnsPromise: Promise<readonly TableColumn[]> | null = null

      const page = async (req: PageRequest): Promise<PageResult> => {
        const params = identity()
        params.set('table', table)
        params.set('offset', String(req.offset))
        params.set('limit', String(req.limit))
        if (req.filter?.trim()) params.set('filter', req.filter)
        if (req.sort) { params.set('sort', req.sort.column); params.set('dir', req.sort.dir) }
        return getJson<PageResult>(doFetch, `${base}/page?${params}`)
      }

      return {
        page,
        columns() {
          // No separate endpoint: a zero-row page carries the columns,
          // and in practice the first real page has already answered
          // this. One request either way.
          columnsPromise ??= page({ offset: 0, limit: 0 }).then(r => r.columns)
          return columnsPromise
        },
        capabilities,
      }
    },
  }
}
