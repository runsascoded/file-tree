/** The same table browser, against an engine running somewhere else.
 *
 *  Modes 2 and 3 of `specs/sqlite-and-table-sources.md`, and they are
 *  the same component because they are the same protocol: a Cloudflare
 *  Worker with an R2 binding and a machine running native `sqlite3`
 *  differ in what answers `/objects` and `/page`, not in what asks.
 *
 *  Prefer this over `<SqliteViewer>` when either is true:
 *
 *  - **The database is large or the link is slow.** SQLite's page reads
 *    are dependent and can't be pipelined, so a query costing a
 *    colocated server a few reads costs a browser that many serial
 *    round-trips.
 *  - **The database isn't public.** Nothing crosses the wire but rows.
 *
 *  Nothing here imports `wa-sqlite`, so a page that only ever browses
 *  remotely never downloads it. */
import { useEffect, useMemo, useState } from 'react'
import type { PersistedState } from '../react/persistedState'
import { httpTableCatalog, type HttpTableCatalogOptions } from './httpTableSource'
import type { TableObject } from './tableSource'
import { TableBrowser, type TableBrowserOptions } from './tableBrowser'

export interface RemoteTableViewerOptions extends TableBrowserOptions,
  Omit<HttpTableCatalogOptions, 'path'> {}

export function RemoteTableViewer({
  path, usePersistedState, baseUrl, fetch: doFetch, capabilities, ...browser
}: { path: string; usePersistedState?: PersistedState } & RemoteTableViewerOptions) {
  const [objects, setObjects] = useState<readonly TableObject[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const catalog = useMemo(
    () => httpTableCatalog({
      baseUrl,
      path,
      ...(doFetch ? { fetch: doFetch } : {}),
      ...(capabilities ? { capabilities } : {}),
    }),
    // `capabilities` is a literal a consumer may recreate each render;
    // rebuilding the catalog on its identity would discard every
    // memoised source and refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl, path, doFetch])

  useEffect(() => {
    let live = true
    setObjects(null); setError(null)
    catalog.objects()
      .then(o => { if (live) setObjects(o) })
      .catch(e => { if (live) setError(e instanceof Error ? e : new Error(String(e))) })
    return () => { live = false }
  }, [catalog])

  if (error) {
    return (
      <div style={{ color: 'crimson', fontSize: '0.9em' }}>
        <strong>Tables:</strong> {error.message}
      </div>
    )
  }
  if (!objects) return <div style={{ opacity: 0.6 }}>loading tables…</div>

  return (
    <TableBrowser
      {...browser}
      catalog={catalog}
      objects={objects}
      path={path}
      {...(usePersistedState ? { usePersistedState } : {})}
    />
  )
}

export default RemoteTableViewer
