/** Range-paginated CSV/TSV table. Header is fetched once on mount;
 *  body pages are independent 256 KB range-reads from the underlying
 *  `Store`. Drops the partial first/last line on each page to avoid
 *  splitting rows across chunk boundaries.
 *
 *  Wire as `<FileTree csvRenderer={CsvViewer}>`. Doesn't handle multi-
 *  line quoted fields (a quote opening on one line and closing on the
 *  next) — those would need a streaming parser since byte-paginated
 *  chunks can split mid-row. */
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Store } from '../types'
import { fmtSize } from '../react/fmt'
import { PAGE_BYTES, useAllCsvRows, useCsvHeader, useCsvPage } from './csvData'
import { ColumnPicker, FilterInput, filterRows, useColumnVisibility, useFilter, usePageNotify } from './tableControls'
import { DEFAULT_FULL_LOAD_MAX_BYTES, sortGlyph, useSort, useSortedRows } from './tableSort'

// Re-exported so the public subpath keeps every name it had; the
// plumbing now lives in `./csvData` and is importable on its own.
export { HEADER_PROBE_BYTES, PAGE_BYTES, parseLine, useCsvHeader, useCsvPage } from './csvData'
import { resolveColStyles, resolveElide, TH_STYLE, type TableColumn, type TablePageCtx, type TableViewerOptions } from './table'
import { PathNote, TableRows } from './tableBody'
import { pathModes } from './tableRuns'
import { ColumnResizeHandle, useColumnWidths } from './columnResize'
import type { PersistedState } from '../react/persistedState'

export type { TableCellCtx, TableCellRenderer, TableColumn, TableViewerOptions } from './table'
export { chainCellRenderers, repeatsAbove } from './table'
export { dittoMark, dittoRenderer } from './ditto'
export type { DittoOption, PathMode, PathsOption, RunMode, RunSpec, TableRun } from './tableRuns'

const ROW_STYLE: CSSProperties = { borderTop: '1px solid rgba(127,127,127,0.15)' }
/** A CSV value is a string, drawn as itself. */
const csvCell = (value: unknown): ReactNode => value as string

/** Note `rowIndex` in `renderCell` is **page-relative** here: pages are
 *  byte ranges, so the viewer never learns how many rows preceded them.
 *
 *  CSV columns carry a name and nothing else: the format has no types,
 *  and guessing one from the bytes is the consumer's call — a column of
 *  digits may well be a zip code. So `kind` stays absent, and numeric
 *  alignment (which parquet does from its schema) is off by default
 *  here rather than inferred. */
export interface CsvViewerOptions extends TableViewerOptions<TableColumn> {}

/** Options bound up front, so `<FileTree csvRenderer={…}>` can take a
 *  customized viewer. Module scope: this mints a component type, and
 *  calling it in render would remount the table on every pass. */
export function makeCsvViewer(opts: CsvViewerOptions = {}) {
  return function BoundCsvViewer(props: { store: Store; path: string; delimiter: string; usePersistedState?: PersistedState }) {
    return <CsvViewer {...props} {...opts} />
  }
}

export function CsvViewer({ store, path, delimiter, usePersistedState, renderCell, renderHeader, cellProps, headerProps, columnPicker = false, hiddenColumns, fullLoadMaxBytes = DEFAULT_FULL_LOAD_MAX_BYTES, sortComparators, ditto, paths, onPage, onCellHover, elide, resizableColumns = false }: {
  store: Store; path: string; delimiter: string; usePersistedState?: PersistedState
} & CsvViewerOptions) {
  const { header, total, error: headerError } = useCsvHeader(store, path, delimiter)
  const [page, setPage] = useState(0)
  // Small-table mode: below the threshold the whole file is read once
  // and sorting becomes possible; above it the viewer pages byte ranges
  // as it always has. See `specs/small-table-mode.md`.
  const smallTable = total !== null && total <= fullLoadMaxBytes
  const { rows: pageRows, error: pageError } = useCsvPage(store, path, delimiter, page, smallTable ? null : total)
  const { rows: allRaw, error: allError } = useAllCsvRows(store, path, delimiter, smallTable)
  const sort = useSort(usePersistedState)
  const [filter, setFilter] = useFilter(usePersistedState)
  const error = headerError ?? (smallTable ? allError : pageError)

  const allColumns: TableColumn[] = useMemo(() => (header ?? []).map(name => ({ name })), [header])
  const { visible, ...vis } = useColumnVisibility(allColumns, usePersistedState, hiddenColumns)
  const columns = useMemo(() => allColumns.filter(c => visible.includes(c.name)), [allColumns, visible])
  // Sorting works on named values, but a CSV row is positional — so
  // rows are keyed by column name for the comparator.
  const keyed = useMemo(
    () => allRaw?.map(r => Object.fromEntries(allColumns.map((c, i) => [c.name, r[i] ?? '']))) ?? null,
    [allRaw, allColumns])
  const sortedKeyed = useSortedRows(keyed, sort, sortComparators, allColumns)
  const filteredKeyed = useMemo(
    () => filterRows(sortedKeyed, filter, visible),
    [sortedKeyed, filter, visible])
  const allSorted = useMemo(
    () => filteredKeyed?.map(o => allColumns.map(c => String(o[c.name] ?? ''))) ?? null,
    [filteredKeyed, allColumns])

  const el = useMemo(() => resolveElide(elide), [elide])
  const cw = useColumnWidths({
    on: !!resizableColumns,
    scope: typeof resizableColumns === 'object' ? (resizableColumns.scope ?? 'path') : 'path',
    columns: allColumns, path, usePersistedState,
  })
  const colStyles = useMemo(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, () => false, el),
    [columns, path, cellProps, headerProps, el])

  // Small-table mode has the whole file, so there's nothing to page and
  // an exact row count to show — which byte-range paging can never give.
  const rows = smallTable ? allSorted : pageRows
  // Rows go out keyed by name — a positional array would be unusable.
  // Built from *all* columns, so a `renderCell` reading a sibling (or a
  // neighbor, via `at`) keeps working when that sibling is hidden.
  const rowObjs = useMemo(
    () => (rows ?? []).map(r => Object.fromEntries(allColumns.map((c, i) => [c.name, r[i] ?? '']))),
    [rows, allColumns])

  // Called before the early returns — see `usePageNotify`.
  const pageCtxRef = useRef<TablePageCtx>({ rows: [], columns: [], path, pageStart: 0, totalRows: null })
  usePageNotify(onPage, pageCtxRef, [pageRows, allSorted, columns.length, path, smallTable])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (total === null || header === null) return <div style={{ opacity: 0.6 }}>reading CSV header…</div>

  const pages = smallTable ? 1 : Math.max(1, Math.ceil(total / PAGE_BYTES))
  // `totalRows` is null when streaming: byte-range pages never learn how
  // many rows preceded them, so the viewer genuinely doesn't know.
  pageCtxRef.current = {
    rows: rowObjs,
    columns,
    path,
    pageStart: 0,
    totalRows: smallTable ? (rows?.length ?? null) : null,
  }

  const pathNotes = paths ? pathModes(rowObjs, columns, paths).notes : undefined

  const offsetStart = page * PAGE_BYTES
  const offsetEnd = Math.min(total, offsetStart + PAGE_BYTES)

  return (
    <>
      {/* `position`/`z-index`: the column picker's panel drops over the
          table below, and its own z-index can't lift it past this
          line's place in the paint order. */}
      <p style={{ opacity: 0.7, fontSize: '0.95em', margin: '0 0 0.6em', position: 'relative', zIndex: 2 }}>
        <b>{allColumns.length}</b> columns
        {smallTable && rows ? <> · <b>{rows.length.toLocaleString()}</b> rows</> : null}
        {' '}· {fmtSize(total)}
        {columnPicker && <> · <ColumnPicker columns={allColumns} vis={{ visible, ...vis }} /></>}
      </p>
      {smallTable && (
        <p style={{ opacity: 0.8, fontSize: '0.9em', margin: '0 0 0.5em' }}>
          <FilterInput
            value={filter}
            onChange={setFilter}
            placeholder="filter rows"
            {...(sortedKeyed ? { count: { shown: rows?.length ?? 0, total: sortedKeyed.length } } : {})}
          />
        </p>
      )}
      {!smallTable && (
        <p style={{ opacity: 0.6, fontSize: '0.85em', margin: '0 0 0.4em' }}>
          {fmtSize(total)} — streaming byte ranges; sorting needs the whole file.
        </p>
      )}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', margin: '0.4em 0', fontSize: '0.9em', flexWrap: 'wrap' }}>
          <button disabled={page === 0} onClick={() => setPage(0)}>«</button>
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
          <span style={{ opacity: 0.8 }}>
            page <b>{page + 1}</b> / {pages.toLocaleString()} · bytes {offsetStart.toLocaleString()}–{offsetEnd.toLocaleString()} / {total.toLocaleString()}
          </span>
          <button disabled={page === pages - 1} onClick={() => setPage(page + 1)}>›</button>
          <button disabled={page === pages - 1} onClick={() => setPage(pages - 1)}>»</button>
        </div>
      )}
      <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 4 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82em', fontFamily: 'ui-monospace, monospace' }}>
          <thead>
            {/* `Canvas` (the UA document background) rather than a
                hardcoded dark fallback, which rendered a black bar in a
                light-themed host that didn't define `--bg`. */}
            <tr style={{ position: 'sticky', top: 0, zIndex: 1, background: 'Canvas' }}>
              {columns.map(c => {
                const st = colStyles.get(c.name)
                // Sort control absent, not disabled, above the threshold.
                const defaultNode = smallTable
                  ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => sort.toggle(c.name)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort.toggle(c.name) } }}
                      title={`Sort by ${c.name}`}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      {c.name}
                      <span style={{ opacity: sort.column === c.name ? 0.8 : 0.3, marginLeft: '0.3em', fontSize: '0.85em' }}>
                        {sortGlyph(c.name, sort)}
                      </span>
                    </span>
                  )
                  : c.name
                return (
                  <th key={c.name} style={{ ...(st?.header ?? TH_STYLE), whiteSpace: 'nowrap', ...(resizableColumns ? { position: 'relative' } : {}), ...cw.styleFor(c.name) }} className={st?.headerClass}>
                    {renderHeader ? renderHeader({ column: c, path, defaultNode }) : defaultNode}
                    <PathNote note={pathNotes?.get(c.name)} onSort={smallTable ? () => sort.toggle(c.name) : undefined} />
                    {resizableColumns && <ColumnResizeHandle col={c.name} widths={cw} />}
                  </th>
                )
              })}
            </tr>
          </thead>
          <TableRows
            rows={rowObjs}
            columns={columns}
            path={path}
            colStyles={colStyles}
            widthStyle={cw.styleFor}
            el={el}
            {...(ditto ? { ditto } : {})}
            {...(paths ? { paths } : {})}
            {...(renderCell ? { renderCell } : {})}
            defaultNode={csvCell}
            rowIndex={i => i}
            rowStyle={ROW_STYLE}
            {...(onCellHover ? { onCellHover } : {})}
          >
            {rows === null && (
              <tr><td colSpan={columns.length} style={{ padding: '0.5em', opacity: 0.6 }}>loading…</td></tr>
            )}
          </TableRows>
        </table>
      </div>
    </>
  )
}

/** Default export so the viewer registry can `load: () => import(…)`
 *  without an unwrapping step. The named export stays for consumers
 *  wiring it through the `*Renderer` props. */
export default CsvViewer
