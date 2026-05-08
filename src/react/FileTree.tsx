/** `<FileTree>` — top-level browser component.
 *
 * Drop into a route. Reads the URL splat after `routeBase` and dispatches
 * to the appropriate view (dir listing, text preview, etc.) using the
 * provided `Store`.
 *
 * Usage:
 *   <Route path="/files/*" element={
 *     <FileTree store={store} routeBase="/files" />
 *   } />
 */
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import type { Store } from '../types'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { DirListing } from './DirListing'
import { TextViewer } from './TextViewer'
import { type Parsed, parsePath, basename, keyToSplat } from './parsePath'

export interface FileTreeProps {
  store: Store
  /** Path the browser is mounted under, e.g. `/files`. */
  routeBase: string
  /** Optional store-key prefix prepended to the URL splat (e.g. `'raw/'`).
   *  Use this when the route exposes only a sub-tree of the store. */
  rootPrefix?: string
  /** Additional file extensions to render as text. */
  extraTexty?: string[]
  /** Optional title to show above the breadcrumb. */
  title?: string
  /** Optional className for the outer wrapper. */
  className?: string
  /** Optional inline style for the outer wrapper. */
  style?: React.CSSProperties
}

export function FileTree({ store, routeBase, rootPrefix = '', extraTexty, title, className, style }: FileTreeProps) {
  const location = useLocation()
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`)
  const splat = location.pathname.replace(baseRe, '')
  const parsed = useMemo(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty])
  const crumbs = useMemo(() => buildCrumbs(parsed, routeBase, rootPrefix), [parsed, routeBase, rootPrefix])

  return (
    <div className={className} style={style}>
      {title && <h1 style={{ fontSize: '1.4em', margin: '0 0 0.3em' }}>{title}</h1>}
      <Breadcrumb crumbs={crumbs} />
      <Body store={store} parsed={parsed} routeBase={routeBase} rootPrefix={rootPrefix} />
    </div>
  )
}

function Body({ store, parsed, routeBase, rootPrefix }: { store: Store; parsed: Parsed; routeBase: string; rootPrefix: string }) {
  switch (parsed.kind) {
    case 'dir':
      return <DirListing store={store} prefix={parsed.prefix} routeBase={routeBase} rootPrefix={rootPrefix} />
    case 'text':
      return <TextViewer store={store} path={parsed.path} />
    case 'zip':
    case 'zipEntry':
      return <UnsupportedView label="Zip preview" />
    case 'parquet':
      return <UnsupportedView label="Parquet preview" />
    case 'pdf':
      return <UnsupportedView label="PDF preview" />
    case 'binary':
      return (
        <div style={{ opacity: 0.7 }}>
          Preview not supported for this file type.
        </div>
      )
  }
}

function UnsupportedView({ label }: { label: string }) {
  return <div style={{ opacity: 0.7 }}>{label} not yet supported in this version.</div>
}

function buildCrumbs(parsed: Parsed, routeBase: string, rootPrefix: string): Crumb[] {
  const path = parsed.kind === 'dir' ? parsed.prefix : parsed.kind === 'zipEntry' ? `${parsed.path}!/${parsed.entry}` : parsed.path
  const splat = keyToSplat(path, rootPrefix)
  const parts = splat.split('/').filter(p => p.length > 0)
  const baseTrimmed = routeBase.replace(/\/+$/, '')
  const crumbs: Crumb[] = [{ label: 'root', to: `${baseTrimmed}/` }]
  let cum = ''
  for (const p of parts) {
    cum = cum ? `${cum}/${p}` : p
    crumbs.push({
      label: basename(p),
      to: `${baseTrimmed}/${cum}${parsed.kind === 'dir' && cum === splat ? '/' : ''}`,
    })
  }
  return crumbs
}
