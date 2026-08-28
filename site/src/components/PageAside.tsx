/** A panel beside the table, driven by `onPage` and `onCellHover`.
 *
 *  This is the shape ctbk actually uses (`www/src/pages/CellsDebug.tsx`):
 *  a `100vh` flex row, tables in a scrolling column, map filling the
 *  rest. The widget is a *sibling* of the table, not something the
 *  viewer could render — which is why these are callbacks and not a
 *  render slot. The viewer publishes; the consumer lays out.
 *
 *  Shows both hooks at once because they answer different questions and
 *  compose: `onPage` is "what's on screen" (the locator plots every
 *  row's cell), `onCellHover` is "what's under the cursor" (the detail
 *  below it). One tooltip could do neither — it can't summarise a page,
 *  and it can't stay put while you read it. */
import type { TableCellCtx, TablePageCtx } from '@rdub/file-tree/renderers/table'
import { boundsOf, projector, s2CellBounds, s2CellLevel, type LatLng } from '../lib/s2geo'
import { coastFor } from '../fixtures/coastlines'
import { REGION_POINTS } from '../fixtures/parquet'

const { min, max, abs } = Math
const W = 260
const H = 200
const MARK = '#e53935'

export interface AsideState {
  page: TablePageCtx | null
  cell: TableCellCtx | null
}

/** Every S2 cell on the current page, drawn at once — the thing a
 *  per-cell tooltip structurally cannot show. */
function PageMap({ page, cell }: AsideState) {
  const rows: Record<string, unknown>[] = page?.rows ?? []
  const region = String(rows[0]?.['region'] ?? 'nyc')
  const points: LatLng[] = REGION_POINTS[region] ?? []
  if (!points.length) return null
  const proj = projector(boundsOf(points), W, H)
  const coast = coastFor(region)

  const tokens = rows
    .map((r: Record<string, unknown>) => String(r['s2_cell'] ?? ''))
    .filter((t: string) => s2CellLevel(t) !== null)
  const hovered = cell?.column.name === 's2_cell' ? String(cell.value) : null

  return (
    <svg width={W} height={H} style={{ display: 'block' }} role="img" aria-label="cells on this page">
      <g fill="none" stroke="currentColor" strokeWidth={1} opacity={0.35}>
        {coast.map((line, i) => (
          <polyline key={i} points={line.map(([lat, lng]) => `${proj.x(lng)},${proj.y(lat)}`).join(' ')} />
        ))}
      </g>
      <g fill="currentColor" opacity={0.18}>
        {points.map(([lat, lng], i) => <circle key={i} cx={proj.x(lng)} cy={proj.y(lat)} r={1} />)}
      </g>
      {tokens.map((t: string, i: number) => {
        const b = s2CellBounds(t)
        const x0 = proj.x(b.lngMin), x1 = proj.x(b.lngMax)
        const y0 = proj.y(b.latMax), y1 = proj.y(b.latMin)
        const on = t === hovered
        return (
          <rect
            key={i}
            x={min(x0, x1)} y={min(y0, y1)}
            width={max(abs(x1 - x0), 2)} height={max(abs(y1 - y0), 2)}
            fill={MARK} fillOpacity={on ? 0.7 : 0.15}
            stroke={MARK} strokeWidth={on ? 1.5 : 0.5} strokeOpacity={on ? 1 : 0.5}
          />
        )
      })}
    </svg>
  )
}

export function PageAside({ page, cell }: AsideState) {
  return (
    <aside style={{
      width: W + 32, flexShrink: 0, padding: '0 0 0 1em',
      borderLeft: '1px solid rgba(127,127,127,0.3)', fontSize: '0.85em',
    }}>
      <h3 style={{ margin: '0 0 0.5em', fontSize: '1em' }}>This page</h3>
      {page
        ? (
          <>
            <p style={{ opacity: 0.7, margin: '0 0 0.5em' }}>
              {page.rows.length} rows{page.totalRows !== null && <> of {page.totalRows.toLocaleString()}</>}
              {' · '}rows {page.pageStart.toLocaleString()}–{(page.pageStart + page.rows.length).toLocaleString()}
            </p>
            <PageMap page={page} cell={cell} />
          </>
        )
        : <p style={{ opacity: 0.6 }}>no page yet</p>}

      <h3 style={{ margin: '1em 0 0.4em', fontSize: '1em' }}>Under the cursor</h3>
      {cell
        ? (
          <div style={{ fontFamily: 'ui-monospace, monospace', lineHeight: 1.6 }}>
            <div style={{ opacity: 0.6 }}>{cell.column.name}{cell.column.kind ? ` · ${cell.column.kind}` : ''}</div>
            <div style={{ wordBreak: 'break-all' }}>{String(cell.value)}</div>
            <div style={{ opacity: 0.6, marginTop: '0.4em' }}>row {cell.rowIndex.toLocaleString()}</div>
          </div>
        )
        : <p style={{ opacity: 0.6 }}>hover a cell</p>}
    </aside>
  )
}
