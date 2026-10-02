/** The `<tbody>` every table viewer renders: cells through `renderCell` and
 *  the `elide` strategy, runs (`ditto`) and path elision (`paths`) laid out
 *  per page. The viewers differ in where rows come from and what a default
 *  cell looks like; that's what they pass in.
 *
 *  See `tableRuns.ts` for the layout, `ditto.tsx` for the per-cell nodes. */
import { createPortal } from 'react-dom'
import {
  useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type Key, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject,
} from 'react'
import {
  applyElide, cellTitle, tableCellCtx, TD_STYLE,
  type ColStyle, type ResolvedElide, type RunRenderer, type TableCellCtx, type TableCellRenderer, type TableColumn,
} from './table'
import { ellipsisWrap } from './elideNode'
import { dimPathNode, runRenderer, treeChildNode } from './ditto'
import { groupHash, parseFolds, tableLayout, type BodyItem, type DittoOption, type GroupRows, type PathsOption, type RowGroup } from './tableRuns'
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

/** The line between rows, which merged run cells draw too (so every column
 *  shows row boundaries). Viewers use it for their `<tr>` borders. */
export const ROW_LINE = 'rgba(127,127,127,0.24)'
export const ROW_STYLE: CSSProperties = { borderTop: `1px solid ${ROW_LINE}` }
/** The hovered row's tint. */
export const ROW_HOVER = 'rgba(127,127,127,0.12)'

/** A merged run cell: where it starts (`d0`, a display row — possibly a
 *  group header just above the run), and the run it holds. */
interface Merge { i: number; d0: number; end: number; runRows: number[] }

/** Nearest scrollable ancestor (the viewer's table scroller), else the page. */
function scroller(el: HTMLElement): HTMLElement | Window {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if (oy === 'auto' || oy === 'scroll') return p
  }
  return window
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
  const anyGroups = layout.items.some(it => it.kind === 'group')
  const headH = useHeadHeight(tbody, anyMerged || anyGroups)
  const renderers = useMemo(() => new Map([...layout.specs].map(([c, s]) => [
    c, s.mode === 'none' ? undefined : (s.render ?? runRenderer<C>(s.mode, { float: s.float, every: s.every })) as RunRenderer<C> | undefined,
  ])), [layout.specs])

  // Display index of each visible page row (group headers shift them), and
  // the visible rows in order.
  const displayOf: number[] = []
  const order: number[] = []
  layout.items.forEach((it, d) => { if (it.kind === 'row') { displayOf[it.i] = d; order.push(it.i) } })
  const posOf: number[] = []
  order.forEach((i, k) => { posOf[i] = k })

  // Merged run cells, keyed by the display row they start on. A run's cell
  // extends up over group headers directly above its first row (except its
  // own column's, whose label it would cover), so a group's values start —
  // and float — from the group's top.
  const merges = new Map<number, Map<string, Merge>>()
  for (const c of columns) {
    if (!renderers.get(c.name)) continue
    const runs = layout.runs.get(c.name)!
    for (const i of order) {
      const run = runs[i]
      if (!run?.start) continue
      const runRows = order.slice(posOf[i], posOf[i] + run.length)
      let d0 = displayOf[i]
      for (;;) {
        const above = layout.items[d0 - 1]
        if (above?.kind !== 'group' || above.group.column === c.name) break
        d0--
      }
      if (!merges.has(d0)) merges.set(d0, new Map())
      merges.get(d0)!.set(c.name, { i, d0, end: displayOf[runRows[runRows.length - 1]], runRows })
    }
  }

  // Row hover: the hovered display row's cells tint via a per-table rule;
  // merged cells spanning it draw a band at its offset (from `--ft-hover`).
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const hoverStyle = useRef<HTMLStyleElement | null>(null)
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const st = document.createElement('style')
    document.head.appendChild(st)
    hoverStyle.current = st
    return () => { st.remove(); hoverStyle.current = null }
  }, [])
  const setHover = (d: number | null) => {
    tbody.current?.style.setProperty('--ft-hover', String(d ?? -1e4))
    if (hoverStyle.current) {
      hoverStyle.current.textContent = d === null ? '' : `tbody[data-ft="${id}"] > tr[data-d="${d}"] > td:not([rowspan]) { background: ${ROW_HOVER}; }`
    }
  }
  const onMouseMove = (e: ReactMouseEvent<HTMLTableSectionElement>) => {
    const td = (e.target as HTMLElement).closest('td')
    const tr = td?.parentElement
    if (!td || !tr?.dataset.d) return setHover(null)
    let d = Number(tr.dataset.d)
    if (td.rowSpan > 1) {
      const r = td.getBoundingClientRect()
      d += Math.min(td.rowSpan - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * td.rowSpan)))
    }
    setHover(d)
  }

  // Ancestor crumbs: the groups enclosing the first row under the header,
  // whose own header rows have scrolled out of view, float in their
  // column's header cell (like an editor's sticky scroll).
  const [crumbs, setCrumbs] = useState<RowGroup[]>([])
  const [crumbHost, setCrumbHost] = useState<HTMLElement | null>(null)
  const crumbCol = layout.items.find((it): it is Extract<BodyItem, { kind: 'group' }> => it.kind === 'group')?.group.column
  useLayoutEffect(() => {
    const tb = tbody.current
    const table = tb?.parentElement
    const ci = crumbCol === undefined ? -1 : columns.findIndex(c => c.name === crumbCol)
    const th = ci < 0 ? null : table?.querySelector<HTMLElement>(`:scope > thead > tr > th:nth-child(${ci + 1})`) ?? null
    if (!tb || !th) { setCrumbHost(null); setCrumbs([]); return }
    if (getComputedStyle(th).position === 'static') th.style.position = 'relative'
    setCrumbHost(th)
    const sc = scroller(tb)
    const update = () => {
      const top = th.getBoundingClientRect().bottom
      const trs = tb.querySelectorAll<HTMLTableRowElement>(':scope > tr[data-d]')
      const rowH = trs[0]?.getBoundingClientRect().height ?? 20
      // The row just below the header (and below the crumbs themselves,
      // which cover as many rows as there are ancestors), found in two passes.
      const firstBelow = (y: number) => {
        for (const tr of trs) if (tr.getBoundingClientRect().bottom > y + 1) return Number(tr.dataset.d)
        return -1
      }
      const chainAt = (d: number): RowGroup[] => {
        const it = layout.items[d]
        return it ? it.ancestors : []
      }
      let chain = chainAt(firstBelow(top))
      chain = chainAt(firstBelow(top + chain.length * rowH))
      // Only ancestors whose header row is above the fold.
      chain = chain.filter(g => {
        const tr = tb.querySelector<HTMLElement>(`:scope > tr[data-group="${CSS.escape(g.key)}"]`)
        return !tr || tr.getBoundingClientRect().top < top - 1
      })
      setCrumbs(prev => (prev.length === chain.length && prev.every((g, k) => g.key === chain[k].key) ? prev : chain))
    }
    update()
    sc.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { sc.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [layout, crumbCol, columns])
  const scrollToGroup = (g: RowGroup) => {
    const tb = tbody.current
    const tr = tb?.querySelector<HTMLElement>(`:scope > tr[data-group="${CSS.escape(g.key)}"]`)
    const th = crumbHost
    if (!tb || !tr || !th) return
    const sc = scroller(tb)
    const delta = tr.getBoundingClientRect().top - th.getBoundingClientRect().bottom
    if (sc === window) window.scrollBy(0, delta)
    else (sc as HTMLElement).scrollTop += delta
  }

  const width = (c: string) => widthStyle?.(c) ?? {}
  const coveredTo = new Map<string, number>()
  const covered = (c: string, d: number) => (coveredTo.get(c) ?? -1) >= d
  const cellBase = (c: C): CSSProperties => ({ ...(colStyles.get(c.name)?.cell ?? TD_STYLE), ...width(c.name) })
  const indentStyle = (c: C, depth: number): CSSProperties =>
    (depth ? { paddingLeft: `calc(${cellBase(c).paddingLeft ?? '0.6em'} + ${depth * INDENT_EM}em)` } : {})

  /** A group header's label: toggle, label (keeping a path prefix's head in
   *  the text, invisibly, so a copy is the full prefix), row count. */
  const groupLabel = (g: RowGroup, collapsed: boolean, size: number, onToggle?: () => void) => (
    <>
      <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'expand' : 'collapse'} onClick={onToggle ?? (() => toggleFold(g.key))} style={FOLD_BTN}>
        {collapsed ? '▸' : '▾'}
      </button>
      {typeof g.label === 'string' && g.prefix
        ? <><span style={{ fontSize: 0 }}>{g.prefix.slice(0, g.prefix.length - g.label.length)}</span>{g.label}</>
        : g.label}
      <span style={{ opacity: 0.45 }}>{` · ${size.toLocaleString()}${collapsed ? ` row${size === 1 ? '' : 's'}` : ''}`}</span>
    </>
  )

  /** A data row's cell: content, title and handlers, before any merging. */
  const dataCell = (it: Extract<BodyItem, { kind: 'row' }>, c: C) => {
    const { i, depth, group } = it
    const row = rows[i]
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
    // Under a group that already states this column's value, say nothing.
    const stated = it.ancestors.some(g => g.uniform && g.column === c.name)
    const rendered = stated ? null : renderCell ? renderCell(ctx) : start
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
    // A merged run's title is its value, wherever in the run you hover.
    if (!stated && ((isPath && rendered === start && el.tooltip === 'native') || (run?.start && renderers.get(c.name) && el.tooltip === 'native' && !custom))) {
      const t = cellTitle(value)
      if (t !== undefined) { title = t; measure = undefined }
    }
    const hoverEnter = onCellHover ? () => notifyHover(ctx) : undefined
    const props = {
      ...(title != null ? { title } : {}),
      ...(measure || hoverEnter ? { onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => { measure?.(e); hoverEnter?.() } } : {}),
      ...(onCellHover ? { onMouseLeave: () => notifyHover(null) } : {}),
    }
    return { node, props, value, style: { ...cellBase(c), ...indentStyle(c, indent) } }
  }

  /** A merged run cell, starting at display row `d`. */
  const mergedCell = (m: Merge, c: C, d: number) => {
    const it = layout.items[displayOf[m.i]] as Extract<BodyItem, { kind: 'row' }>
    const { node, props, value, style } = dataCell(it, c)
    const span = m.end - d + 1
    coveredTo.set(c.name, m.end)
    const content = renderers.get(c.name)!({
      value, column: c, rows: m.runRows.map(k => rows[k]), span,
      offsets: m.runRows.map(k => displayOf[k] - d), defaultNode: node, stickyTop: headH, path,
    })
    // Row lines and the hover band, under the renderer's content, so every
    // column shows row boundaries and the hovered row.
    const slot = `calc(100% / ${span})`
    return (
      <td
        key={c.name}
        rowSpan={span}
        data-run={m.runRows.length}
        className={colStyles.get(c.name)?.cellClass}
        style={{ ...style, overflow: 'visible', verticalAlign: 'top', position: 'relative' }}
        {...props}
      >
        <span aria-hidden style={{
          position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${slot} - 1px), ${ROW_LINE} calc(${slot} - 1px), ${ROW_LINE} ${slot})`,
        }}>
          <span style={{
            position: 'absolute', left: 0, right: 0, height: slot, background: ROW_HOVER,
            top: `calc((var(--ft-hover, -10000) - ${d}) * 100% / ${span})`,
          }} />
        </span>
        {content}
      </td>
    )
  }

  const trs = layout.items.map((it, d) => {
    const starts = merges.get(d)
    const cells = columns.map(c => {
      const m = starts?.get(c.name)
      if (m) return mergedCell(m, c, d)
      if (covered(c.name, d)) return null
      const st = colStyles.get(c.name)
      if (it.kind === 'group') {
        const { group: g, depth, collapsed, size } = it
        if (c.name !== g.column) return <td key={c.name} style={cellBase(c)} className={st?.cellClass} />
        return (
          // `ltr`: a header is toggle + label, not a value to clip from the start.
          <td key={c.name} style={{ ...cellBase(c), direction: 'ltr', ...indentStyle(c, depth) }} className={st?.cellClass} {...(g.title ? { title: g.title } : {})}>
            {groupLabel(g, collapsed, size)}
          </td>
        )
      }
      const { node, props, style } = dataCell(it, c)
      return <td key={c.name} style={style} className={st?.cellClass} {...props}>{node}</td>
    })
    return it.kind === 'group'
      ? <tr key={`group:${it.group.key}`} data-d={d} data-group={it.group.key} data-depth={it.depth} style={rowStyle}>{cells}</tr>
      : <tr key={rowKey(it.i)} data-d={d} style={rowStyle}>{cells}</tr>
  })

  const crumbBar = crumbHost && crumbs.length > 0 && createPortal(
    <div data-crumbs="" style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 2, fontWeight: 400, textAlign: 'left',
      background: 'var(--ft-run-bg, Canvas)', boxShadow: '0 3px 6px -3px rgba(0,0,0,0.5)',
    }}>
      {crumbs.map((g, k) => (
        <div
          key={g.key}
          onClick={() => scrollToGroup(g)}
          title={g.title ?? (typeof g.label === 'string' ? g.label : undefined)}
          style={{
            ...TD_STYLE, maxWidth: 'none', cursor: 'pointer', direction: 'ltr',
            paddingLeft: `calc(0.6em + ${k * INDENT_EM}em)`, borderBottom: `1px solid ${ROW_LINE}`,
          }}
        >
          {groupLabel(g, false, g.end - g.start, () => toggleFold(g.key))}
        </div>
      ))}
    </div>,
    crumbHost,
  )

  return (
    <tbody ref={tbody} data-ft={id} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
      {trs}
      {children}
      {crumbBar}
    </tbody>
  )
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
