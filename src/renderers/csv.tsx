/** Range-paginated CSV/TSV table. Header is fetched once on mount;
 *  body pages are independent 256 KB range-reads from the underlying
 *  `Store`. Drops the partial first/last line on each page to avoid
 *  splitting rows across chunk boundaries.
 *
 *  Wire as `<FileTree csvRenderer={CsvViewer}>`. Doesn't handle multi-
 *  line quoted fields (a quote opening on one line and closing on the
 *  next) — those would need a streaming parser since byte-paginated
 *  chunks can split mid-row. */
import { useMemo, useState } from 'react'
import type { Store } from '../types'
import { fmtSize } from '../react/fmt'
import { PAGE_BYTES, useCsvHeader, useCsvPage } from './csvData'
import { ColumnPicker, useColumnVisibility } from './tableControls'

// Re-exported so the public subpath keeps every name it had; the
// plumbing now lives in `./csvData` and is importable on its own.
export { HEADER_PROBE_BYTES, PAGE_BYTES, parseLine, useCsvHeader, useCsvPage } from './csvData'
import { resolveColStyles, TD_STYLE, TH_STYLE, type TableColumn, type TableViewerOptions } from './table'
import type { PersistedState } from '../react/persistedState'

export type { TableCellCtx, TableCellRenderer, TableColumn, TableViewerOptions } from './table'

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

export function CsvViewer({ store, path, delimiter, usePersistedState, renderCell, renderHeader, cellProps, headerProps, columnPicker = false, hiddenColumns }: {
  store: Store; path: string; delimiter: string; usePersistedState?: PersistedState
} & CsvViewerOptions) {
  const { header, total, error: headerError } = useCsvHeader(store, path, delimiter)
  const [page, setPage] = useState(0)
  const { rows, error: pageError } = useCsvPage(store, path, delimiter, page, total)
  const error = headerError ?? pageError

  const allColumns: TableColumn[] = useMemo(() => (header ?? []).map(name => ({ name })), [header])
  const { visible, ...vis } = useColumnVisibility(allColumns, usePersistedState, hiddenColumns)
  const columns = useMemo(() => allColumns.filter(c => visible.includes(c.name)), [allColumns, visible])
  // Column *positions* in the source row, so hiding one doesn't shift
  // the rest — `r[j]` is indexed by the file's order, not the visible one.
  const colIndex = useMemo(
    () => new Map(allColumns.map((c, i) => [c.name, i])),
    [allColumns])
  const colStyles = useMemo(
    () => resolveColStyles(columns, path, { cellProps, headerProps }, () => false),
    [columns, path, cellProps, headerProps])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (total === null || header === null) return <div style={{ opacity: 0.6 }}>reading CSV header…</div>

  const pages = Math.max(1, Math.ceil(total / PAGE_BYTES))
  const offsetStart = page * PAGE_BYTES
  const offsetEnd = Math.min(total, offsetStart + PAGE_BYTES)

  return (
    <>
      {/* `position`/`z-index`: the column picker's panel drops over the
          table below, and its own z-index can't lift it past this
          line's place in the paint order. */}
      <p style={{ opacity: 0.7, fontSize: '0.95em', margin: '0 0 0.6em', position: 'relative', zIndex: 2 }}>
        <b>{allColumns.length}</b> columns · {fmtSize(total)}
        {columnPicker && <> · <ColumnPicker columns={allColumns} vis={{ visible, ...vis }} /></>}
      </p>
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
                return (
                  <th key={c.name} style={{ ...(st?.header ?? TH_STYLE), whiteSpace: 'nowrap' }} className={st?.headerClass}>
                    {renderHeader ? renderHeader({ column: c, path, defaultNode: c.name }) : c.name}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={columns.length} style={{ padding: '0.5em', opacity: 0.6 }}>loading…</td></tr>
            ) : (
              rows.map((r, i) => {
                // Built lazily: a `renderCell` that reads siblings needs
                // the row as an object, but most don't, and a table is
                // mostly cells.
                let asRow: Record<string, unknown> | null = null
                // Built from *all* columns: a `renderCell` reading a sibling
                // shouldn't stop working because that sibling was hidden.
                const row = () => (asRow ??= Object.fromEntries(allColumns.map((c, j) => [c.name, r[j] ?? ''])))
                return (
                  <tr key={i} style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                    {columns.map(c => {
                      const st = colStyles.get(c.name)
                      const j = colIndex.get(c.name)!
                      const value = r[j] ?? ''
                      return (
                        <td key={c.name} style={st?.cell ?? TD_STYLE} className={st?.cellClass}>
                          {renderCell
                            ? renderCell({ value, column: c, row: row(), rowIndex: i, path, defaultNode: value })
                            : value}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Default export so the viewer registry can `load: () => import(…)`
 *  without an unwrapping step. The named export stays for consumers
 *  wiring it through the `*Renderer` props. */
export default CsvViewer
