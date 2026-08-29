/** SQLite viewer, running the engine in this tab.
 *
 *  Wiring, not UI: it opens a connection over `StoreVFS`, wraps it in a
 *  `TableCatalog`, and hands that to `<TableBrowser>`. The remote
 *  variant next door does the same with an HTTP catalog and gets the
 *  identical view, which is the argument for the catalog existing.
 *
 *  What's different from the parquet and CSV viewers is where the work
 *  happens. Those stream bytes and then sort, filter and count in
 *  JavaScript once the file is small enough to hold — the best answer
 *  available when the format can't be asked anything. A database can be
 *  asked. So there is no small-table mode here and no
 *  `fullLoadMaxBytes`: `LIMIT`, `ORDER BY` and `WHERE` all go down to
 *  SQLite, which reads the handful of pages they need and leaves the
 *  rest of the file alone.
 *
 *  The connection is held open for the life of the view, on purpose:
 *  the VFS accumulates a page cache, and that cache is the difference
 *  between a first click and every click after it. See
 *  `specs/sqlite-and-table-sources.md`.
 *
 *  The wasm is not bundled — a consumer passes `wasm`, so a page that
 *  never opens a database never downloads a megabyte of SQLite. */
import { useEffect, useMemo, useState } from 'react'
import type { Store } from '../types'
import type { PersistedState } from '../react/persistedState'
import { SqliteDb, type SqliteRuntime, type SqliteWasmSource } from '../sqlite/db'
import { sqliteCatalog, type SqliteTableSourceOptions } from '../sqlite/tableSource'
import { rangeReaderFromStore, type StoreVFSOptions } from '../sqlite/vfs'
import type { TableObject } from './tableSource'
import { TableBrowser, type TableBrowserOptions } from './tableBrowser'

export { DEFAULT_PAGE_SIZE } from './tableBrowser'

export interface SqliteViewerOptions extends TableBrowserOptions, SqliteTableSourceOptions {
  /** Where the SQLite wasm comes from. Required — the library can't
   *  guess a URL that works under an arbitrary bundler, and baking one
   *  in would put a megabyte in everyone's bundle. Under Vite:
   *
   *      import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url'
   *      <SqliteViewer wasm={{ wasmUrl }} … />
   */
  wasm: SqliteWasmSource
  /** Share one instantiated wasm runtime across viewers. */
  runtime?: SqliteRuntime
  /** Block sizes and cache ceiling for the underlying `StoreVFS`. A
   *  Worker proxying this should raise them; a browser on a slow link
   *  should not. */
  vfs?: StoreVFSOptions
  /** Show the ranged-read counter — how many requests this view has
   *  actually made, and how many it served from cache. Off by default;
   *  it explains the design more than it helps a reader. */
  showStats?: boolean
}

export function SqliteViewer({
  store, path, usePersistedState, wasm, runtime, vfs, showStats = false, countRows,
  ...browser
}: { store: Store; path: string; usePersistedState?: PersistedState } & SqliteViewerOptions) {
  const [db, setDb] = useState<SqliteDb | null>(null)
  const [objects, setObjects] = useState<readonly TableObject[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Open once per (store, path). The connection — and with it the VFS
  // page cache — outlives every table switch, sort and page turn.
  useEffect(() => {
    let live = true
    let opened: SqliteDb | null = null
    setDb(null); setObjects(null); setError(null)
    ;(async () => {
      try {
        const reader = await rangeReaderFromStore(store, path)
        opened = await SqliteDb.open(reader, wasm, { ...vfs, ...(runtime ? { runtime } : {}) })
        const found = await opened.objects()
        if (!live) return
        setDb(opened)
        setObjects(found)
      } catch (e) {
        if (live) setError(e instanceof Error ? e : new Error(String(e)))
      }
    })()
    return () => {
      live = false
      void opened?.close()
    }
    // `wasm`/`vfs` are option objects a consumer may recreate each
    // render; reopening on their identity would loop. The file is what
    // identifies the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, path])

  const catalog = useMemo(
    () => (db ? sqliteCatalog(db, countRows === undefined ? {} : { countRows }) : null),
    [db, countRows])

  if (error) {
    return (
      <div style={{ color: 'crimson', fontSize: '0.9em' }}>
        <strong>SQLite:</strong> {error.message}
      </div>
    )
  }
  if (!catalog || !objects) return <div style={{ opacity: 0.6 }}>opening database…</div>

  return (
    <TableBrowser
      {...browser}
      catalog={catalog}
      objects={objects}
      path={path}
      {...(usePersistedState ? { usePersistedState } : {})}
      {...(showStats && db
        ? {
            status: (
              <span style={{ opacity: 0.5, fontSize: '0.9em' }} title="ranged reads / cache hits">
                {db.stats.reads} reads · {db.stats.hits} cached
              </span>
            ),
          }
        : {})}
    />
  )
}

export default SqliteViewer
