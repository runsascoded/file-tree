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
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Store } from '../types'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { DirListing } from './DirListing'
import { MediaViewer } from './MediaViewer'
import { TextViewer } from './TextViewer'
import { ZipEntryList } from './ZipEntryList'
import { ZipEntryPreview } from './ZipEntryPreview'
import { type Parsed, parsePath, basename, keyToSplat, extOf, CODE_LANG } from './parsePath'

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
  /** Optional CSV/TSV renderer. When set, `.csv` and `.tsv` paths
   *  render via this component (typically a range-paginated sticky-
   *  header table) instead of plaintext `<pre>`. */
  csvRenderer?: ComponentType<{ store: Store; path: string; delimiter: string }>
  /** Optional notebook renderer. When set, `.ipynb` paths render via
   *  this component (typically a cell-by-cell view with rendered
   *  markdown cells + code outputs). */
  notebookRenderer?: ComponentType<{ store: Store; path: string }>
  /** Optional code-highlighting renderer. When set, TEXTY paths whose
   *  extension maps to a language in `CODE_LANG` (e.g. `.ts`, `.py`,
   *  `.go`) render via this fn (`(source, lang) => ReactNode`) instead
   *  of plaintext `<pre>`. */
  codeRenderer?: (source: string, lang: string) => ReactNode
  /** Optional per-viewer action factory. Called for every non-`dir`
   *  view; the returned node renders next to the download icon in the
   *  breadcrumb row. Use this for "open in SQL", "view raw", "share",
   *  etc. — actions specific to a consumer's surrounding app. */
  viewerActions?: (ctx: ViewerActionCtx) => ReactNode
}

export interface ViewerActionCtx {
  store: Store
  path: string
  kind: Parsed['kind']
  /** Set only when `kind === 'zipEntry'`: the entry name inside the zip. */
  entry?: string
}

export function FileTree({ store, routeBase, rootPrefix = '', extraTexty, title, className, style, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer, viewerActions }: FileTreeProps) {
  const location = useLocation()
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`)
  const splat = location.pathname.replace(baseRe, '')
  const parsed = useMemo(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty])
  const crumbs = useMemo(() => buildCrumbs(parsed, routeBase, rootPrefix), [parsed, routeBase, rootPrefix])
  // `zipEntry` would point `getUrl` at the wrapping zip — misleading.
  // Suppress there; entry extraction is the consumer's concern.
  const downloadable = parsed.kind !== 'dir' && parsed.kind !== 'zipEntry'
  const downloadName = downloadable ? basename(parsed.path) : ''
  const downloadHref = useDownloadHref(store, downloadable ? parsed.path : null)
  const ctx: ViewerActionCtx | null = parsed.kind === 'dir'
    ? null
    : {
        store,
        path: parsed.path,
        kind: parsed.kind,
        ...(parsed.kind === 'zipEntry' ? { entry: parsed.entry } : {}),
      }
  const actionsNode = ctx && viewerActions ? viewerActions(ctx) : null
  const right = (downloadHref || actionsNode)
    ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6em' }}>
        {actionsNode}
        {downloadHref && <DownloadIcon href={downloadHref} name={downloadName} />}
      </span>
    )
    : undefined

  return (
    <div className={className} style={style}>
      {title && <h1 style={{ fontSize: '1.4em', margin: '0 0 0.3em' }}>{title}</h1>}
      <Breadcrumb crumbs={crumbs} rightSlot={right} />
      <Body store={store} parsed={parsed} routeBase={routeBase} rootPrefix={rootPrefix} markdownRenderer={markdownRenderer} parquetRenderer={parquetRenderer} jsonRenderer={jsonRenderer} csvRenderer={csvRenderer} notebookRenderer={notebookRenderer} codeRenderer={codeRenderer} />
    </div>
  )
}

function Body({ store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer }: { store: Store; parsed: Parsed; routeBase: string; rootPrefix: string; markdownRenderer?: MarkdownRenderer; parquetRenderer?: ParquetRenderer; jsonRenderer?: (s: string) => ReactNode; csvRenderer?: ComponentType<{ store: Store; path: string; delimiter: string }>; notebookRenderer?: ComponentType<{ store: Store; path: string }>; codeRenderer?: (s: string, lang: string) => ReactNode }) {
  switch (parsed.kind) {
    case 'dir':
      return <DirListing store={store} prefix={parsed.prefix} routeBase={routeBase} rootPrefix={rootPrefix} markdownRenderer={markdownRenderer} />
    case 'text': {
      const ext = extOf(parsed.path)
      const isMd = ext === 'md' || ext === 'markdown'
      const isJson = ext === 'json'
      const isCsv = ext === 'csv' || ext === 'tsv'
      const lang = CODE_LANG[ext]
      if (isCsv && csvRenderer) {
        const Component = csvRenderer
        return <Component store={store} path={parsed.path} delimiter={ext === 'tsv' ? '\t' : ','} />
      }
      return (
        <TextViewer
          store={store}
          path={parsed.path}
          markdownRenderer={isMd ? markdownRenderer : undefined}
          jsonRenderer={isJson ? jsonRenderer : undefined}
          codeRenderer={!isMd && !isJson && lang ? codeRenderer : undefined}
          codeLang={lang}
        />
      )
    }
    case 'zip':
      return <ZipEntryList store={store} path={parsed.path} routeBase={routeBase} rootPrefix={rootPrefix} />
    case 'zipEntry':
      return <ZipEntryPreview store={store} path={parsed.path} entry={parsed.entry} markdownRenderer={markdownRenderer} />
    case 'parquet': {
      if (!parquetRenderer) return <UnsupportedView label="Parquet preview" />
      const Component = parquetRenderer
      return <Component store={store} path={parsed.path} />
    }
    case 'notebook': {
      if (!notebookRenderer) return <UnsupportedView label="Notebook preview" />
      const Component = notebookRenderer
      return <Component store={store} path={parsed.path} />
    }
    case 'image':
      return <MediaViewer store={store} path={parsed.path} kind="image" />
    case 'video':
      return <MediaViewer store={store} path={parsed.path} kind="video" />
    case 'audio':
      return <MediaViewer store={store} path={parsed.path} kind="audio" />
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

/** Resolve a downloadable URL for `path`, preferring async `getDownloadUrl`
 *  (presigning, redirects) over sync `getUrl` (static path). Returns `null`
 *  while the async URL is pending or unavailable. */
function useDownloadHref(store: Store, path: string | null): string | null {
  const syncHref = path != null && typeof store.getUrl === 'function' ? store.getUrl(path) : null
  const [asyncHref, setAsyncHref] = useState<string | null>(null)
  useEffect(() => {
    if (path == null || typeof store.getDownloadUrl !== 'function') {
      setAsyncHref(null)
      return
    }
    let cancelled = false
    setAsyncHref(null)
    store.getDownloadUrl(path).then(
      url => { if (!cancelled) setAsyncHref(url) },
      () => { if (!cancelled) setAsyncHref(null) },
    )
    return () => { cancelled = true }
  }, [store, path])
  if (path == null) return null
  if (typeof store.getDownloadUrl === 'function') return asyncHref
  return syncHref
}

/** Compact download affordance shown right of the breadcrumbs for any
 *  non-dir view whose store exposes a download URL. Anchor uses `download`
 *  so the browser streams the response — safe for arbitrarily large files.
 *  Inline SVG (Heroicons `arrow-down-tray`) — universally recognizable,
 *  uses `currentColor` so it inherits theme/link color. */
function DownloadIcon({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      download={name}
      title={`Download ${name}`}
      aria-label={`Download ${name}`}
      style={{ textDecoration: 'none', display: 'inline-block', lineHeight: 1, verticalAlign: 'middle' }}
    >
      <svg
        viewBox="0 0 24 24"
        width="1.15em"
        height="1.15em"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5" />
        <path d="M16.5 12 12 16.5 7.5 12" />
        <path d="M12 3v13.5" />
      </svg>
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
