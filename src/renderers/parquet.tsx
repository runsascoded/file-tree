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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  /** Path of the file being viewed, so one module-scope renderer can
   *  dispatch across a tree of unrelated schemas rather than needing a
   *  viewer per file. */
  path: string
  /** What the viewer would have rendered for this cell. */
  defaultNode: ReactNode
}

/** Per-cell render hook, mirroring `renderCell` (dir listing) and
 *  `renderValue` (JSON tree): called for every cell, decorate the ones
 *  you care about and return `ctx.defaultNode` for the rest. */
export type ParquetCellRenderer = (ctx: ParquetCellCtx) => ReactNode

/** Per-column statistics from the current row group's footer metadata.
 *  Not reconstructible from the decoded rows a consumer sees — the
 *  footer is only ever read here. Absent when the writer omitted it. */
export interface ParquetColumnStats {
  min?: unknown
  max?: unknown
  nullCount?: number
}

export interface ParquetHeaderCtx {
  column: ParquetColumn
  /** Stats for the row group currently on screen, when the footer
   *  carries them — so the range moves as you page. */
  stats?: ParquetColumnStats
  /** Path of the file being viewed (see `ParquetCellCtx['path']`). */
  path: string
  /** What the viewer would have rendered for this header. */
  defaultNode: ReactNode
}

export type ParquetHeaderRenderer = (ctx: ParquetHeaderCtx) => ReactNode

/** Attributes merged over a column's default `<td>` / `<th>` styling.
 *  Returning nothing leaves the default untouched. */
export type ParquetColumnProps = (col: ParquetColumn, path: string) => { style?: CSSProperties; className?: string } | void

export interface ParquetViewerOptions {
  renderCell?: ParquetCellRenderer
  /** Per-column header content (see `ParquetHeaderRenderer`) — a place
   *  to hang format toggles, stat readouts, and the like. */
  renderHeader?: ParquetHeaderRenderer
  /** Per-column `<td>` attributes, merged over the viewer's defaults. */
  cellProps?: ParquetColumnProps
  /** Per-column `<th>` attributes. Separate from `cellProps` so
   *  overriding one doesn't silently change the other; note the
   *  built-in numeric alignment already keeps the pair in sync. */
  headerProps?: ParquetColumnProps
  /** Apply the epoch-range heuristic to unannotated numeric columns
   *  (signals b+c). Default `true`. Turning it off keeps annotated
   *  `TIMESTAMP`/`DATE` columns formatted — it only suppresses the
   *  guess. */
  inferTimestamps?: boolean
  /** Right-align numeric columns with `tabular-nums`, so digits line up
   *  down the column and magnitudes are comparable at a glance.
   *  Default `true`. Columns read as temporal are excluded — they
   *  render as text, not quantities. */
  alignNumeric?: boolean
}

interface RowGroupInfo {
  index: number
  numRows: number
  rowStart: number  // cumulative row index (inclusive)
  rowEnd: number    // exclusive
  uncompressedBytes: number
  compressedBytes: number | null
  /** Keyed by column name; empty when the writer wrote no statistics. */
  stats: Map<string, ParquetColumnStats>
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

/** Physical types that read as quantities, and so right-align by
 *  default. `BOOLEAN` and the byte-array types are excluded. */
const NUMERIC_TYPES = new Set(['INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE'])

/** Base cell/header styling, hoisted so per-column overrides merge over
 *  a single source of truth rather than a literal inlined in JSX. */
const TD_STYLE: CSSProperties = { padding: '0.2em 0.6em', whiteSpace: 'nowrap', maxWidth: '30em', overflow: 'hidden', textOverflow: 'ellipsis' }
const TH_STYLE: CSSProperties = { padding: '0.3em 0.6em', textAlign: 'left', borderBottom: '1px solid rgba(127,127,127,0.4)', fontWeight: 500 }

/** Build a parquet viewer with per-cell decoration and/or the epoch
 *  heuristic disabled. Call at module scope — each call produces a new
 *  component type, so calling it during render would remount the table
 *  on every pass. `ParquetViewer` is this with no options. */
export function makeParquetViewer(opts: ParquetViewerOptions = {}) {
  // Declares the options too, because it forwards them: anything
  // `<FileTree parquetOptions>` hands down lands in `props` and reaches
  // the viewer. `opts` is spread last, so what was baked in at
  // construction still wins.
  return function BoundParquetViewer(props: { store: Store; path: string; usePersistedState?: PersistedState } & ParquetViewerOptions) {
    return <ParquetViewer {...props} {...opts} />
  }
}

export function ParquetViewer({ store, path, usePersistedState, renderCell, renderHeader, cellProps, headerProps, inferTimestamps = true, alignNumeric = true }: { store: Store; path: string; usePersistedState?: PersistedState } & ParquetViewerOptions) {
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
          const stats = new Map<string, ParquetColumnStats>()
          for (const chunk of rg.columns) {
            const cm = chunk.meta_data
            const s = cm?.statistics
            if (!cm || !s) continue
            // `min_value`/`max_value` are the modern (correctly-ordered)
            // fields; `min`/`max` are the deprecated ones, kept as a
            // fallback for older writers.
            const min = s.min_value ?? s.min
            const max = s.max_value ?? s.max
            const nullCount = s.null_count != null ? Number(s.null_count) : undefined
            if (min === undefined && max === undefined && nullCount === undefined) continue
            stats.set(cm.path_in_schema.join('.'), {
              ...(min !== undefined ? { min } : {}),
              ...(max !== undefined ? { max } : {}),
              ...(nullCount !== undefined ? { nullCount } : {}),
            })
          }
          rowGroups.push({
            index: i,
            numRows,
            rowStart: cum,
            rowEnd: cum + numRows,
            uncompressedBytes: Number(rg.total_byte_size),
            compressedBytes: rg.total_compressed_size != null ? Number(rg.total_compressed_size) : null,
            stats,
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

  // Resolved once per column rather than per cell — a 100-row page of a
  // 17-column file would otherwise call `cellProps` 1,700 times a render.
  const colStyles = useMemo(() => {
    const out = new Map<string, { cell: CSSProperties; header: CSSProperties; cellClass?: string; headerClass?: string }>()
    for (const c of meta?.schema ?? []) {
      // Numeric alignment keys off the *rendered* meaning, not the
      // physical type: a column read as temporal prints as text, so
      // right-aligning it would just detach it from its header.
      const numeric = alignNumeric && !temporal.has(c.name) && c.physicalType !== undefined && NUMERIC_TYPES.has(c.physicalType)
      const align: CSSProperties = numeric ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : {}
      const cp = cellProps?.(c, path) || {}
      const hp = headerProps?.(c, path) || {}
      out.set(c.name, {
        cell: { ...TD_STYLE, ...align, ...cp.style },
        header: { ...TH_STYLE, ...align, ...hp.style },
        ...(cp.className ? { cellClass: cp.className } : {}),
        ...(hp.className ? { headerClass: hp.className } : {}),
      })
    }
    return out
  }, [meta, temporal, alignNumeric, cellProps, headerProps, path])

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
              {schema.map(c => {
                const st = colStyles.get(c.name)
                const stats = rg.stats.get(c.name)
                const title = statsTitle(stats, temporal.get(c.name))
                const defaultNode = title ? <span title={title}>{c.name}</span> : c.name
                return (
                  <th key={c.name} style={st?.header ?? TH_STYLE} className={st?.headerClass}>
                    {renderHeader ? renderHeader({ column: c, ...(stats ? { stats } : {}), path, defaultNode }) : defaultNode}
                  </th>
                )
              })}
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
                    const st = colStyles.get(c.name)
                    return (
                      <td key={c.name} style={st?.cell ?? TD_STYLE} className={st?.cellClass}>
                        {renderCell ? renderCell({ value, column: c, row: r, rowIndex: pageRowStart + i, path, defaultNode }) : defaultNode}
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

/** One stat value as text, or `null` if it isn't safely printable.
 *  Parquet stats are raw per-type values — byte arrays for strings,
 *  bigints for INT64 — so anything unrecognised is dropped rather than
 *  stringified into `[object Object]`. */
function statValue(v: unknown, temporal?: TemporalFormat): string | null {
  if (v === null || v === undefined) return null
  if (temporal) {
    const s = formatTemporal(v, temporal)
    if (s !== null) return s
  }
  if (typeof v === 'bigint' || typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) {
    try {
      const s = new TextDecoder('utf-8', { fatal: true }).decode(v)
      return s.length > 40 ? `${s.slice(0, 40)}…` : s
    } catch { return null }
  }
  return null
}

/** Header `title` summarising the current row group's range for a
 *  column — a cheap orientation cue in a file with millions of rows,
 *  and the footer already carries it. */
function statsTitle(stats: ParquetColumnStats | undefined, temporal?: TemporalFormat): string | undefined {
  if (!stats) return undefined
  const parts: string[] = []
  const min = statValue(stats.min, temporal)
  const max = statValue(stats.max, temporal)
  if (min !== null && max !== null) parts.push(min === max ? `= ${min}` : `${min} … ${max}`)
  else if (min !== null) parts.push(`≥ ${min}`)
  else if (max !== null) parts.push(`≤ ${max}`)
  if (stats.nullCount) parts.push(`${stats.nullCount.toLocaleString()} null`)
  return parts.length ? `row group: ${parts.join(' · ')}` : undefined
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
