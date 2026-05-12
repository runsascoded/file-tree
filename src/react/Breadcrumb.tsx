import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to: string
}

export function Breadcrumb({ crumbs, separator = ' / ', rightSlot }: { crumbs: Crumb[]; separator?: string; rightSlot?: ReactNode }) {
  if (crumbs.length === 0 && !rightSlot) return null
  return (
    <nav aria-label="Breadcrumb" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.95em', marginBottom: '0.5em' }}>
      {crumbs.map((c, i) => (
        <span key={c.to}>
          {i > 0 && <span style={{ opacity: 0.5 }}>{separator}</span>}
          {i === crumbs.length - 1
            ? <span style={{ opacity: 0.7 }}>{c.label}</span>
            : <Link to={c.to}>{c.label}</Link>}
        </span>
      ))}
      {rightSlot && <span style={{ marginLeft: '0.8em' }}>{rightSlot}</span>}
    </nav>
  )
}
