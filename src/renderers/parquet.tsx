/** Parquet viewer. Plug into `<FileTree parquetRenderer={ParquetViewer}>`
 *  so `.parquet`/`.pqt` paths render as a two-tier-paginated table.
 *
 *  **Fetch unit = row group.** That's parquet's natural read unit
 *  (`hyparquet` fetches + decompresses a whole row group to satisfy
 *  any row range inside it; slicing inside would still pay the full
 *  decode cost for partial output). Each RG's decoded rows live in
 *  memory until the RG changes.
 *
 *  **Render unit = `ROWS_PER_PAGE` rows.** Even a small RG (25k rows)
 *  is far too many `<tr>` for the DOM (freeze on layout + scroll). An
 *  in-RG pager slices the already-decoded rows to a viewport-sized
 *  page. Advancing/rewinding across the RG boundary auto-jumps to
 *  the next/previous RG (which triggers a fresh fetch); the "row
 *  groups (N)" table lets you jump directly.
 *
 *  Uses `hyparquet` (optional peer) for footer/metadata + row-range
 *  reads, fed via `asyncBufferFromStore` so it works against any
 *  `Store` (R2, S3, HTTP, …) without knowing the underlying URL. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parquetMetadataAsync, parquetRead, parquetSchema } from 'hyparquet'
import type { Store } from '../types'
import { asyncBufferFromStore } from '../react/asyncBuffer'
import { fmtSize } from '../react/fmt'
import { defaultUseState, type PersistedState } from '../react/persistedState'
import { formatTemporal, inferColumnFormats, type TemporalColumn, type TemporalFormat } from './temporal'

// Re-exported so a consumer writing a `renderCell` for a temporal
// column can reuse the same reading + formatting the default does,
// rather than reimplementing epoch math.
export { formatTemporal, inferColumnFormats, inferTemporalFormat, toMillis } from './temporal'
export type { TemporalColumn, TemporalFormat, TemporalPrecision, TemporalSource, TemporalUnit } from './temporal'

/** A leaf column of the file's schema. Passed to `renderCell` so a
 *  consumer can key off type as well as name. */
export interface ParquetColumn extends TemporalColumn {}

export interface ParquetCellCtx {
  value: unknown
  column: ParquetColumn
  /** The whole row, for cells whose rendering depends on a sibling. */
  row: Record<string, unknown>
  /** Absolute row index within the file, not within the page. */
  rowIndex: number
  /** What the viewer would have rendered for this cell. */
  defaultNode: ReactNode
}

/** Per-cell render hook, mirroring `renderCell` (dir listing) and
 *  `renderValue` (JSON tree): called for every cell, decorate the ones
 *  you care about and return `ctx.defaultNode` for the rest. */
export type ParquetCellRenderer = (ctx: ParquetCellCtx) => ReactNode

export interface ParquetViewerOptions {
  renderCell?: ParquetCellRenderer
  /** Apply the epoch-range heuristic to unannotated numeric columns
   *  (signals b+c). Default `true`. Turning it off keeps annotated
   *  `TIMESTAMP`/`DATE` columns formatted — it only suppresses the
   *  guess. */
  inferTimestamps?: boolean
}

interface RowGroupInfo {
  index: number
  numRows: number
  rowStart: number  // cumulative row index (inclusive)
  rowEnd: number    // exclusive
  uncompressedBytes: number
  compressedBytes: number | null
}

interface Meta {
  schema: ParquetColumn[]
  totalRows: number
  byteSize: number
  rowGroups: RowGroupInfo[]
}

/** In-RG render page size. 100 rows keeps `<tr>` count well below
 *  freeze territory on any device — the whole RG stays decoded in
 *  memory so intra-RG paging is a pure array slice (no re-fetch, no
 *  re-decode). Tuned for "readable table + smooth scroll"; users who
 *  want dense scan can just next-page rapidly. */
const ROWS_PER_PAGE = 100

/** LRU cache size for decoded RG rows. Keyed by RG index within the
 *  current `(store, path)`; on revisit of a recently-viewed RG (e.g.
 *  bouncing between two neighboring RGs, or the "row groups (N)"
 *  jump-table), we short-circuit both fetch and decode. Bounded so
 *  a stroll through a 40-RG shard doesn't accumulate a decoded copy
 *  of the entire file in memory — the last 4 RGs give roughly-linear
 *  scan enough runway to feel free. */
const RG_CACHE_SIZE = 4

/** Build a parquet viewer with per-cell decoration and/or the epoch
 *  heuristic disabled. Call at module scope — each call produces a new
 *  component type, so calling it during render would remount the table
 *  on every pass. `ParquetViewer` is this with no options. */
export function makeParquetViewer(opts: ParquetViewerOptions = {}) {
  return function BoundParquetViewer(props: { store: Store; path: string; usePersistedState?: PersistedState }) {
    return <ParquetViewer {...props} {...opts} />
  }
}

export function ParquetViewer({ store, path, usePersistedState, renderCell, inferTimestamps = true }: { store: Store; path: string; usePersistedState?: PersistedState } & ParquetViewerOptions) {
  const [meta, setMeta] = useState<Meta | null>(null)
  // 0-indexed row-group pagination. Default `useState` (in-memory);
  // when `usePersistedState` is the URL hook, binds to `?page=N` with
  // `page=0` omitted from URL.
  const use = usePersistedState ?? defaultUseState
  const [page, setPage] = use<number>('page', 0)
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // In-RG page index (0-based). Deliberately in-memory-only — shared
  // URLs open at the top of the linked RG, which is a saner
  // "here's-the-row-group" entry point than restoring a mid-RG scroll
  // position across paste. Reset happens implicitly via `rgPage=0` in
  // the cross-RG-advance handlers, and explicitly here on `page`
  // change (covers clicks in the "row groups (N)" table).
  const [rgPage, setRgPage] = useState(0)
  useEffect(() => { setRgPage(0) }, [page])
  // LRU cache of decoded rows, keyed by RG index within the current
  // `(store, path)`. Wiped in the metadata effect below when the
  // file changes. JS `Map` preserves insertion order — we `.delete` +
  // `.set` on hit to bump-to-most-recent, and evict `keys().next()`
  // on overflow.
  const rgCache = useRef<Map<number, Record<string, unknown>[]>>(new Map())

  useEffect(() => {
    let cancelled = false
    setMeta(null); setRows(null); setError(null)
    // New file → drop the RG cache; the old entries are keyed by
    // RG index within the previous file's structure and would
    // silently mis-render if reused.
    rgCache.current = new Map()
    ;(async () => {
      try {
        const file = await asyncBufferFromStore(store, path)
        const md = await parquetMetadataAsync(file)
        if (cancelled) return
        const schema: ParquetColumn[] = parquetSchema(md).children.map(c => {
          const el = c.element
          const lt = el.logical_type
          return {
            name: el.name,
            ...(el.type ? { physicalType: String(el.type) } : {}),
            ...(lt ? { logicalType: lt.type } : {}),
            ...(lt && 'unit' in lt ? { timeUnit: lt.unit } : {}),
            ...(el.converted_type ? { convertedType: String(el.converted_type) } : {}),
          }
        })
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
    const rgIdx = Math.min(page, meta.rowGroups.length - 1)
    const rg = meta.rowGroups[rgIdx]
    // Cache hit → skip fetch + decode, bump to most-recent.
    const cached = rgCache.current.get(rgIdx)
    if (cached) {
      rgCache.current.delete(rgIdx)
      rgCache.current.set(rgIdx, cached)
      setRows(cached)
      return
    }
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
        if (cancelled) return
        // Insert + evict oldest past bound.
        rgCache.current.set(rgIdx, out)
        while (rgCache.current.size > RG_CACHE_SIZE) {
          const oldest = rgCache.current.keys().next().value
          if (oldest === undefined) break
          rgCache.current.delete(oldest)
        }
        setRows(out)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => { cancelled = true }
  }, [store, path, page, meta])

  // Temporal reading per column, from the decoded rows of the current
  // row group. Recomputed per RG rather than per file: a later RG can
  // legitimately disagree (a column that's all-null early, say), and
  // re-deriving is cheap next to the fetch + decode that produced them.
  const temporal = useMemo(
    () => (meta ? inferColumnFormats(meta.schema, rows, { infer: inferTimestamps }) : new Map<string, TemporalFormat>()),
    [meta, rows, inferTimestamps],
  )

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!meta) return <div style={{ opacity: 0.6 }}>reading parquet metadata…</div>

  const { schema, totalRows, byteSize, rowGroups } = meta
  if (rowGroups.length === 0) {
    return <div style={{ opacity: 0.7 }}>parquet file has no row groups</div>
  }
  const rgIndex = Math.min(Math.max(page, 0), rowGroups.length - 1)
  const rg = rowGroups[rgIndex]
  const rgPageCount = rows ? Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)) : 0
  const clampedRgPage = Math.min(Math.max(rgPage, 0), Math.max(0, rgPageCount - 1))
  const pageRowStart = rg.rowStart + clampedRgPage * ROWS_PER_PAGE
  const pageRowEnd = rows ? rg.rowStart + Math.min((clampedRgPage + 1) * ROWS_PER_PAGE, rows.length) : pageRowStart
  const visibleRows = rows ? rows.slice(clampedRgPage * ROWS_PER_PAGE, (clampedRgPage + 1) * ROWS_PER_PAGE) : null

  // Cross-RG page advance: if we're on the last (first) page of the
  // current RG, next (prev) jumps to the next (previous) RG's first
  // page. Kept UX-simple: backward-crossing lands on page 0 of the
  // previous RG (not its last page). Preserving position across a
  // backward crossing would need to know the previous RG's row count
  // at click time and coordinate with the reset effect above — not
  // worth the complexity for a rare interaction.
  const goPrevPage = () => {
    if (clampedRgPage > 0) setRgPage(clampedRgPage - 1)
    else if (rgIndex > 0) setPage(rgIndex - 1)
  }
  const goNextPage = () => {
    if (clampedRgPage < rgPageCount - 1) setRgPage(clampedRgPage + 1)
    else if (rgIndex < rowGroups.length - 1) setPage(rgIndex + 1)
  }
  const canGoPrev = clampedRgPage > 0 || rgIndex > 0
  const canGoNext = (rows !== null && clampedRgPage < rgPageCount - 1) || rgIndex < rowGroups.length - 1

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
                <td style={{ padding: '0.1em 0', opacity: 0.7 }}>{typeLabel(c, temporal.get(c.name))}</td>
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

      <RowPager
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        goPrev={goPrevPage}
        goNext={goNextPage}
        rowStart={pageRowStart}
        rowEnd={pageRowEnd}
        totalRows={totalRows}
        pageIdx={clampedRgPage}
        pageCount={rgPageCount}
        rows={rows}
      />

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
            {visibleRows === null ? (
              <tr><td colSpan={schema.length} style={{ padding: '0.5em', opacity: 0.6 }}>loading row group {rgIndex}…</td></tr>
            ) : (
              visibleRows.map((r, i) => (
                <tr key={clampedRgPage * ROWS_PER_PAGE + i} style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                  {schema.map(c => {
                    const value = r[c.name]
                    const defaultNode = fmtCell(value, temporal.get(c.name))
                    return (
                      <td key={c.name} style={{ padding: '0.2em 0.6em', whiteSpace: 'nowrap', maxWidth: '30em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {renderCell ? renderCell({ value, column: c, row: r, rowIndex: pageRowStart + i, defaultNode }) : defaultNode}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** In-RG page pager. Fetch is one RG; render is one page. Arrows
 *  cross RG boundaries (forward always; backward within-RG only,
 *  falling through to prev-RG page 0 at the start) so linear scan
 *  through a whole file is one-button. */
function RowPager({ canGoPrev, canGoNext, goPrev, goNext, rowStart, rowEnd, totalRows, pageIdx, pageCount, rows }: {
  canGoPrev: boolean
  canGoNext: boolean
  goPrev: () => void
  goNext: () => void
  rowStart: number
  rowEnd: number
  totalRows: number
  pageIdx: number
  pageCount: number
  rows: unknown[] | null
}) {
  // While the RG is loading, `rows === null` so pageCount === 0.
  // Show a subdued placeholder so the layout doesn't jump.
  if (rows === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', margin: '0.3em 0', fontSize: '0.85em', opacity: 0.5 }}>
        <span>rows —</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', margin: '0.3em 0', fontSize: '0.85em', opacity: 0.9 }}>
      <button disabled={!canGoPrev} onClick={goPrev}>‹</button>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        rows <b>{rowStart.toLocaleString()}</b>–<b>{rowEnd.toLocaleString()}</b> / {totalRows.toLocaleString()}
        {pageCount > 1 && <span style={{ opacity: 0.6 }}> · page {pageIdx + 1}/{pageCount} of RG</span>}
      </span>
      <button disabled={!canGoNext} onClick={goNext}>›</button>
    </div>
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

function rawText(v: unknown): string {
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function fmtCell(v: unknown, temporal?: TemporalFormat): ReactNode {
  // Render null/undefined as a faded `·` so an all-optional row reads
  // as "missing values" rather than "broken row". Empty `<td>`s look
  // identical to a truncated render.
  if (v === null || v === undefined) return <span style={{ opacity: 0.3 }}>·</span>
  if (temporal) {
    const s = formatTemporal(v, temporal)
    // Keep the raw value one hover away — the interpretation can be a
    // guess, and the underlying integer stays the thing you'd paste
    // into a query.
    if (s !== null) return <span title={rawText(v)} style={{ fontVariantNumeric: 'tabular-nums' }}>{s}</span>
  }
  return rawText(v)
}

/** `INT64 · TIMESTAMP(MILLIS)`, or just `INT64` when unannotated.
 *  An inferred reading is labelled as such — the heuristic is a guess,
 *  and the schema panel is where someone goes to check it. */
function typeLabel(c: ParquetColumn, temporal?: TemporalFormat): string {
  const parts = [c.physicalType ?? '?']
  const ann = c.logicalType
    ? c.timeUnit ? `${c.logicalType}(${c.timeUnit})` : c.logicalType
    : c.convertedType
  if (ann) parts.push(ann)
  if (temporal?.source === 'inferred') parts.push(`epoch ${temporal.unit.toLowerCase()} (inferred)`)
  return parts.join(' · ')
}
