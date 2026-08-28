/** CSV/TSV plumbing, without any markup — the byte-range pager and the
 *  line parser, so a fork can render whatever it likes over them.
 *
 *  See `specs/renderer-extensibility.md`. */
import { useEffect, useState } from 'react'
import type { Store } from '../types'

export const PAGE_BYTES = 256 * 1024
export const HEADER_PROBE_BYTES = 32 * 1024

/** Minimal CSV/TSV line parser. Handles quoted fields with embedded
 *  delimiters and escaped quotes (`""` → `"`). Does NOT handle
 *  multi-line quoted fields (rare; would need a streaming parser). */
export function parseLine(line: string, delimiter: string): string[] {
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

/** Header + total size, from one probe read of the file's first bytes.
 *  `total` is needed for paging and comes from the store, so a store
 *  that doesn't report size can't be paged. */
export function useCsvHeader(store: Store, path: string, delimiter: string): {
  header: string[] | null; total: number | null; error: string | null
} {
  const [header, setHeader] = useState<string[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHeader(null); setTotal(null); setError(null)
    store.get(path, { offset: 0, length: HEADER_PROBE_BYTES }).then(r => {
      if (cancelled) return
      const text = new TextDecoder().decode(r.bytes)
      const nl = text.indexOf('\n')
      if (nl < 0) { setError(`no newline in first ${HEADER_PROBE_BYTES} bytes — not a CSV?`); return }
      setHeader(parseLine(text.slice(0, nl).replace(/\r$/, ''), delimiter))
      const ts = r.totalSize
      if (ts == null) { setError('CSV viewer needs total file size; store did not report it'); return }
      setTotal(ts)
    }).catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path, delimiter])

  return { header, total, error }
}

/** One page of rows, as a byte range.
 *
 *  Pages are *bytes*, not rows: the first and last lines of a range are
 *  almost certainly partial, so both are dropped. That's also why the
 *  viewer never learns a row count, and why a row index here is
 *  page-relative — nothing tells it how many rows preceded the range.
 */
export function useCsvPage(
  store: Store, path: string, delimiter: string, page: number, total: number | null,
): { rows: string[][] | null; error: string | null } {
  const [rows, setRows] = useState<string[][] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (total === null) return
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
    }).catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path, delimiter, page, total])

  return { rows, error }
}

/** Every row, for small-table mode.
 *
 *  Only runs when `enabled` — the caller decides from `total` whether
 *  the file is small enough, since it's the one that knows the
 *  threshold. One read, no paging: below a few MB the whole point is
 *  that streaming buys nothing.
 */
export function useAllCsvRows(
  store: Store, path: string, delimiter: string, enabled: boolean,
): { rows: string[][] | null; error: string | null } {
  const [rows, setRows] = useState<string[][] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) { setRows(null); return }
    let cancelled = false
    setRows(null); setError(null)
    store.get(path).then(r => {
      if (cancelled) return
      const lines = new TextDecoder().decode(r.bytes).split('\n')
      lines.shift()   // header
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      setRows(lines.map(line => parseLine(line.replace(/\r$/, ''), delimiter)))
    }).catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path, delimiter, enabled])

  return { rows, error }
}
