import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to: string
  /** Store key this crumb addresses (directories include a trailing
   *  slash). Populated by `<FileTree>`; optional so hand-built
   *  `Crumb[]`s stay valid. */
  path?: string
}

export interface CrumbCtx {
  crumb: Crumb
  index: number
  /** The current location — rendered as plain text, not a link. */
  isLast: boolean
  /** What `<Breadcrumb>` would have rendered for this crumb. */
  defaultNode: ReactNode
}

/** Per-crumb render hook, mirroring `CellRenderer` — return
 *  `ctx.defaultNode` for crumbs you don't want to touch. */
export type CrumbRenderer = (ctx: CrumbCtx) => ReactNode

export function Breadcrumb({ crumbs, separator = ' / ', rightSlot, renderCrumb }: { crumbs: Crumb[]; separator?: string; rightSlot?: ReactNode; renderCrumb?: CrumbRenderer }) {
  if (crumbs.length === 0 && !rightSlot) return null
  return (
    <nav aria-label="Breadcrumb" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.95em', marginBottom: '0.5em' }}>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        const defaultNode = isLast
          ? <span style={{ opacity: 0.7 }}>{c.label}</span>
          : <Link to={c.to}>{c.label}</Link>
        return (
          <span key={c.to}>
            {i > 0 && <span style={{ opacity: 0.5 }}>{separator}</span>}
            {renderCrumb ? renderCrumb({ crumb: c, index: i, isLast, defaultNode }) : defaultNode}
          </span>
        )
      })}
      {rightSlot && <span style={{ marginLeft: '0.8em' }}>{rightSlot}</span>}
    </nav>
  )
}
