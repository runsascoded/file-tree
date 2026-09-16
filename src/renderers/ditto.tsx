import type { ReactNode } from 'react'

/** The ditto mark a collapsed repeated value renders instead of its text
 *  (see {@link import('./table').TableViewerOptions.ditto}). Dimmed and
 *  centered so a run reads as one block and the changes stand out; `〃`
 *  (U+3003) rather than a straight quote so it reads as "same as above"
 *  even mid-column. Kept out of `table.ts` so that module needs no React
 *  runtime. */
export function dittoMark(): ReactNode {
  return <span aria-label="ditto" style={{ opacity: 0.3, display: 'block', textAlign: 'center' }}>〃</span>
}
