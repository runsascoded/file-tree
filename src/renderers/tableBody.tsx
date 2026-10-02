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
  applyElide, chainCellRenderers, tableCellCtx, TD_STYLE,
  type ColStyle, type ResolvedElide, type TableCellCtx, type TableCellRenderer, type TableColumn,
} from './table'
import { ellipsisWrap } from './elideNode'
import { dimPathNode, dittoRenderer, runLine, treeChildNode } from './ditto'
import { splitParent, tableLayout, type DittoOption, type PathsOption } from './tableRuns'
import { useStableCallback } from './tableControls'

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

export function TableRows<C extends TableColumn = TableColumn>({
  rows, columns, path, colStyles, widthStyle, el, ditto, paths, renderCell,
  defaultNode, raw, rowIndex, rowKey = i => i, rowStyle, onCellHover, children,
}: TableRowsProps<C>) {
  const layout = useMemo(() => tableLayout(rows, columns, { ditto, paths }), [rows, columns, ditto, paths])
  const cellRenderer = useMemo(
    () => chainCellRenderers(ditto ? dittoRenderer<C>(ditto) : undefined, renderCell),
    [ditto, renderCell])
  const notifyHover = useStableCallback(onCellHover)
  const tbody = useRef<HTMLTableSectionElement>(null)
  const anySticky = [...layout.specs.values()].some(s => s.mode === 'sticky')
  const headH = useHeadHeight(tbody, anySticky)

  // Display index of each page row (parent rows shift them), for a sticky
  // run's `rowSpan`; and per column, the last display row a span covers.
  const displayOf: number[] = []
  layout.items.forEach((it, d) => { if (it.kind === 'row') displayOf[it.i] = d })
  const coveredTo = new Map<string, number>()
  const covered = (c: string, d: number) => (coveredTo.get(c) ?? -1) >= d
  const width = (c: string) => widthStyle?.(c) ?? {}

  const trs = layout.items.map((it, d) => {
    if (it.kind === 'parent') {
      const next = rows[it.first]
      const prev = rows[it.first - 1]
      return (
        <tr key={`parent:${rowKey(it.first)}`} data-parent="" style={rowStyle}>
          {columns.map(c => {
            if (covered(c.name, d)) return null
            const st = colStyles.get(c.name)
            const style = { ...(st?.cell ?? TD_STYLE), ...width(c.name) }
            let node: ReactNode = null
            let title: string | undefined
            if (c.name === it.column) {
              node = ellipsisWrap(st?.ellipsis ?? 'end', dimPathNode(it.prefix, prev?.[c.name]), undefined)
              title = it.prefix
            } else {
              // A `'line'` run continuing past this row keeps its rule.
              const run = layout.runs.get(c.name)?.[it.first]
              if (layout.specs.get(c.name)?.mode === 'line' && run && !run.start) node = runLine(next[c.name], false)
            }
            return <td key={c.name} style={style} className={st?.cellClass} {...(title ? { title } : {})}>{node}</td>
          })}
        </tr>
      )
    }
    const { i } = it
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
          const pathMode = layout.paths.get(c.name)
          const isPath = pathMode !== undefined && typeof value === 'string'
          if (isPath) {
            if (pathMode === 'tree' && it.tree) {
              const [parent, tail] = splitParent(value)
              start = treeChildNode(parent, tail, it.tree.last)
            } else {
              start = dimPathNode(value, rows[i - 1]?.[c.name])
            }
          }
          const ctx = tableCellCtx<C>({
            value, column: c, row, at: dr => rows[i + dr], rowIndex: rowIndex(i), path, defaultNode: start,
            ...(run ? { run } : {}),
          })
          const rendered = cellRenderer ? cellRenderer(ctx) : start
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
          if (isPath && rendered === start && el.tooltip === 'native') {
            title = value
            measure = undefined
          }
          const hoverEnter = onCellHover ? () => notifyHover(ctx) : undefined
          const handlers = {
            ...(measure || hoverEnter ? { onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => { measure?.(e); hoverEnter?.() } } : {}),
            ...(onCellHover ? { onMouseLeave: () => notifyHover(null) } : {}),
          }
          const tips = title != null ? { title } : {}
          const style = { ...(st?.cell ?? TD_STYLE), ...width(c.name) }
          if (run?.start && layout.specs.get(c.name)?.mode === 'sticky') {
            // One cell spanning the run (parent rows included); its value
            // sticks under the header while any of the run is in view. The
            // clip moves to the inner box: an `overflow: hidden` cell would
            // be the sticky box's scroll container, and it'd never move.
            const rowSpan = displayOf[i + run.length - 1] - d + 1
            coveredTo.set(c.name, d + rowSpan - 1)
            return (
              <td key={c.name} rowSpan={rowSpan} data-run={run.length} className={st?.cellClass} style={{ ...style, overflow: 'visible', verticalAlign: 'top' }}>
                <div
                  {...tips}
                  {...handlers}
                  style={{ position: 'sticky', top: headH, maxWidth: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {node}
                </div>
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
