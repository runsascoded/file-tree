/** Renderer for the `s2_cell` column: a bare `89c25854` tells you
 *  nothing, so hovering draws where it is.
 *
 *  Deliberately **tile-free**. A per-hover map instance against a tile
 *  provider is the worst version of this — an API key to leak, rate
 *  limits to hit, attribution to carry, and a WebGL context per row.
 *  The cell's footprint over the points already in the file answers the
 *  actual question ("whereabouts is this?") with an inline SVG and no
 *  network at all. ctbk does the same thing against its real station
 *  set (`www/src/components/S2CellTip.tsx`).
 *
 *  This is consumer code, not library code: `@rdub/file-tree` knows
 *  nothing about S2. It hands over `renderCell`; decoding the column is
 *  the consumer's business — which is the point the demo is making. */
import { useState, type ReactNode } from 'react'
import {
  autoUpdate, flip, FloatingPortal, offset, shift, useDismiss, useFloating,
  useHover, useInteractions, useRole,
} from '@floating-ui/react'
import {
  boundsOf, fmtMeters, projector, s2CellBounds, s2CellEdgeMeters, s2CellLevel,
  type LatLng,
} from '../lib/s2geo'
import { REGION_POINTS } from '../fixtures/parquet'

const { min, max, abs } = Math

const W = 190
const H = 150
const MARK = '#e53935'

/** Cell footprint over the region's points. At L13 the cell is a few px
 *  across, so anything under ~14px also gets a ring — otherwise the
 *  thing you hovered to find is invisible against the scatter. */
function Locator({ token, points }: { token: string; points: LatLng[] }) {
  if (!points.length) return null
  const proj = projector(boundsOf(points), W, H)
  const b = s2CellBounds(token)
  const x0 = proj.x(b.lngMin), x1 = proj.x(b.lngMax)
  const y0 = proj.y(b.latMax), y1 = proj.y(b.latMin)
  const w = abs(x1 - x0), h = abs(y1 - y0)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return (
    <svg width={W} height={H} style={{ display: 'block' }} role="img" aria-label={`location of ${token}`}>
      <g fill="currentColor" opacity={0.3}>
        {points.map(([lat, lng], i) => <circle key={i} cx={proj.x(lng)} cy={proj.y(lat)} r={1.1} />)}
      </g>
      <rect
        x={min(x0, x1)} y={min(y0, y1)} width={max(w, 2)} height={max(h, 2)}
        fill={MARK} fillOpacity={0.35} stroke={MARK} strokeWidth={1}
      />
      {max(w, h) < 14 && <circle cx={cx} cy={cy} r={9} fill="none" stroke={MARK} strokeWidth={1} opacity={0.7} />}
    </svg>
  )
}

function Meta({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: '0.6em', marginBottom: '0.4em' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <span style={{ opacity: 0.65 }}>{k}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/** Is this a value `S2Cell` can render? Checked by the caller so a
 *  value that isn't a token falls through to the viewer's default
 *  rather than rendering an empty cell. */
export function isS2Cell(value: unknown): value is string {
  return typeof value === 'string' && s2CellLevel(value) !== null
}

/** Floating-UI rather than a positioned `<span>`: the table scrolls in
 *  both axes, and an absolutely-positioned child gets clipped by that
 *  container. A portal escapes it, and `flip`/`shift` keep the preview
 *  on screen for cells near an edge — which, in a table, is most of
 *  them. */
export function S2Cell({ token, region }: { token: string; region: string }): ReactNode {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'right',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    // A short close delay bridges the 1px row border between adjacent
    // targets. Without it, mousing down the column reads as
    // hide/show/hide/show even with the targets flush.
    useHover(context, { move: false, delay: { open: 0, close: 80 } }),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ])
  const level = s2CellLevel(token)!
  return (
    <>
      {/* Fills the cell rather than hugging the text: the `<td>` gives
          up its padding (see `cellProps` in `MockDemo`) so adjacent
          targets are flush top-to-bottom, and running the mouse down
          the column doesn't fall into a gap between every row. */}
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        style={{ display: 'block', padding: '0.2em 0.6em', cursor: 'help' }}
      >
        <span style={{ borderBottom: '1px dotted currentColor' }}>
          {token}<sup style={{ opacity: 0.55, fontSize: '0.7em' }}>{level}</sup>
        </span>
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              zIndex: 10, padding: '0.5em', borderRadius: 4, whiteSpace: 'nowrap',
              border: '1px solid rgba(127,127,127,0.4)', background: 'Canvas',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)', fontSize: '0.9em',
            }}
            {...getFloatingProps()}
          >
            <Meta rows={[['token', token], ['level', `L${level}`], ['~edge', fmtMeters(s2CellEdgeMeters(token))]]} />
            <Locator token={token} points={REGION_POINTS[region] ?? []} />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
