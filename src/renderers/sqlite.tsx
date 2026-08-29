/** SQLite viewer: a database browses as a list of tables, each paged
 *  by the engine rather than by this code.
 *
 *  What's different from the parquet and CSV viewers is where the work
 *  happens. Those stream bytes and then sort, filter and count in
 *  JavaScript once the file is small enough to hold — which is the best
 *  available answer when the format can't be asked anything. A database
 *  can be asked. So there is no small-table mode here and no
 *  `fullLoadMaxBytes`: `LIMIT`, `ORDER BY` and `WHERE` all go down to
 *  SQLite, which reads the handful of pages they need through
 *  `StoreVFS` and leaves the rest of the file alone. Opening a 2 GB
 *  database and sorting a column is the same three-page index seek it
 *  would be locally.
 *
 *  The connection is held open for the life of the view, on purpose:
 *  the VFS accumulates a page cache, and that cache is the difference
 *  between a first click and every click after it. See
 *  `specs/sqlite-and-table-sources.md`.
 *
 *  The wasm is not bundled — a consumer passes `wasm`, so a page that
 *  never opens a database never downloads a megabyte of SQLite. */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react'
import type { Store } from '../types'
import type { PersistedState } from '../react/persistedState'
import { defaultUseState } from '../react/persistedState'
import { SqliteDb, type SqliteObject, type SqliteRuntime, type SqliteWasmSource } from '../sqlite/db'
import { sqliteTableSource } from '../sqlite/tableSource'
import { rangeReaderFromStore, type StoreVFSOptions } from '../sqlite/vfs'
import type { PageResult } from './tableSource'
import {
  resolveColStyles, TD_STYLE, TH_STYLE,
  type TableCellCtx, type TableColumn, type TablePageCtx, type TableViewerOptions,
} from './table'
import { ColumnPicker, FilterInput, useColumnVisibility, useFilter, usePageNotify, useStableCallback } from './tableControls'
import { sortGlyph, useSort } from './tableSort'

/** Rows per page.
 *
 *  Larger than the parquet viewer's row-group pages because the cost is
 *  different in kind: another hundred rows is a longer `LIMIT` against
 *  pages SQLite is already holding, not another range request. */
export const DEFAULT_PAGE_SIZE = 100

export interface SqliteViewerOptions extends Omit<TableViewerOptions, 'fullLoadMaxBytes' | 'sortComparators'> {
  /** Where the SQLite wasm comes from. Required — the library can't
   *  guess a URL that works under an arbitrary bundler, and baking one
   *  in would put a megabyte in everyone's bundle. Under Vite:
   *
   *      wasm: { wasmUrl: new URL(
   *        'wa-sqlite/dist/wa-sqlite-async.wasm', import.meta.url).href }
   */
  wasm: SqliteWasmSource
  /** Share one instantiated wasm runtime across viewers. */
  runtime?: SqliteRuntime
  /** Block sizes and cache ceiling for the underlying `StoreVFS`. A
   *  Worker proxying this should raise them; a browser on a slow link
   *  should not. */
  vfs?: StoreVFSOptions
  pageSize?: number
  /** Show the ranged-read counter — how many requests this view has
   *  actually made, and how many it served from cache. Off by default;
   *  it explains the design more than it helps a reader. */
  showStats?: boolean
}

const BTN: CSSProperties = {
  font: 'inherit', fontSize: '0.85em', lineHeight: 1.4, cursor: 'pointer',
  padding: '0.15em 0.5em', borderRadius: 3, color: 'inherit',
  border: '1px solid rgba(127,127,127,0.4)', background: 'transparent',
}

const NUMERIC_KINDS = new Set<TableColumn['kind']>(['number'])

const plural = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`

/** Render a cell value the way SQLite handed it over.
 *
 *  `null` is shown rather than left blank: in a database the difference
 *  between NULL and the empty string is meaningful, and a blank cell
 *  reads as neither. */
function defaultCell(value: unknown): ReactNode {
  if (value === null || value === undefined) {
    return <span style={{ opacity: 0.4 }}>null</span>
  }
  if (value instanceof Uint8Array) {
    return <span style={{ opacity: 0.6 }}>{`<${value.byteLength} bytes>`}</span>
  }
  return String(value)
}

export function SqliteViewer({
  store, path, usePersistedState, wasm, runtime, vfs, pageSize = DEFAULT_PAGE_SIZE,
  showStats = false, renderCell, renderHeader, cellProps, headerProps,
  columnPicker = false, hiddenColumns, onPage, onCellHover,
}: { store: Store; path: string; usePersistedState?: PersistedState } & SqliteViewerOptions) {
  const use = usePersistedState ?? defaultUseState

  const [db, setDb] = useState<SqliteDb | null>(null)
  const [objects, setObjects] = useState<readonly SqliteObject[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const [table, setTable] = use<string>('table', '')
  const [page, setPage] = use<number>('page', 0)
  const [filter, setFilter] = useFilter(usePersistedState)
  const sort = useSort(usePersistedState)

  const [result, setResult] = useState<PageResult | null>(null)
  const [loading, setLoading] = useState(false)

  // Open once per (store, path). The connection — and with it the VFS
  // page cache — outlives every table switch, sort and page turn.
  useEffect(() => {
    let live = true
    let opened: SqliteDb | null = null
    setDb(null); setObjects(null); setError(null); setResult(null)
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

  /** The table actually being shown: the URL's, when it exists in this
   *  file, else the first one. A `?table=` pasted across databases
   *  should land somewhere rather than on an error. */
  const active = useMemo(() => {
    if (!objects?.length) return null
    return objects.find(o => o.name === table) ?? objects[0]!
  }, [objects, table])

  const source = useMemo(
    () => (db && active ? sqliteTableSource(db, active.name) : null),
    [db, active])

  const columns = result?.columns ?? []
  const { visible, ...vis } = useColumnVisibility(columns, usePersistedState, hiddenColumns)

  useEffect(() => {
    if (!source) return
    let live = true
    setLoading(true)
    source
      .page({ offset: page * pageSize, limit: pageSize, filter, ...(sort.column ? { sort: { column: sort.column, dir: sort.dir } } : {}) })
      .then(r => { if (live) { setResult(r); setError(null) } })
      .catch(e => { if (live) setError(e instanceof Error ? e : new Error(String(e))) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [source, page, pageSize, filter, sort.column, sort.dir])

  // Reset to the first page whenever the shape of the query changes —
  // page 40 of an unfiltered table is rarely page 40 of a filtered one.
  //
  // Skipping the first run is the whole subtlety: a plain effect fires
  // on mount too, which throws away the `?page=` in a link someone
  // shared. Seeding the ref with the initial key means "changed" means
  // changed *since this view opened*.
  const queryKey = `${active?.name ?? ''}\u0000${filter}\u0000${sort.column ?? ''}${sort.dir}`
  const lastQueryKey = useRef<string | null>(null)
  useEffect(() => {
    // Not before there's a table: `active` is null until the database
    // opens, so the first *real* key always differs from the mount-time
    // one, and resetting on that difference throws away a shared
    // `?page=`. The null seed means "adopt, don't reset".
    if (!active) return
    if (lastQueryKey.current !== null && lastQueryKey.current !== queryKey) setPage(0)
    lastQueryKey.current = queryKey
  }, [active, queryKey, setPage])

  const rows = result?.rows ?? []
  const total = result?.total ?? null
  const pageStart = result?.offset ?? 0

  // The unfiltered total, remembered per table, so the filter can read
  // `12 / 900` rather than `12 / 12`. Only ever learned by having been
  // unfiltered at some point — landing on a filtered URL means the
  // denominator is genuinely unknown, and inventing one by running a
  // second `count(*)` would be a scan nobody asked for.
  const unfilteredTotals = useRef(new Map<string, number>())
  if (active && !filter.trim() && total !== null) unfilteredTotals.current.set(active.name, total)
  const unfilteredTotal = active ? unfilteredTotals.current.get(active.name) : undefined

  const colStyles = useMemo(
    () => resolveColStyles(columns, path, { cellProps, headerProps },
      c => NUMERIC_KINDS.has(c.kind)),
    [columns, path, cellProps, headerProps])

  // Outward-facing hooks, called before any early return: a hook after
  // a conditional `return` runs on some renders and not others, which
  // React rejects outright. The page they describe is derived above, so
  // it's passed by ref and read when the effect fires.
  const pageCtxRef = useRef<TablePageCtx>({ rows: [], columns: [], path, pageStart: 0, totalRows: null })
  pageCtxRef.current = {
    rows,
    columns: columns.filter(c => visible.includes(c.name)),
    path,
    pageStart,
    totalRows: total,
  }
  usePageNotify(onPage, pageCtxRef, [rows, visible, path, pageStart, total])
  const notifyHover = useStableCallback(onCellHover)

  const hoverHandlers = useCallback((ctx: TableCellCtx) => (onCellHover
    ? { onMouseEnter: () => notifyHover(ctx), onMouseLeave: () => notifyHover(null) }
    : {}), [onCellHover, notifyHover])

  if (error) {
    return (
      <div style={{ color: 'crimson', fontSize: '0.9em' }}>
        <strong>SQLite:</strong> {error.message}
      </div>
    )
  }
  if (!objects) return <div style={{ opacity: 0.6 }}>opening database…</div>
  if (!objects.length) return <div style={{ opacity: 0.6 }}>no tables or views in this database</div>

  const lastPage = total === null ? null : Math.max(0, Math.ceil(total / pageSize) - 1)
  const shown = columns.filter(c => visible.includes(c.name))

  return (
    <div>
      {/* Positioned so the column picker's panel can paint over the
          sticky header — a z-index on the picker alone can't, since it
          is a flex item of this line and paints in the line's place in
          the root stacking order. */}
      <p style={{
        opacity: 0.85, fontSize: '0.95em', display: 'flex', alignItems: 'center',
        gap: '0.6em', flexWrap: 'wrap', position: 'relative', zIndex: 2,
      }}>
        <select
          value={active?.name ?? ''}
          onChange={e => setTable(e.target.value)}
          aria-label="Table"
          style={{ ...BTN, cursor: 'pointer' }}
        >
          {objects.map(o => (
            <option key={o.name} value={o.name}>
              {o.name}{o.type === 'view' ? ' (view)' : ''}
            </option>
          ))}
        </select>
        <span style={{ opacity: 0.7 }}>
          {plural(total ?? rows.length, 'row')}
          {total !== null && total > 0 && ` · ${(pageStart + 1).toLocaleString()}–${(pageStart + rows.length).toLocaleString()}`}
        </span>
        <FilterInput
          value={filter}
          onChange={setFilter}
          placeholder="filter"
          {...(total !== null && unfilteredTotal !== undefined
            ? { count: { shown: total, total: unfilteredTotal } }
            : {})}
        />
        {columnPicker && columns.length > 0 && <ColumnPicker columns={columns} vis={{ visible, ...vis }} />}
        {loading && <span style={{ opacity: 0.5 }}>…</span>}
        {showStats && db && (
          <span style={{ opacity: 0.5, fontSize: '0.9em' }} title="ranged reads / cache hits">
            {db.stats.reads} reads · {db.stats.hits} cached
          </span>
        )}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82em', fontFamily: 'ui-monospace, monospace' }}>
          <thead>
            <tr style={{
              position: 'sticky', top: 0, zIndex: 1,
              background: 'linear-gradient(rgba(127,127,127,0.15), rgba(127,127,127,0.15)), Canvas',
            }}>
              {shown.map(c => {
                const styles = colStyles.get(c.name)
                const label = (
                  <span
                    onClick={() => sort.toggle(c.name)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    title={`Sort by ${c.name}`}
                  >
                    {c.name}{' '}
                    <span style={{ opacity: sort.column === c.name ? 0.9 : 0.3 }}>
                      {sortGlyph(c.name, sort)}
                    </span>
                  </span>
                )
                return (
                  <th
                    key={c.name}
                    style={styles?.header ?? TH_STYLE}
                    {...(styles?.headerClass ? { className: styles.headerClass } : {})}
                  >
                    {renderHeader ? renderHeader({ column: c, path, defaultNode: label }) : label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={pageStart + i}>
                {shown.map(c => {
                  const styles = colStyles.get(c.name)
                  const ctx: TableCellCtx = {
                    value: row[c.name],
                    column: c,
                    row,
                    rowIndex: pageStart + i,
                    path,
                    defaultNode: defaultCell(row[c.name]),
                  }
                  return (
                    <td
                      key={c.name}
                      style={styles?.cell ?? TD_STYLE}
                      {...(styles?.cellClass ? { className: styles.cellClass } : {})}
                      {...hoverHandlers(ctx)}
                    >
                      {renderCell ? renderCell(ctx) : ctx.defaultNode}
                    </td>
                  )
                })}
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={Math.max(1, shown.length)} style={{ ...TD_STYLE, opacity: 0.6 }}>
                  {filter.trim() ? 'no rows match' : 'no rows'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginTop: '0.6em' }}>
        <button type="button" style={BTN} disabled={page === 0} onClick={() => setPage(page - 1)}>‹ prev</button>
        <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
          page {(page + 1).toLocaleString()}{lastPage !== null && ` / ${(lastPage + 1).toLocaleString()}`}
        </span>
        <button
          type="button"
          style={BTN}
          disabled={lastPage !== null ? page >= lastPage : rows.length < pageSize}
          onClick={() => setPage(page + 1)}
        >next ›</button>
      </p>
    </div>
  )
}

export default SqliteViewer
