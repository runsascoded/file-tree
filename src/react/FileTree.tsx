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
import { useMemo, type ComponentType, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Store } from '../types'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { DirListing } from './DirListing'
import { MediaViewer } from './MediaViewer'
import { TextViewer } from './TextViewer'
import { type Parsed, parsePath, basename, keyToSplat, extOf } from './parsePath'

/** Optional renderer that converts a markdown source string into a
 *  React node. Pluggable so the lib doesn't bundle a markdown library;
 *  consumers wire `react-markdown` (or any equivalent). When provided,
 *  `<TextViewer>` uses it for `.md`/`.markdown` files and
 *  `<DirListing>` uses it for default-README rendering below the
 *  directory table. */
export type MarkdownRenderer = (source: string) => ReactNode

/** Optional component that renders a Parquet (`.parquet` / `.pqt`)
 *  file. Pluggable so the lib doesn't bundle `hyparquet` (or any
 *  equivalent). When provided, parquet paths render via this component
 *  instead of a "not supported" placeholder.
 *
 *  Recommended implementation: use `asyncBufferFromStore(store, path)`
 *  (exported from this module) to feed `hyparquet`'s `parquetMetadataAsync`
 *  + `parquetRead`. See `site/src/ParquetViewer.tsx` for a reference impl. */
export type ParquetRenderer = ComponentType<{ store: Store; path: string }>

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
  /** Optional markdown renderer (see `MarkdownRenderer`). When set, `.md`
   *  files render as rich markdown (instead of plaintext `<pre>`) and
   *  any `README.md` in a directory is rendered below the listing. */
  markdownRenderer?: MarkdownRenderer
  /** Optional parquet renderer (see `ParquetRenderer`). When set,
   *  `.parquet`/`.pqt` paths render via this component (typically a
   *  hyparquet-backed table). */
  parquetRenderer?: ParquetRenderer
  /** Optional JSON renderer. When set, `.json` files render via this fn
   *  (typically a collapsible tree) instead of plaintext `<pre>`. */
  jsonRenderer?: (source: string) => ReactNode
}

export function FileTree({ store, routeBase, rootPrefix = '', extraTexty, title, className, style, markdownRenderer, parquetRenderer, jsonRenderer }: FileTreeProps) {
  const location = useLocation()
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`)
  const splat = location.pathname.replace(baseRe, '')
  const parsed = useMemo(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty])
  const crumbs = useMemo(() => buildCrumbs(parsed, routeBase, rootPrefix), [parsed, routeBase, rootPrefix])
  // `zipEntry` would point `getUrl` at the wrapping zip — misleading.
  // Suppress there; entry extraction is the consumer's concern.
  const downloadable = parsed.kind !== 'dir' && parsed.kind !== 'zipEntry'
  const downloadHref = downloadable && typeof store.getUrl === 'function' ? store.getUrl(parsed.path) : null
  const downloadName = downloadable ? basename(parsed.path) : ''

  return (
    <div className={className} style={style}>
      {title && <h1 style={{ fontSize: '1.4em', margin: '0 0 0.3em' }}>{title}</h1>}
      <Breadcrumb
        crumbs={crumbs}
        rightSlot={downloadHref ? <DownloadIcon href={downloadHref} name={downloadName} /> : undefined}
      />
      <Body store={store} parsed={parsed} routeBase={routeBase} rootPrefix={rootPrefix} markdownRenderer={markdownRenderer} parquetRenderer={parquetRenderer} jsonRenderer={jsonRenderer} />
    </div>
  )
}

function Body({ store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, jsonRenderer }: { store: Store; parsed: Parsed; routeBase: string; rootPrefix: string; markdownRenderer?: MarkdownRenderer; parquetRenderer?: ParquetRenderer; jsonRenderer?: (s: string) => ReactNode }) {
  switch (parsed.kind) {
    case 'dir':
      return <DirListing store={store} prefix={parsed.prefix} routeBase={routeBase} rootPrefix={rootPrefix} markdownRenderer={markdownRenderer} />
    case 'text': {
      const ext = extOf(parsed.path)
      const isMd = ext === 'md' || ext === 'markdown'
      const isJson = ext === 'json'
      return (
        <TextViewer
          store={store}
          path={parsed.path}
          markdownRenderer={isMd ? markdownRenderer : undefined}
          jsonRenderer={isJson ? jsonRenderer : undefined}
        />
      )
    }
    case 'zip':
    case 'zipEntry':
      return <UnsupportedView label="Zip preview" />
    case 'parquet': {
      if (!parquetRenderer) return <UnsupportedView label="Parquet preview" />
      const Component = parquetRenderer
      return <Component store={store} path={parsed.path} />
    }
    case 'image':
      return <MediaViewer store={store} path={parsed.path} kind="image" />
    case 'video':
      return <MediaViewer store={store} path={parsed.path} kind="video" />
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

/** Compact download affordance shown right of the breadcrumbs for any
 *  non-dir view whose store exposes `getUrl(path)`. Anchor uses `download`
 *  so the browser streams the response — safe for arbitrarily large files. */
function DownloadIcon({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      download={name}
      title={`Download ${name}`}
      aria-label={`Download ${name}`}
      style={{ fontSize: '1.1em', textDecoration: 'none', lineHeight: 1 }}
    >
      ⬇
    </a>
  )
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
