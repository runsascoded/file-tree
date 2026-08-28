/** Sorting for the table viewers — and the size threshold that decides
 *  whether it's offered at all.
 *
 *  Both viewers stream: CSV paginates by byte ranges, parquet by row
 *  group. Sorting needs the *whole* table, so on a large file it isn't
 *  a trade-off, it's a hang. But that's only true above a size — below
 *  one, loading everything is cheap and sort, filter and an exact row
 *  count all come free.
 *
 *  So the threshold switches modes, and above it the controls are
 *  **absent rather than disabled**: a greyed-out sort arrow invites a
 *  click and teaches nothing, while a line saying "2.1 GB — streaming"
 *  explains itself.
 *
 *  See `specs/small-table-mode.md`. */
import { useCallback, useMemo } from 'react'
import type { PersistedState } from '../react/persistedState'
import { defaultUseState } from '../react/persistedState'
import type { TableColumn } from './table'

/** Load the whole table at or below this many bytes.
 *
 *  Bytes rather than rows because it's the number both viewers know
 *  *before* reading anything (the store's `totalSize`, parquet's
 *  footer) — a row count is only knowable after the decision it would
 *  inform. ~5 MB is roughly 50–100K rows of typical tabular data:
 *  comfortably sortable in a browser, small enough to fetch without
 *  thinking. */
export const DEFAULT_FULL_LOAD_MAX_BYTES = 5 * 1024 * 1024

export type SortDir = 'asc' | 'desc'
export interface SortState {
  column: string | null
  dir: SortDir
  /** Cycles asc → desc → off for the given column. */
  toggle: (name: string) => void
}

/** Sort state, in the URL when the consumer opts in: `?sort=name` or
 *  `?sort=-name` for descending. One param rather than two, so a
 *  pasted link carries the whole thing. */
export function useSort(usePersistedState?: PersistedState): SortState {
  const use = usePersistedState ?? defaultUseState
  const [raw, setRaw] = use<string>('sort', '')
  const column = raw ? raw.replace(/^-/, '') : null
  const dir: SortDir = raw.startsWith('-') ? 'desc' : 'asc'

  const toggle = useCallback((name: string) => {
    setRaw(raw === name ? `-${name}` : raw === `-${name}` ? '' : name)
  }, [raw, setRaw])

  return { column, dir, toggle }
}

/** Default comparator.
 *
 *  Numeric when *both* values read as finite numbers — which matters
 *  for CSV, where everything arrives as a string and lexical order puts
 *  `10` before `9`. Dates by instant. Everything else by
 *  `localeCompare`, so accented text sorts where a reader expects.
 *
 *  Nulls and undefined sort last regardless of direction: they're
 *  absence, not a value, and flipping them to the top on a descending
 *  sort buries the rows you asked to see. */
export function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined || a === ''
  const bNull = b === null || b === undefined || b === ''
  if (aNull || bNull) return aNull && bNull ? 0 : aNull ? 1 : -1

  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()

  const an = typeof a === 'bigint' ? Number(a) : Number(a)
  const bn = typeof b === 'bigint' ? Number(b) : Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn
  if (Number.isFinite(an) && Number.isFinite(bn)) return 0

  return String(a).localeCompare(String(b))
}

/** Per-column comparator override — CSV has no types, so a consumer who
 *  knows a column is a version string or an enum can say so. */
export type SortComparators = (col: TableColumn) => ((a: unknown, b: unknown) => number) | undefined

/** Sorted copy, or the original array when nothing is sorted — so the
 *  common case doesn't pay for a copy. Stable, because `Array.sort` is. */
export function useSortedRows<R extends Record<string, unknown>>(
  rows: R[] | null,
  sort: Pick<SortState, 'column' | 'dir'>,
  comparators?: SortComparators,
  columns?: readonly TableColumn[],
): R[] | null {
  return useMemo(() => {
    if (!rows || !sort.column) return rows
    const col = columns?.find(c => c.name === sort.column)
    const cmp = (col && comparators?.(col)) ?? compareValues
    const key = sort.column
    const sign = sort.dir === 'desc' ? -1 : 1
    return [...rows].sort((x, y) => sign * cmp(x[key], y[key]))
  }, [rows, sort.column, sort.dir, comparators, columns])
}

/** `▲` / `▼` / a low-contrast `↕` placeholder, so the affordance is
 *  visible before you've used it. */
export function sortGlyph(column: string, sort: Pick<SortState, 'column' | 'dir'>): string {
  if (sort.column !== column) return '↕'
  return sort.dir === 'asc' ? '▲' : '▼'
}
