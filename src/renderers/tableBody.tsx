/** The `<tbody>` every table viewer renders: cells through `renderCell` and
 *  the `elide` strategy, runs (`ditto`) and path elision (`paths`) laid out
 *  per page. The viewers differ in where rows come from and what a default
 *  cell looks like; that's what they pass in.
 *
 *  See `tableRuns.ts` for the layout, `ditto.tsx` for the per-cell nodes. */
import {
  useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type Key, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject,
} from 'react'
import {
  applyElide, cellTitle, tableCellCtx, TD_STYLE,
  type ColStyle, type ResolvedElide, type RunRenderer, type TableCellCtx, type TableCellRenderer, type TableColumn,
} from './table'
import { ellipsisWrap } from './elideNode'
import { dimPathNode, runRenderer, treeChildNode } from './ditto'
import { groupHash, parseFolds, tableLayout, type DittoOption, type GroupRows, type PathsOption } from './tableRuns'
import { useStableCallback } from './tableControls'
import { defaultUseState, type PersistedState } from '../react/persistedState'

export interface TableRowsProps<C extends TableColumn = TableColumn> {
  /** The page, in display order (after sort/filter). */
  rows: readonly Record<string, unknown>[]
  /** Visible columns, in render order. */
  columns: readonly C[]
  path: string
  colStyles: Map<string, ColStyle>
  /** A column's pinned width (`useColumnWidths().styleFor`). */
  widthStyle?: (col: string) => CSSProperties
  el: ResolvedElide<C>
  ditto?: DittoOption
  paths?: PathsOption
  groups?: GroupRows
  /** Persists collapsed groups (`fold`). */
  usePersistedState?: PersistedState
  renderCell?: TableCellRenderer<C>
  /** What the viewer renders for a value by default. */
  defaultNode: (value: unknown, column: C) => ReactNode
  /** The underlying scalar of an interpreted cell (see `ElideCtx.raw`). */
  raw?: (value: unknown, column: C) => string | undefined
  /** Row index reported to `renderCell` for page row `i`. */
  rowIndex: (i: number) => number
  rowKey?: (i: number) => Key
  rowStyle?: CSSProperties
  onCellHover?: (ctx: TableCellCtx<C> | null) => void
  /** Rows after the page's (loading / empty states). */
  children?: ReactNode
}

/** Height of the `<thead>` of the table around `tbody`, kept current, so a
 *  sticky run value floats just under a sticky header. */
function useHeadHeight(tbody: RefObject<HTMLTableSectionElement | null>, on: boolean): number {
  const [h, setH] = useState(0)
  useLayoutEffect(() => {
    const head = tbody.current?.parentElement?.querySelector<HTMLElement>(':scope > thead')
    if (!on || !head) return
    const update = () => setH(head.getBoundingClientRect().height)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(head)
    return () => ro.disconnect()
  }, [tbody, on])
  return h
}

const INDENT_EM = 1.1
const FOLD_BTN: CSSProperties = {
  border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
  padding: '0 0.3em 0 0', opacity: 0.6,
}

export function TableRows<C extends TableColumn = TableColumn>({
  rows, columns, path, colStyles, widthStyle, el, ditto, paths, groups, renderCell,
  defaultNode, raw, rowIndex, rowKey = i => i, rowStyle, onCellHover, usePersistedState, children,
}: TableRowsProps<C>) {
  const use = usePersistedState ?? defaultUseState
  const [foldRaw, setFoldRaw] = use<string>('fold', '')
  const folded = useMemo(() => parseFolds(foldRaw), [foldRaw])
  const toggleFold = (key: string) => {
    const h = groupHash(key)
    const next = new Set(folded)
    if (next.has(h)) next.delete(h)
    else next.add(h)
    setFoldRaw([...next].join(''))
  }
  const layout = useMemo(
    () => tableLayout(rows, columns, { ditto, paths, ...(groups ? { groups } : {}), folded }),
    [rows, columns, ditto, paths, groups, folded])
  const notifyHover = useStableCallback(onCellHover)
  const tbody = useRef<HTMLTableSectionElement>(null)
  const anyMerged = [...layout.specs.values()].some(s => s.mode !== 'none')
  const headH = useHeadHeight(tbody, anyMerged)
  const renderers = useMemo(() => new Map([...layout.specs].map(([c, s]) => [
    c, s.mode === 'none' ? undefined : (s.render ?? runRenderer<C>(s.mode, { float: s.float, every: s.every })) as RunRenderer<C> | undefined,
  ])), [layout.specs])

  // Display index of each visible page row (group headers shift them), and
  // the visible rows in order, for a run's span; per column, the last
  // display row a merged run covers.
  const displayOf: number[] = []
  const order: number[] = []
  layout.items.forEach((it, d) => { if (it.kind === 'row') { displayOf[it.i] = d; order.push(it.i) } })
  const posOf: number[] = []
  order.forEach((i, k) => { posOf[i] = k })
  const coveredTo = new Map<string, number>()
  const covered = (c: string, d: number) => (coveredTo.get(c) ?? -1) >= d
  const width = (c: string) => widthStyle?.(c) ?? {}

  const trs = layout.items.map((it, d) => {
    if (it.kind === 'group') {
      const { group: g, depth, collapsed, size } = it
      const label = typeof g.label === 'string' && g.prefix
        // Keep the prefix's head in the text (invisibly), so a copy is the full prefix.
        ? <><span style={{ fontSize: 0 }}>{g.prefix.slice(0, g.prefix.length - g.label.length)}</span>{g.label}</>
        : g.label
      return (
        <tr key={`group:${g.key}`} data-group={g.key} data-depth={depth} style={rowStyle}>
          {columns.map(c => {
            if (covered(c.name, d)) return null
            const st = colStyles.get(c.name)
            const style = { ...(st?.cell ?? TD_STYLE), ...width(c.name) }
            if (c.name !== g.column) return <td key={c.name} style={style} className={st?.cellClass} />
            return (
              // `ltr`: a header is toggle + label, not a value to clip from the start.
              <td key={c.name} style={{ ...style, direction: 'ltr', paddingLeft: `calc(${style.paddingLeft ?? '0.6em'} + ${depth * INDENT_EM}em)` }} className={st?.cellClass} {...(g.title ? { title: g.title } : {})}>
                <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'expand' : 'collapse'} onClick={() => toggleFold(g.key)} style={FOLD_BTN}>
                  {collapsed ? '▸' : '▾'}
                </button>
                {label}
                {collapsed && <span style={{ opacity: 0.5 }}>{` · ${size.toLocaleString()} row${size === 1 ? '' : 's'}`}</span>}
              </td>
            )
          })}
        </tr>
      )
    }
    const { i, depth, group } = it
    const row = rows[i]
    return (
      <tr key={rowKey(i)} style={rowStyle}>
        {columns.map(c => {
          if (covered(c.name, d)) return null
          const st = colStyles.get(c.name)
          const ellipsis = st?.ellipsis ?? 'end'
          const value = row[c.name]
          const run = layout.runs.get(c.name)?.[i]
          const base = defaultNode(value, c)
          // Path elision replaces the default node; the full path goes on the
          // title below, unless a `renderCell` takes the cell over.
          let start = base
          let indent = 0
          const pathMode = layout.paths.get(c.name)
          const isPath = pathMode !== undefined && typeof value === 'string'
          if (isPath) {
            if (group?.prefix !== undefined && group.column === c.name && value.startsWith(group.prefix)) {
              start = treeChildNode(group.prefix, value.slice(group.prefix.length), i === group.end - 1)
              indent = depth
            } else {
              const above = order[posOf[i] - 1]
              start = dimPathNode(value, above === undefined ? undefined : rows[above][c.name])
            }
          }
          const ctx = tableCellCtx<C>({
            value, column: c, row, at: dr => rows[i + dr], rowIndex: rowIndex(i), path, defaultNode: start,
            ...(run ? { run } : {}),
          })
          const rendered = renderCell ? renderCell(ctx) : start
          // A renderer returning `defaultNode` untouched leaves the cell
          // default: it keeps the native title and string-aware ellipsis.
          const custom = rendered !== base
          // Ellipsis-wrap *before* the tooltip so a render-prop wraps the
          // reshaped node (`'middle'` rebuilds from the string, discarding
          // whatever it wraps otherwise).
          const wrapped = ellipsisWrap(ellipsis, rendered, !custom && typeof value === 'string' ? value : undefined)
          const elided = applyElide(el, { value, node: wrapped, hasCustomRender: custom, column: c, row, path, raw: raw?.(value, c), ellipsis })
          const { node } = elided
          let { title, onMouseEnter: measure } = elided
          const runRender = renderers.get(c.name)
          // A merged run's title is its value, wherever in the run you hover.
          if ((isPath && rendered === start && el.tooltip === 'native') || (run?.start && runRender && el.tooltip === 'native' && !custom)) {
            const t = cellTitle(value)
            if (t !== undefined) { title = t; measure = undefined }
          }
          const hoverEnter = onCellHover ? () => notifyHover(ctx) : undefined
          const handlers = {
            ...(measure || hoverEnter ? { onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => { measure?.(e); hoverEnter?.() } } : {}),
            ...(onCellHover ? { onMouseLeave: () => notifyHover(null) } : {}),
          }
          const tips = title != null ? { title } : {}
          const style: CSSProperties = {
            ...(st?.cell ?? TD_STYLE), ...width(c.name),
            ...(indent ? { paddingLeft: `calc(${(st?.cell ?? TD_STYLE).paddingLeft ?? '0.6em'} + ${indent * INDENT_EM}em)` } : {}),
          }
          if (run?.start && runRender) {
            // One cell spanning the run (group rows included), filled by the
            // run renderer. The clip moves to the renderer's own box: an
            // `overflow: hidden` cell would be a floating value's scroll
            // container, and it'd never move.
            const runRows = order.slice(posOf[i], posOf[i] + run.length)
            const spanEnd = displayOf[runRows[runRows.length - 1]]
            const span = spanEnd - d + 1
            coveredTo.set(c.name, spanEnd)
            const content = runRender({
              value, column: c, rows: runRows.map(k => rows[k]), span,
              offsets: runRows.map(k => displayOf[k] - d), defaultNode: node, stickyTop: headH, path,
            })
            return (
              <td
                key={c.name}
                rowSpan={span}
                data-run={run.length}
                className={st?.cellClass}
                style={{ ...style, overflow: 'visible', verticalAlign: 'top', position: 'relative' }}
                {...tips}
                {...handlers}
              >
                {content}
              </td>
            )
          }
          return (
            <td key={c.name} style={style} className={st?.cellClass} {...tips} {...handlers}>
              {node}
            </td>
          )
        })}
      </tr>
    )
  })
  return <tbody ref={tbody}>{trs}{children}</tbody>
}

/** A header's path-mode note, made visible: a `'tree'` column on an
 *  unsorted page shows a small chip that sorts by it (when the viewer can
 *  sort), the note on its title. */
export function PathNote({ note, onSort }: { note: string | undefined; onSort?: () => void }) {
  if (!note) return null
  const style: CSSProperties = {
    marginLeft: '0.5em', fontSize: '0.8em', fontWeight: 400, opacity: 0.75, padding: '0 0.4em',
    border: '1px dashed currentColor', borderRadius: 3, background: 'transparent', color: 'inherit', font: 'inherit',
  }
  return onSort
    ? <button type="button" title={note} onClick={e => { e.stopPropagation(); onSort() }} style={{ ...style, cursor: 'pointer' }}>sort for tree</button>
    : <span title={note} style={style}>tree needs sort</span>
}
