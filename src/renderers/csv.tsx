/** Range-paginated CSV/TSV table. Header is fetched once on mount;
 *  body pages are independent 256 KB range-reads from the underlying
 *  `Store`. Drops the partial first/last line on each page to avoid
 *  splitting rows across chunk boundaries.
 *
 *  Wire as `<FileTree csvRenderer={CsvViewer}>`. Doesn't handle multi-
 *  line quoted fields (a quote opening on one line and closing on the
 *  next) — those would need a streaming parser since byte-paginated
 *  chunks can split mid-row. */
import { useEffect, useMemo, useState } from 'react'
import type { Store } from '../types'
import { fmtSize } from '../react/fmt'
import { resolveColStyles, TD_STYLE, TH_STYLE, type TableColumn, type TableViewerOptions } from './table'

export type { TableCellCtx, TableCellRenderer, TableColumn, TableViewerOptions } from './table'

const PAGE_BYTES = 256 * 1024
const HEADER_PROBE_BYTES = 32 * 1024

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
  return function BoundCsvViewer(props: { store: Store; path: string; delimiter: string }) {
    return <CsvViewer {...props} {...opts} />
  }
}

export function CsvViewer({ store, path, delimiter, renderCell, renderHeader, cellProps, headerProps }: {
  store: Store; path: string; delimiter: string
} & CsvViewerOptions) {
  const [total, setTotal] = useState<number | null>(null)
  const [header, setHeader] = useState<string[] | null>(null)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<string[][] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTotal(null); setHeader(null); setRows(null); setError(null); setPage(0)
    store.get(path, { offset: 0, length: HEADER_PROBE_BYTES }).then(r => {
      if (cancelled) return
      const text = new TextDecoder().decode(r.bytes)
      const nl = text.indexOf('\n')
      if (nl < 0) { setError(`no newline in first ${HEADER_PROBE_BYTES} bytes — not a CSV?`); return }
      setHeader(parseLine(text.slice(0, nl).replace(/\r$/, ''), delimiter))
      const ts = r.totalSize
      if (ts == null) { setError('CSV viewer needs total file size; store did not report it'); return }
      setTotal(ts)
    }).catch(e => {
      if (!cancelled) setError(String(e))
    })
    return () => { cancelled = true }
  }, [store, path, delimiter])

  useEffect(() => {
    if (total === null || header === null) return
    let cancelled = false
    setRows(null)
    const offset = page * PAGE_BYTES
    const length = Math.min(PAGE_BYTES, total - offset)
    if (length <= 0) { setRows([]); return }
    store.get(path, { offset, length }).then(r => {
      if (cancelled) return
      const text = new TextDecoder().decode(r.bytes)
      let lines = text.split('\n')
      lines = lines.slice(1)
      const atEof = offset + length >= total
      if (!atEof && lines.length > 0) lines = lines.slice(0, -1)
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      setRows(lines.map(line => parseLine(line.replace(/\r$/, ''), delimiter)))
    }).catch(e => {
      if (!cancelled) setError(String(e))
    })
    return () => { cancelled = true }
  }, [store, path, delimiter, page, total, header])

  const columns: TableColumn[] = useMemo(() => (header ?? []).map(name => ({ name })), [header])
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
      <p style={{ opacity: 0.7, fontSize: '0.95em', margin: '0 0 0.6em' }}>
        <b>{header.length}</b> columns · {fmtSize(total)}
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
              <tr><td colSpan={header.length} style={{ padding: '0.5em', opacity: 0.6 }}>loading…</td></tr>
            ) : (
              rows.map((r, i) => {
                // Built lazily: a `renderCell` that reads siblings needs
                // the row as an object, but most don't, and a table is
                // mostly cells.
                let asRow: Record<string, unknown> | null = null
                const row = () => (asRow ??= Object.fromEntries(columns.map((c, j) => [c.name, r[j] ?? ''])))
                return (
                  <tr key={i} style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                    {columns.map((c, j) => {
                      const st = colStyles.get(c.name)
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

/** Minimal CSV/TSV line parser. Handles quoted fields with embedded
 *  delimiters and escaped quotes (`""` → `"`). Does NOT handle
 *  multi-line quoted fields (rare; would need a streaming parser). */
function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 2; continue }
        inQuotes = false
        i++
      } else {
        cur += c
        i++
      }
    } else {
      if (c === delimiter) { out.push(cur); cur = ''; i++ }
      else if (c === '"' && cur === '') { inQuotes = true; i++ }
      else { cur += c; i++ }
    }
  }
  out.push(cur)
  return out
}

/** Default export so the viewer registry can `load: () => import(…)`
 *  without an unwrapping step. The named export stays for consumers
 *  wiring it through the `*Renderer` props. */
export default CsvViewer
