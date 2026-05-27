/** Range-paginated CSV/TSV table. Header is fetched once on mount;
 *  body pages are independent 256 KB range-reads from the underlying
 *  `Store`. Drops the partial first/last line on each page to avoid
 *  splitting rows across chunk boundaries.
 *
 *  Wire as `<FileTree csvRenderer={CsvViewer}>`. Doesn't handle multi-
 *  line quoted fields (a quote opening on one line and closing on the
 *  next) — those would need a streaming parser since byte-paginated
 *  chunks can split mid-row. */
import { useEffect, useState } from 'react'
import type { Store } from '../types'
import { fmtSize } from '../react/fmt'

const PAGE_BYTES = 256 * 1024
const HEADER_PROBE_BYTES = 32 * 1024

export function CsvViewer({ store, path, delimiter }: { store: Store; path: string; delimiter: string }) {
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
            <tr style={{ position: 'sticky', top: 0, background: 'var(--bg, #181818)' }}>
              {header.map((c, i) => (
                <th key={i} style={{ padding: '0.3em 0.6em', textAlign: 'left', borderBottom: '1px solid rgba(127,127,127,0.4)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={header.length} style={{ padding: '0.5em', opacity: 0.6 }}>loading…</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                  {header.map((_, j) => (
                    <td key={j} style={{ padding: '0.2em 0.6em', whiteSpace: 'nowrap', maxWidth: '30em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r[j] ?? ''}
                    </td>
                  ))}
                </tr>
              ))
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
