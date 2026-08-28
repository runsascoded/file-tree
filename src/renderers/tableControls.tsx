/** Shared table chrome: the column picker, for every table-shaped
 *  viewer.
 *
 *  Wide tables are common — ctbk's enriched shard is 33 columns — and
 *  horizontal scrolling is a poor way to read one. Hiding columns needs
 *  no extra data, so unlike sort and filter it works at any file size.
 *
 *  **Table-level, not per-header**, which diverges from
 *  `specs/small-table-mode.md`: a hide control on each `<th>` removes
 *  the very header you'd click to bring it back. It also spares the
 *  header the third affordance it was heading for — it already carries
 *  a name, a stats tooltip, and whatever the consumer's `renderHeader`
 *  adds. */
import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import type { PersistedState } from '../react/persistedState'
import { defaultUseState } from '../react/persistedState'
import type { TableColumn } from './table'

const BTN: CSSProperties = {
  font: 'inherit', fontSize: '0.85em', lineHeight: 1.4, cursor: 'pointer',
  padding: '0.15em 0.5em', borderRadius: 3, color: 'inherit',
  border: '1px solid rgba(127,127,127,0.4)', background: 'transparent',
}

export interface ColumnVisibility {
  /** Names to render, in schema order. */
  visible: readonly string[]
  toggle: (name: string) => void
  showAll: () => void
  hidden: ReadonlySet<string>
}

/** Which columns to render.
 *
 *  Stored as the *hidden* set rather than the visible one, so that a
 *  file gaining a column shows it by default — an allow-list would
 *  silently hide anything added after the URL was shared.
 *
 *  Goes through `usePersistedState`, so a consumer passing
 *  `useUrlPersistedState` gets `?hide=a,b` and can paste a link to a
 *  column subset. That's most of the point.
 */
export function useColumnVisibility(
  columns: readonly TableColumn[],
  usePersistedState?: PersistedState,
  initialHidden: readonly string[] = [],
): ColumnVisibility {
  const use = usePersistedState ?? defaultUseState
  const [raw, setRaw] = use<string>('hide', initialHidden.join(','))
  const hidden = useMemo(
    () => new Set(raw.split(',').map(s => s.trim()).filter(Boolean)),
    [raw])

  const toggle = useCallback((name: string) => {
    const next = new Set(hidden)
    next.delete(name) || next.add(name)
    setRaw([...next].join(','))
  }, [hidden, setRaw])

  const showAll = useCallback(() => setRaw(''), [setRaw])

  const visible = useMemo(
    () => columns.map(c => c.name).filter(n => !hidden.has(n)),
    [columns, hidden])

  return { visible, toggle, showAll, hidden }
}

/** `columns (5/7)`, opening a checkbox list. Collapsed by default: on a
 *  narrow table it's chrome nobody needs, and the count alone says
 *  whether anything is hidden. */
export function ColumnPicker({ columns, vis }: { columns: readonly TableColumn[]; vis: ColumnVisibility }) {
  const [open, setOpen] = useState(false)
  const { visible, toggle, showAll, hidden } = vis
  return (
    // Note the *host* has to be positioned with a z-index for the panel
    // to paint over the table — see the summary line in `parquet.tsx` /
    // `csv.tsx`. A z-index here can't do it alone: this span is a flex
    // item of that line, so it paints in the line's place in the root
    // stacking order, which is before the table.
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={BTN} aria-expanded={open}
        title="Show or hide columns">
        columns {visible.length}/{columns.length}
      </button>
      {open && (
        <span
          role="group"
          aria-label="Columns"
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 5, marginTop: '0.25em',
            padding: '0.4em 0.6em', borderRadius: 4, whiteSpace: 'nowrap',
            border: '1px solid rgba(127,127,127,0.4)', background: 'Canvas',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)', display: 'block',
          }}
        >
          {columns.map(c => (
            <label key={c.name} style={{ display: 'block', cursor: 'pointer', fontSize: '0.9em' }}>
              <input
                type="checkbox"
                checked={!hidden.has(c.name)}
                onChange={() => toggle(c.name)}
              />{' '}{c.name}
            </label>
          ))}
          {hidden.size > 0 && (
            <button type="button" onClick={showAll} style={{ ...BTN, marginTop: '0.4em' }}>show all</button>
          )}
        </span>
      )}
    </span>
  )
}


/** Free-text filter over the rows the viewer has.
 *
 *  Same idiom as the directory listing's filter and the JSON tree's
 *  search — a plain box, matching anywhere, case-insensitive — rather
 *  than a third thing to learn. Shares `?q=` with them for the same
 *  reason: it's "the search box on this page", and a listing and a file
 *  are never on screen together.
 */
export function useFilter(usePersistedState?: PersistedState): [string, (v: string) => void] {
  const use = usePersistedState ?? defaultUseState
  return use<string>('q', '')
}

/** Rows whose *visible* cells contain `q`.
 *
 *  Visible, not all: filtering on a column you've hidden produces rows
 *  with no apparent reason to be there, which reads as a bug. */
export function filterRows<R extends Record<string, unknown>>(
  rows: R[] | null, q: string, columns: readonly string[],
): R[] | null {
  const needle = q.trim().toLowerCase()
  if (!rows || !needle) return rows
  return rows.filter(r => columns.some(c => {
    const v = r[c]
    return v !== null && v !== undefined && String(v).toLowerCase().includes(needle)
  }))
}

export function FilterInput({ value, onChange, count, placeholder = 'filter' }: {
  value: string
  onChange: (v: string) => void
  /** `matched / total`, shown when filtering. */
  count?: { shown: number; total: number }
  placeholder?: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          font: 'inherit', fontSize: '0.9em', padding: '0.15em 0.4em',
          borderRadius: 3, border: '1px solid rgba(127,127,127,0.4)',
          background: 'transparent', color: 'inherit', minWidth: '10em',
        }}
      />
      {value.trim() !== '' && count && (
        <span style={{ opacity: 0.7 }}>{count.shown.toLocaleString()} / {count.total.toLocaleString()}</span>
      )}
    </span>
  )
}
