/** Resizable table columns: drag a header's right edge to pin its width,
 *  double-click the handle to auto-fit the widest cell.
 *
 *  This is the *third* axis of reading a wide value — after the `elide`
 *  clip (`table.ts`) and the tooltip that recovers it — and deliberately
 *  separate from `elide`: a pinned width is per-`(path, column)` *state*
 *  the reader sets, not a clip strategy. A pinned width wins over the
 *  elide cap (and over wide mode) for that one column.
 *
 *  Persisted through the same `usePersistedState` seam as the column
 *  picker and filter, so a consumer passing `useUrlPersistedState` gets
 *  `?cw=name:220,dir:480` — shareable, and per-path because the path is
 *  already in the URL.
 *
 *  Opt-in (`resizableColumns`, default off): a viewer shouldn't grow a
 *  drag handle on every header the host didn't ask for. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent } from 'react'
import type { PersistedState } from '../react/persistedState'
import { defaultUseState } from '../react/persistedState'
import type { TableColumn } from './table'

/** A column can't be dragged narrower than this (px) — below it the
 *  header label vanishes and the handle becomes unfindable. */
const MIN_WIDTH = 40
/** Auto-fit slack (px) so the widest value clears the ellipsis. */
const FIT_SLACK = 2
/** Pointer travel (px) before a press on the handle becomes a drag —
 *  below it the press stays a click, so a double-click can auto-fit. */
const DRAG_THRESHOLD = 3

const NO_STYLE: CSSProperties = {}

/** `"name:220,dir:480"` → `{ name: 220, dir: 480 }`. Tolerant: skips
 *  empty / malformed pairs rather than throwing on a hand-edited URL. */
export function parseWidths(raw: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const part of raw.split(',')) {
    if (!part) continue
    const i = part.lastIndexOf(':')
    if (i <= 0) continue
    const name = part.slice(0, i)
    const px = Number(part.slice(i + 1))
    if (name && Number.isFinite(px) && px > 0) m.set(name, px)
  }
  return m
}

/** Inverse of {@link parseWidths}; widths rounded to whole px. Order is
 *  insertion order, so the string is stable across writes that don't
 *  change the set. */
export function serializeWidths(m: ReadonlyMap<string, number>): string {
  return [...m].map(([n, w]) => `${n}:${Math.round(w)}`).join(',')
}

/** What identity a pinned width is remembered under — the ladder from
 *  narrow to broad sharing:
 *   - `'path'` (default): this exact file. Rides `usePersistedState`, so a
 *     consumer on `useUrlPersistedState` gets a shareable `?cw=…`.
 *   - `'schema'`: every file with the same column *set* (a fingerprint of
 *     the sorted names) shares — so sibling parquets carry widths, but an
 *     unrelated table doesn't bleed. Stored in `localStorage`.
 *   - `'column'`: by column *name*, across every table — one global map,
 *     so a `name` column keeps its width everywhere (at the cost of two
 *     unrelated `name` columns sharing). Stored in `localStorage`.
 *   - a function `(columns, path) => string`: your own identity.
 *
 *  `'schema'`/`'column'`/fn use `localStorage` (not the URL), since the
 *  point is to carry a width *across* paths, which a per-URL param can't. */
export type ResizeScope =
  | 'path' | 'schema' | 'column'
  | ((columns: readonly TableColumn[], path: string) => string)

/** Stable fingerprint of a column *set* (order-independent), for
 *  `'schema'` scope. A djb2 hash keeps the `localStorage` key short. */
export function columnFingerprint(columns: readonly TableColumn[]): string {
  const s = columns.map(c => c.name).sort().join('')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** The `localStorage` sub-key for a non-`path` scope (`path` never hits
 *  `localStorage`; its widths live in `usePersistedState`). */
export function scopeKey(scope: ResizeScope, columns: readonly TableColumn[], path: string): string {
  if (typeof scope === 'function') return `f:${scope(columns, path)}`
  if (scope === 'schema') return `s:${columnFingerprint(columns)}`
  if (scope === 'column') return 'c'
  return `p:${path}`
}

function readLS(key: string): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key) } catch { return null }
}
function writeLS(key: string, value: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value) } catch { /* private mode / blocked — resize just won't persist */ }
}

/** A `localStorage`-backed string, mirrored to state — with the key able
 *  to change (navigating to a different schema) and cross-tab `storage`
 *  events kept in sync. Every access is guarded, so a context without
 *  storage degrades to in-memory. */
function useLocalStorageString(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => readLS(key) ?? initial)
  useEffect(() => { setValue(readLS(key) ?? initial) }, [key, initial])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => { if (e.key === key) setValue(e.newValue ?? initial) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, initial])
  const set = useCallback((v: string) => { writeLS(key, v); setValue(v) }, [key])
  return [value, set]
}

export interface UseColumnWidthsArgs {
  /** Whether resizing is on — off short-circuits to no pinned widths and
   *  inert gestures, so a viewer with the feature disabled ignores any
   *  stored widths entirely. */
  on: boolean
  scope: ResizeScope
  /** The full column set (not the visible subset — hiding a column
   *  shouldn't change a `'schema'` fingerprint). */
  columns: readonly TableColumn[]
  path: string
  usePersistedState?: PersistedState
}

export interface ColumnWidths {
  /** Style to pin one column's `<th>`/`<td>` — `width`+`min`+`max` so it
   *  holds against content and overrides the elide cap — or `{}` when the
   *  column has no pinned width. Reflects the live drag for the column
   *  being dragged. */
  styleFor(col: string): CSSProperties
  /** Begin a drag from a handle's `pointerdown`. Tracks the pointer on
   *  `document` (so it keeps working past the handle's edge) and commits
   *  on release. */
  startResize(col: string, e: PointerEvent): void
  /** Auto-fit a column to its widest rendered cell (a handle's
   *  `dblclick`), measured via `scrollWidth` so a clipped cell still
   *  reports its full content width. */
  autoFit(col: string, e: ReactMouseEvent): void
}

/** Per-column pinned widths, drag/auto-fit gestures, and the style each
 *  contributes. Backed by `usePersistedState` for `'path'` scope (so the
 *  URL stays the shareable store) and by `localStorage` for the broader
 *  scopes. See {@link ColumnWidths} and {@link ResizeScope}. */
export function useColumnWidths({ on, scope, columns, path, usePersistedState }: UseColumnWidthsArgs): ColumnWidths {
  // Both stores are read unconditionally (hooks rule); `scope` picks which
  // one is authoritative. `'path'` → the per-URL `?cw=`; everything else →
  // a `localStorage` entry keyed by the scope, shared across paths.
  const use = usePersistedState ?? defaultUseState
  const [urlRaw, setUrlRaw] = use<string>('cw', '')
  const lsKey = useMemo(() => `ft-colw:${scopeKey(scope, columns, path)}`, [scope, columns, path])
  const [lsRaw, setLsRaw] = useLocalStorageString(lsKey, '')
  const onPath = scope === 'path'
  const raw = onPath ? urlRaw : lsRaw
  const setRaw = onPath ? setUrlRaw : setLsRaw
  const persisted = useMemo(() => parseWidths(raw), [raw])
  // Latest persisted map, for the imperative commit whose closure would
  // otherwise capture a stale one.
  const persistedRef = useRef(persisted)
  persistedRef.current = persisted

  // The column currently under the pointer, with its live width — an
  // overlay on `persisted` so the drag previews without writing every
  // move (and without touching the persisted string until release).
  const [drag, setDrag] = useState<{ col: string; w: number } | null>(null)

  const commit = useCallback((col: string, w: number) => {
    const m = new Map(persistedRef.current)
    m.set(col, Math.max(MIN_WIDTH, w))
    setRaw(serializeWidths(m))
  }, [setRaw])

  const startResize = useCallback((col: string, e: PointerEvent) => {
    if (!on) return
    const th = (e.target as HTMLElement).closest('th')
    if (!th) return
    const startW = th.getBoundingClientRect().width
    const startX = e.clientX
    const widthAt = (clientX: number) => Math.max(MIN_WIDTH, startW + (clientX - startX))
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    // Engage the drag only once the pointer actually moves. A stationary
    // press is a click — leaving it a no-op means a *double*-click still
    // reaches `autoFit` (a `preventDefault` here, or committing on a
    // zero-move release, would eat the second click and pin instead).
    let dragging = false
    const move = (ev: globalThis.PointerEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return
        dragging = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }
      setDrag({ col, w: widthAt(ev.clientX) })
    }
    const up = (ev: globalThis.PointerEvent) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      if (dragging) {
        commit(col, widthAt(ev.clientX))
        document.body.style.cursor = prevCursor
        document.body.style.userSelect = prevSelect
      }
      setDrag(null)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }, [on, commit])

  const autoFit = useCallback((col: string, e: ReactMouseEvent) => {
    if (!on) return
    e.preventDefault()
    e.stopPropagation()
    const th = (e.target as HTMLElement).closest('th') as HTMLTableCellElement | null
    const table = th?.closest('table')
    if (!th || !table) return
    const idx = th.cellIndex
    // `scrollWidth` is the content's full width even when the cell clips,
    // so this fits the widest *value*, not the widest *rendered* box.
    let max = th.scrollWidth
    for (const tr of table.querySelectorAll('tbody tr')) {
      const td = tr.children[idx] as HTMLTableCellElement | undefined
      // Skip a `colSpan` placeholder row (its lone cell isn't this column).
      if (td && td.cellIndex === idx) max = Math.max(max, td.scrollWidth)
    }
    commit(col, Math.ceil(max) + FIT_SLACK)
  }, [on, commit])

  const styleFor = useCallback((col: string): CSSProperties => {
    if (!on) return NO_STYLE
    const w = drag && drag.col === col ? drag.w : persisted.get(col)
    return w == null ? NO_STYLE : { width: w, minWidth: w, maxWidth: w }
  }, [on, drag, persisted])

  return useMemo(() => ({ styleFor, startResize, autoFit }), [styleFor, startResize, autoFit])
}

/** The drag target at a header's right edge. Invisible until hovered
 *  (then a grip line), `col-resize` cursor throughout. `stopPropagation`
 *  on click keeps a drag from also toggling the header's sort. */
export function ColumnResizeHandle({ col, widths }: { col: string; widths: ColumnWidths }) {
  const [hot, setHot] = useState(false)
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${col} column`}
      title="Drag to resize · double-click to fit"
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onPointerDown={e => widths.startResize(col, e)}
      onDoubleClick={e => widths.autoFit(col, e)}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 0, right: 0, height: '100%', width: 9,
        cursor: 'col-resize', touchAction: 'none', userSelect: 'none',
        borderRight: `2px solid ${hot ? 'rgba(127,127,127,0.7)' : 'transparent'}`,
      }}
    />
  )
}
