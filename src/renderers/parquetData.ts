/** Parquet plumbing, without any markup.
 *
 *  The viewer in `./parquet.tsx` is roughly two things: reading a
 *  parquet file through a `Store` (footer parsing, row-group indexing,
 *  statistics, decode + LRU cache) and drawing a table. Only the second
 *  is worth forking — but until this file existed, a consumer who
 *  wanted a virtualised table, a different pager, or a chart instead of
 *  a table had to copy all of it to change the markup.
 *
 *  So the reading half lives here as hooks. Take `useParquetMeta` and
 *  `useRowGroup`, render whatever you like, and never think about
 *  `hyparquet`. This is where the bugs and the tests are; the markup is
 *  yours.
 *
 *  See `specs/renderer-extensibility.md`. */
import { useEffect, useRef, useState } from 'react'
import { parquetMetadataAsync, parquetRead, parquetSchema } from 'hyparquet'
import type { Store } from '../types'
import { asyncBufferFromStore } from '../react/asyncBuffer'
import type { TemporalColumn } from './temporal'
import type { TableColumn } from './table'

/** Physical types we read as numbers — for alignment, and for the
 *  coarse `kind` every table viewer speaks. */
export const NUMERIC_TYPES = new Set(['INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE'])

/** How many decoded row groups to keep. Paging back and forth across a
 *  boundary is common; re-decoding on every crossing is not cheap. */
export const RG_CACHE_SIZE = 4

/** A leaf column of the file's schema. The parquet-specific detail
 *  (`physicalType`, `logicalType`, …) rides on top of the
 *  format-neutral `TableColumn` every table viewer shares. */
export interface ParquetColumn extends TemporalColumn, TableColumn {}

/** Per-column statistics from a row group's footer metadata. Not
 *  reconstructible from decoded rows — only the footer has them, and
 *  absent when the writer omitted them. */
export interface ParquetColumnStats {
  min?: unknown
  max?: unknown
  nullCount?: number
}

export interface RowGroupInfo {
  index: number
  numRows: number
  rowStart: number  // cumulative row index (inclusive)
  rowEnd: number    // exclusive
  uncompressedBytes: number
  compressedBytes: number | null
  /** Keyed by column name; empty when the writer wrote no statistics. */
  stats: Map<string, ParquetColumnStats>
}

export interface ParquetMeta {
  schema: ParquetColumn[]
  totalRows: number
  byteSize: number
  rowGroups: RowGroupInfo[]
}

/** Parquet's physical type collapsed to the coarse reading every table
 *  viewer speaks. Temporal isn't decidable here — a `TIMESTAMP` is an
 *  `INT64` until inference runs over the values — so callers finalise
 *  that once a row group is decoded. */
export function coarseKind(physicalType: string): TableColumn['kind'] {
  if (NUMERIC_TYPES.has(physicalType)) return 'number'
  if (physicalType === 'BOOLEAN') return 'boolean'
  if (physicalType === 'BYTE_ARRAY' || physicalType === 'FIXED_LEN_BYTE_ARRAY') return 'string'
  return undefined
}

/** Footer only — schema, row-group index, and per-column statistics.
 *  One range read; no column data is decoded. */
export function useParquetMeta(store: Store, path: string): { meta: ParquetMeta | null; error: string | null } {
  const [meta, setMeta] = useState<ParquetMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setMeta(null); setError(null)
    ;(async () => {
      try {
        const file = await asyncBufferFromStore(store, path)
        const md = await parquetMetadataAsync(file)
        if (cancelled) return
        const schema: ParquetColumn[] = parquetSchema(md).children.map(c => {
          const el = c.element
          const lt = el.logical_type
          const physicalType = el.type ? String(el.type) : undefined
          return {
            name: el.name,
            ...(physicalType ? { physicalType, kind: coarseKind(physicalType) } : {}),
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

  return { meta, error }
}

/** Decoded rows of one row group, LRU-cached.
 *
 *  A row group is parquet's unit of compression, so this is also the
 *  unit of fetch: there's no sub-group slicing to be had, which is why
 *  the writer's row-group size decides how browsing feels (see the
 *  README).
 *
 *  Cache is keyed by row-group index within the current `(store, path)`
 *  and dropped when either changes — the indices mean something
 *  different in a different file, and reusing them would silently
 *  mis-render. */
export function useRowGroup(
  store: Store,
  path: string,
  meta: ParquetMeta | null,
  index: number,
  cacheSize: number = RG_CACHE_SIZE,
): { rows: Record<string, unknown>[] | null; error: string | null } {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef<Map<number, Record<string, unknown>[]>>(new Map())

  useEffect(() => {
    cache.current = new Map()
    setRows(null); setError(null)
  }, [store, path])

  useEffect(() => {
    if (!meta || meta.rowGroups.length === 0) return
    const rgIdx = Math.min(index, meta.rowGroups.length - 1)
    const rg = meta.rowGroups[rgIdx]!
    // Cache hit → skip fetch + decode, bump to most-recent. JS `Map`
    // preserves insertion order, so delete + set is the bump.
    const cached = cache.current.get(rgIdx)
    if (cached) {
      cache.current.delete(rgIdx)
      cache.current.set(rgIdx, cached)
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
        cache.current.set(rgIdx, out)
        while (cache.current.size > cacheSize) {
          const oldest = cache.current.keys().next().value
          if (oldest === undefined) break
          cache.current.delete(oldest)
        }
        setRows(out)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => { cancelled = true }
  }, [store, path, index, meta, cacheSize])

  return { rows, error }
}
