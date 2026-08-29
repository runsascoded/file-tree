/** The SQLite viewer, wired for this demo.
 *
 *  Two things a consumer has to supply, and this is what supplying them
 *  looks like:
 *
 *  1. **Where the wasm is.** The library can't guess a URL that works
 *     under an arbitrary bundler, and baking one in would put a
 *     megabyte in every consumer's bundle. Under Vite, `?url` resolves
 *     a bare package specifier to an emitted asset — so the import
 *     below is the whole answer, and the wasm is fetched only when this
 *     module loads, which is only when a `.sqlite` is opened.
 *
 *  2. **What the columns mean.** `renderCell` here turns `station_id`
 *     into a link that filters the `stations` table down to that row —
 *     a foreign key rendered as one, without the library knowing what a
 *     foreign key is.
 *
 *  It also carries an *engine* toggle, in dev only. Both branches render
 *  the same `<TableBrowser>`; they differ in who runs SQLite. In the
 *  browser, every page of pages SQLite needs is a round-trip. On the
 *  server — a Vite middleware here, a Cloudflare Worker with an R2
 *  binding in production — the seeking is colocated and the browser gets
 *  one request and some rows. The read counter only exists in the local
 *  branch, because in the remote one this page has made no ranged reads
 *  at all.
 */
import { Link, useLocation } from 'react-router-dom'
import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url'
import SqliteViewer from '@rdub/file-tree/renderers/sqlite'
import RemoteTableViewer from '@rdub/file-tree/renderers/remoteTable'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import type { TableCellCtx } from '@rdub/file-tree/renderers/table'
import type { Store } from '@rdub/file-tree'
import type { PersistedState } from '@rdub/file-tree/react'

const LINK: React.CSSProperties = { color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline' }

export default function CatalogViewer(props: {
  store: Store
  path: string
  usePersistedState?: PersistedState
}) {
  const { pathname } = useLocation()
  const [engine, setEngine] = useUrlPersistedState<string>('engine', 'browser')

  /** The `stations` table, filtered to one row.
   *
   *  A real `<a href>`, not a click handler on a span: the viewer's
   *  whole state lives in query params, so cross-table navigation *is*
   *  a URL — which means it opens in a new tab, works from the
   *  keyboard, and can be copied. That it needs no API from the library
   *  is the point.  */
  const stationHref = (id: unknown) => {
    const params = new URLSearchParams({
      table: 'stations',
      q: `Station ${String(id).padStart(3, '0')}`,
    })
    return `${pathname}?${params}`
  }

  const renderCell = (ctx: TableCellCtx) => {
    if (ctx.column.name === 'station_id' && ctx.value !== null) {
      return (
        <Link to={stationHref(ctx.value)} style={LINK} title="Show this station">
          {String(ctx.value)}
        </Link>
      )
    }
    if (ctx.column.name === 'member') {
      return <span style={{ opacity: 0.8 }}>{ctx.value ? 'member' : 'casual'}</span>
    }
    if (ctx.column.name === 'duration_s' && typeof ctx.value === 'number') {
      const m = Math.floor(ctx.value / 60)
      return <span title={`${ctx.value}s`}>{m}m {ctx.value % 60}s</span>
    }
    return ctx.defaultNode
  }

  const shared = {
    renderCell,
    columnPicker: true,
    pageSize: 25,
    usePersistedState: props.usePersistedState,
  }

  return (
    <>
      {import.meta.env.DEV && <EngineToggle engine={engine} setEngine={setEngine} />}
      {engine === 'server'
        ? <RemoteTableViewer {...shared} path={props.path} baseUrl="/api/tables" />
        : <SqliteViewer {...shared} {...props} wasm={{ wasmUrl }} showStats />}
    </>
  )
}

const TOGGLE: React.CSSProperties = {
  font: 'inherit', fontSize: '0.85em', padding: '0.15em 0.5em', borderRadius: 3,
  border: '1px solid rgba(127,127,127,0.4)', background: 'transparent',
  color: 'inherit', cursor: 'pointer',
}

function EngineToggle({ engine, setEngine }: { engine: string; setEngine: (v: string) => void }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: '0.5em', fontSize: '0.9em', opacity: 0.85 }}>
      <span style={{ opacity: 0.7 }}>engine:</span>
      {(['browser', 'server'] as const).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => setEngine(v)}
          style={{ ...TOGGLE, fontWeight: engine === v ? 600 : 400, opacity: engine === v ? 1 : 0.6 }}
        >{v}</button>
      ))}
      <span style={{ opacity: 0.55 }}>
        {engine === 'server'
          ? 'wasm SQLite in a Vite middleware — one request per page, no bytes in the browser'
          : 'wasm SQLite in this tab, reading the file by ranges'}
      </span>
    </p>
  )
}
