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
 */
import { Link, useLocation } from 'react-router-dom'
import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url'
import SqliteViewer from '@rdub/file-tree/renderers/sqlite'
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

  return (
    <SqliteViewer
      {...props}
      wasm={{ wasmUrl }}
      renderCell={renderCell}
      columnPicker
      showStats
      pageSize={25}
    />
  )
}
