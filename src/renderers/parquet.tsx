/** Parquet viewer. Plug into `<FileTree parquetRenderer={ParquetViewer}>`
 *  so `.parquet`/`.pqt` paths render as a row-group-paginated table.
 *
 *  Pagination is one row group per page — that's parquet's natural
 *  read unit (`hyparquet` fetches + decompresses a whole row group to
 *  satisfy any row range inside it; an in-row-group slice pays the
 *  full decode cost for partial output). Each page shows the row-group
 *  count + sizes so "what does it cost to scan more?" is answerable.
 *
 *  Uses `hyparquet` (optional peer) for footer/metadata + row-range
 *  reads, fed via `asyncBufferFromStore` so it works against any
 *  `Store` (R2, S3, HTTP, …) without knowing the underlying URL. */
import { useEffect, useState, type ReactNode } from 'react'
import { parquetMetadataAsync, parquetRead, parquetSchema } from 'hyparquet'
import type { Store } from '../types'
import { asyncBufferFromStore } from '../react/asyncBuffer'
import { fmtSize } from '../react/fmt'
import { defaultUseState, type PersistedState } from '../react/persistedState'

interface SchemaCol { name: string; type?: string }

interface RowGroupInfo {
  index: number
  numRows: number
  rowStart: number  // cumulative row index (inclusive)
  rowEnd: number    // exclusive
  uncompressedBytes: number
  compressedBytes: number | null
}

interface Meta {
  schema: SchemaCol[]
  totalRows: number
  byteSize: number
  rowGroups: RowGroupInfo[]
}

export function ParquetViewer({ store, path, usePersistedState }: { store: Store; path: string; usePersistedState?: PersistedState }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  // 0-indexed row-group pagination. Default `useState` (in-memory);
  // when `usePersistedState` is the URL hook, binds to `?page=N` with
  // `page=0` omitted from URL.
  const use = usePersistedState ?? defaultUseState
  const [page, setPage] = use<number>('page', 0)
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setMeta(null); setRows(null); setError(null)
    ;(async () => {
      try {
        const file = await asyncBufferFromStore(store, path)
        const md = await parquetMetadataAsync(file)
        if (cancelled) return
        const schema: SchemaCol[] = parquetSchema(md).children.map((c: { element: { name: string; type?: unknown } }) => ({
          name: c.element.name,
          ...(c.element.type ? { type: String(c.element.type) } : {}),
        }))
        const rowGroups: RowGroupInfo[] = []
        let cum = 0
        md.row_groups.forEach((rg, i) => {
          const numRows = Number(rg.num_rows)
          rowGroups.push({
            index: i,
            numRows,
            rowStart: cum,
            rowEnd: cum + numRows,
            uncompressedBytes: Number(rg.total_byte_size),
            compressedBytes: rg.total_compressed_size != null ? Number(rg.total_compressed_size) : null,
          })
          cum += numRows
        })
        setMeta({ schema, totalRows: Number(md.num_rows), byteSize: file.byteLength, rowGroups })
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => { cancelled = true }
  }, [store, path])

  // Clamp `page` to row-group count once metadata is loaded. Survives
  // stale `?page=N` URLs pasted across files with different rg counts.
  useEffect(() => {
    if (meta && (page < 0 || page >= meta.rowGroups.length)) setPage(0)
  }, [meta, page, setPage])

  useEffect(() => {
    if (!meta || meta.rowGroups.length === 0) return
    const rg = meta.rowGroups[Math.min(page, meta.rowGroups.length - 1)]
    let cancelled = false
    setRows(null)
    ;(async () => {
      try {
        const file = await asyncBufferFromStore(store, path)
        const out: Record<string, unknown>[] = []
        await parquetRead({
          file,
          rowStart: rg.rowStart,
          rowEnd: rg.rowEnd,
          rowFormat: 'object',
          onComplete: (data: unknown) => {
            if (Array.isArray(data)) for (const r of data) out.push(r as Record<string, unknown>)
          },
        })
        if (!cancelled) setRows(out)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => { cancelled = true }
  }, [store, path, page, meta])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!meta) return <div style={{ opacity: 0.6 }}>reading parquet metadata…</div>

  const { schema, totalRows, byteSize, rowGroups } = meta
  if (rowGroups.length === 0) {
    return <div style={{ opacity: 0.7 }}>parquet file has no row groups</div>
  }
  const rgIndex = Math.min(Math.max(page, 0), rowGroups.length - 1)
  const rg = rowGroups[rgIndex]

  return (
    <>
      <p style={{ opacity: 0.7, fontSize: '0.95em' }}>
        <b>{totalRows.toLocaleString()}</b> rows · <b>{schema.length}</b> columns · <b>{rowGroups.length}</b> row group{rowGroups.length === 1 ? '' : 's'} · {fmtSize(byteSize)}
      </p>

      <details style={{ marginBottom: '0.5em' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.9em', opacity: 0.8 }}>schema</summary>
        <table style={{ borderCollapse: 'collapse', marginTop: '0.3em', fontSize: '0.85em' }}>
          <tbody>
            {schema.map(c => (
              <tr key={c.name}>
                <td style={{ padding: '0.1em 0.6em 0.1em 0', fontFamily: 'ui-monospace, monospace' }}>{c.name}</td>
                <td style={{ padding: '0.1em 0', opacity: 0.7 }}>{c.type ?? '?'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {rowGroups.length > 1 && (
        <details style={{ marginBottom: '0.5em' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.9em', opacity: 0.8 }}>row groups ({rowGroups.length})</summary>
          <table style={{ borderCollapse: 'collapse', marginTop: '0.3em', fontSize: '0.85em' }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                <th style={{ padding: '0.1em 0.6em 0.1em 0', fontWeight: 400 }}>#</th>
                <th style={{ padding: '0.1em 0.6em', fontWeight: 400, textAlign: 'right' }}>rows</th>
                <th style={{ padding: '0.1em 0.6em', fontWeight: 400, textAlign: 'right' }}>compressed</th>
                <th style={{ padding: '0.1em 0.6em', fontWeight: 400, textAlign: 'right' }}>uncompressed</th>
              </tr>
            </thead>
            <tbody>
              {rowGroups.map(g => (
                <tr key={g.index} style={{ background: g.index === rgIndex ? 'rgba(127,127,127,0.12)' : undefined, cursor: 'pointer' }} onClick={() => setPage(g.index)}>
                  <td style={{ padding: '0.1em 0.6em 0.1em 0', fontFamily: 'ui-monospace, monospace' }}>{g.index}</td>
                  <td style={{ padding: '0.1em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{g.numRows.toLocaleString()}</td>
                  <td style={{ padding: '0.1em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{g.compressedBytes != null ? fmtSize(g.compressedBytes) : '—'}</td>
                  <td style={{ padding: '0.1em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>{fmtSize(g.uncompressedBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <Pager rg={rg} rgCount={rowGroups.length} setPage={setPage} totalRows={totalRows} />

      <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 4 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82em', fontFamily: 'ui-monospace, monospace' }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'rgba(127,127,127,0.15)' }}>
              {schema.map(c => (
                <th key={c.name} style={{ padding: '0.3em 0.6em', textAlign: 'left', borderBottom: '1px solid rgba(127,127,127,0.4)', fontWeight: 500 }}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={schema.length} style={{ padding: '0.5em', opacity: 0.6 }}>loading row group {rgIndex}…</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                  {schema.map(c => (
                    <td key={c.name} style={{ padding: '0.2em 0.6em', whiteSpace: 'nowrap', maxWidth: '30em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fmtCell(r[c.name])}
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

function Pager({ rg, rgCount, setPage, totalRows }: {
  rg: RowGroupInfo
  rgCount: number
  setPage: (p: number) => void
  totalRows: number
}) {
  if (rgCount <= 1) return null
  const sizeLabel = rg.compressedBytes != null ? fmtSize(rg.compressedBytes) : fmtSize(rg.uncompressedBytes)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', margin: '0.4em 0', fontSize: '0.9em' }}>
      <button disabled={rg.index === 0} onClick={() => setPage(0)}>«</button>
      <button disabled={rg.index === 0} onClick={() => setPage(rg.index - 1)}>‹</button>
      <span style={{ opacity: 0.8 }}>
        row group <b>{rg.index + 1}</b> / {rgCount} · rows {rg.rowStart.toLocaleString()}–{rg.rowEnd.toLocaleString()} / {totalRows.toLocaleString()} · {sizeLabel}
      </span>
      <button disabled={rg.index === rgCount - 1} onClick={() => setPage(rg.index + 1)}>›</button>
      <button disabled={rg.index === rgCount - 1} onClick={() => setPage(rgCount - 1)}>»</button>
    </div>
  )
}

function fmtCell(v: unknown): ReactNode {
  // Render null/undefined as a faded `·` so an all-optional row reads
  // as "missing values" rather than "broken row". Empty `<td>`s look
  // identical to a truncated render.
  if (v === null || v === undefined) return <span style={{ opacity: 0.3 }}>·</span>
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
