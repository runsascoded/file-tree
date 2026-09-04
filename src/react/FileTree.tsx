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
import { cloneElement, isValidElement, useEffect, useMemo, useState, type ComponentProps, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Store } from '../types'
import type { TreeSource } from '../renderers/treeSource'
import { Breadcrumb, type Crumb, type CrumbRenderer } from './Breadcrumb'
import { DirListing, type CellRenderer } from './DirListing'
import { MediaViewer } from './MediaViewer'
import { PdfViewer } from './PdfViewer'
import { TextViewer } from './TextViewer'
import { ZipEntryList } from './ZipEntryList'
import { ZipEntryPreview } from './ZipEntryPreview'
import { type Parsed, parsePath, basename, keyToSplat, extOf, CODE_LANG } from './parsePath'
import { defaultUseState, type PersistedState } from './persistedState'
import { findViewer, RegistryViewer, type ViewerEntry } from './viewers'

export type { PersistedState } from './persistedState'

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
 *  + `parquetRead`. See `src/renderers/parquet.tsx` for a reference impl.
 *
 *  `usePersistedState` is injected by `<FileTree>` and threads its
 *  `usePersistedState` prop down — use it for any state the renderer
 *  wants to persist (e.g. `?page=N`). Renderers that don't care
 *  ignore the prop; likewise the `parquetOptions` spread onto every
 *  renderer, which a custom one is free to ignore. */
export interface ParquetRendererProps { store: Store; path: string; usePersistedState?: PersistedState }
export type ParquetRenderer = ComponentType<ParquetRendererProps>

/** Optional component that renders a `TreeSource` as a treemap.
 *  Pluggable so the lib doesn't bundle `@rdub/treemap` (an optional
 *  peer): `<TreeMapView>` from `@rdub/file-tree/renderers/treemap` is
 *  the reference impl. When provided *and* a `treeSource` is set, the
 *  directory view gains a list / map / split toggle; `path` is the
 *  current dir (tree-relative splat) so the map opens where the browser
 *  is. `height` lets the split view render a shorter map beneath the
 *  listing (the reference impl defaults to `70vh`). `highlightedPath` is
 *  the split view's cross-highlight ("scrub") input: the tree-relative
 *  path (no trailing slash) of the listing row under the cursor, so the
 *  map can emphasize the matching tile. `null` when nothing is hovered.
 *  `selectedPath` + `onSelectPath` are the persistent (click-to-pin)
 *  companion: the reference map toggles selection when a *file* tile is
 *  clicked (dir tiles still drill), emphasizing it more strongly than a
 *  hover, so the split listing can keep that row lit. */
export interface TreemapRendererProps {
  source: TreeSource
  path?: string
  rootLabel?: string
  height?: number | string
  highlightedPath?: string | null
  selectedPath?: string | null
  onSelectPath?: (path: string | null) => void
  /** The reverse brush edge (map → listing): the tree-relative path of the
   *  tile under the cursor, `null` when the cursor leaves the map. The split
   *  view wires it to the same hover state the listing drives, so hovering a
   *  tile lights its row just as hovering a row lights its tile. */
  onHoverPath?: (path: string | null) => void
}
export type TreemapRenderer = ComponentType<TreemapRendererProps>

/** Whatever `R` accepts *beyond* the three props `<FileTree>` supplies
 *  itself — i.e. exactly what's left to configure. Collapses to `never`
 *  for a renderer that takes nothing extra, so handing options to one
 *  that can't use them is a compile error rather than a bag of unknown
 *  props spread onto someone's component. */
export type ParquetOptionsOf<R extends ParquetRenderer> =
  keyof Omit<ComponentProps<R>, keyof ParquetRendererProps> extends never
    ? never
    : Omit<ComponentProps<R>, keyof ParquetRendererProps>

export interface FileTreeProps<R extends ParquetRenderer = ParquetRenderer> {
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
  parquetRenderer?: R
  /** Options forwarded to `parquetRenderer`, so customizing a cell
   *  doesn't require wrapping the viewer in a component of your own.
   *
   *  Prefer this over `makeParquetViewer` when a hook must close over
   *  something that changes — a format toggle, or a lookup fetched
   *  separately from the file. The renderer type stays stable across
   *  renders, so the table isn't remounted, whereas calling the factory
   *  inside render mints a new component type each pass. Styling that
   *  CSS can own (color, alignment, theme) belongs in CSS, not here.
   *  Options baked in by `makeParquetViewer` win over these. */
  parquetOptions?: ParquetOptionsOf<R>
  /** Optional recursive-size source for the directory listing. When set,
   *  directory rows show their *recursive* size (from a scan) instead of
   *  `—`. Root it at the same `rootPrefix` the tree is mounted under, so
   *  its node paths line up with the browser's splat space.
   *
   *  `walkTreeSource(store)` (from `@rdub/file-tree/renderers/walkTreeSource`)
   *  is the zero-infrastructure default — it walks the store live and is
   *  right for small/medium trees; large trees want a snapshot-backed
   *  source. See `specs/tree-sources-and-treemap.md`. */
  treeSource?: TreeSource
  /** Optional treemap renderer (see `TreemapRenderer`). When set
   *  alongside `treeSource`, the directory view gains a list↔map toggle
   *  and can render the current subtree as a treemap. Pluggable so the
   *  lib doesn't bundle `@rdub/treemap`; wire `<TreeMapView>` from
   *  `@rdub/file-tree/renderers/treemap` (lazy-loaded). */
  treemapRenderer?: TreemapRenderer
  /** Viewer registry — an ordered list of `{ id, match, load, options }`,
   *  consulted for every file before the built-in renderers, so a
   *  consumer can add formats (or override one) without the library
   *  knowing about them.
   *
   *  `load` is a dynamic import, so each viewer lands in its own chunk
   *  and a page only downloads the formats it opens — unlike the
   *  `*Renderer` props above, which are eagerly imported.
   *
   *  Define the array at module scope (or memoize it): entries are
   *  matched in order and resolved by `id`, but re-creating the array
   *  every render still re-runs `match` on every render. */
  viewers?: readonly ViewerEntry<never>[]
  /** Optional JSON renderer. When set, `.json` files render via this fn
   *  (typically a collapsible tree) instead of plaintext `<pre>`. The
   *  second arg is the resolved `usePersistedState` hook (forward it
   *  if you want URL-state for the JSON viewer's search / jq inputs;
   *  otherwise ignore). */
  jsonRenderer?: (source: string, usePersistedState?: PersistedState) => ReactNode
  /** Optional CSV/TSV renderer. When set, `.csv` and `.tsv` paths
   *  render via this component (typically a range-paginated sticky-
   *  header table) instead of plaintext `<pre>`. */
  csvRenderer?: ComponentType<{ store: Store; path: string; delimiter: string; usePersistedState?: PersistedState }>
  /** Optional notebook renderer. When set, `.ipynb` paths render via
   *  this component (typically a cell-by-cell view with rendered
   *  markdown cells + code outputs). */
  notebookRenderer?: ComponentType<{ store: Store; path: string; usePersistedState?: PersistedState }>
  /** Optional PDF renderer. When set, `.pdf` paths render via this
   *  component (e.g. a pdf.js viewer with text selection / search)
   *  instead of the built-in `<PdfViewer>`, which embeds the file in a
   *  native `<iframe>` — the browser's own PDF chrome, no peer needed. */
  pdfRenderer?: ComponentType<{ store: Store; path: string; usePersistedState?: PersistedState }>
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
  /** Optional per-cell render hook for the directory listing (see
   *  `CellRenderer`). Receives the node the listing would have rendered
   *  plus the row's entry/column, so consumers can decorate specific
   *  cells (e.g. append a human-readable name to a directory whose key
   *  encodes an ID) without reimplementing the default. */
  renderCell?: CellRenderer
  /** Optional per-crumb render hook for the breadcrumb (see
   *  `CrumbRenderer`) — same shape as `renderCell`, so the same
   *  decoration can be applied to path segments. */
  renderCrumb?: CrumbRenderer
  /** Placeholder for the directory-listing filter input. Default
   *  `"filter"`. Consumers can supply something more specific
   *  (e.g. `"filter (e.g. *.parquet)"` or project-specific nouns). */
  filterPlaceholder?: string
  /** Persisted-state hook. Default is in-memory `useState` (no URL
   *  state, lib's main entry doesn't import `use-prms`). Pass
   *  `useUrlPersistedState` from `@rdub/file-tree/url-state` to bind
   *  the dir-listing filter, parquet pagination, and JSON viewer
   *  search/jq inputs to URL query params. Bring-your-own (nuqs,
   *  custom `URLSearchParams` hook, etc.) by passing a function that
   *  matches the `PersistedState` signature. */
  usePersistedState?: PersistedState
}

export interface ViewerActionCtx {
  store: Store
  path: string
  kind: Parsed['kind']
  /** Set only when `kind === 'zipEntry'`: the entry name inside the zip. */
  entry?: string
}

export function FileTree<R extends ParquetRenderer = ParquetRenderer>({ store, routeBase, rootPrefix = '', extraTexty, title, className, style, markdownRenderer, parquetRenderer, parquetOptions, viewers, jsonRenderer, csvRenderer, notebookRenderer, pdfRenderer, codeRenderer, viewerActions, renderCell, renderCrumb, filterPlaceholder, usePersistedState, treeSource, treemapRenderer }: FileTreeProps<R>) {
  const location = useLocation()
  const baseRe = new RegExp(`^${routeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`)
  const splat = location.pathname.replace(baseRe, '')
  const parsed = useMemo(() => parsePath(splat, { rootPrefix, extraTexty }), [splat, rootPrefix, extraTexty])
  const crumbs = useMemo(() => buildCrumbs(parsed, routeBase, rootPrefix, store.describe?.() ?? 'root'), [parsed, routeBase, rootPrefix])
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
      <Breadcrumb crumbs={crumbs} rightSlot={right} renderCrumb={renderCrumb} />
      <Body store={store} parsed={parsed} routeBase={routeBase} rootPrefix={rootPrefix} markdownRenderer={markdownRenderer} parquetRenderer={parquetRenderer} parquetOptions={parquetOptions} viewers={viewers} jsonRenderer={jsonRenderer} csvRenderer={csvRenderer} notebookRenderer={notebookRenderer} pdfRenderer={pdfRenderer} codeRenderer={codeRenderer} renderCell={renderCell} filterPlaceholder={filterPlaceholder} usePersistedState={usePersistedState} treeSource={treeSource} treemapRenderer={treemapRenderer} />
    </div>
  )
}

function Body({ store, parsed, routeBase, rootPrefix, markdownRenderer, parquetRenderer, parquetOptions, viewers, jsonRenderer, csvRenderer, notebookRenderer, pdfRenderer, codeRenderer, renderCell, filterPlaceholder, usePersistedState, treeSource, treemapRenderer }: { store: Store; parsed: Parsed; routeBase: string; rootPrefix: string; markdownRenderer?: MarkdownRenderer; parquetRenderer?: ParquetRenderer; parquetOptions?: Record<string, unknown>; viewers?: readonly ViewerEntry<never>[]; jsonRenderer?: (s: string, ups?: PersistedState) => ReactNode; csvRenderer?: ComponentType<{ store: Store; path: string; delimiter: string; usePersistedState?: PersistedState }>; notebookRenderer?: ComponentType<{ store: Store; path: string; usePersistedState?: PersistedState }>; pdfRenderer?: ComponentType<{ store: Store; path: string; usePersistedState?: PersistedState }>; codeRenderer?: (s: string, lang: string) => ReactNode; renderCell?: CellRenderer; filterPlaceholder?: string; usePersistedState?: PersistedState; treeSource?: TreeSource; treemapRenderer?: TreemapRenderer }) {
  // The registry wins over the built-ins: a consumer registering a
  // `.parquet` viewer means they want theirs, not the prop's. `dir` and
  // `zipEntry` are excluded — the first isn't a file, and the second is
  // a path *inside* one, which the container work will handle properly
  // (`specs/viewer-registry.md`).
  if (parsed.kind !== 'dir' && parsed.kind !== 'zipEntry') {
    const entry = findViewer(viewers, parsed.path)
    if (entry) return <RegistryViewer entry={entry} store={store} path={parsed.path} usePersistedState={usePersistedState} />
  }

  switch (parsed.kind) {
    case 'dir': {
      const listing = <DirListing store={store} prefix={parsed.prefix} routeBase={routeBase} rootPrefix={rootPrefix} markdownRenderer={markdownRenderer} renderCell={renderCell} filterPlaceholder={filterPlaceholder} usePersistedState={usePersistedState} treeSource={treeSource} />
      if (!treeSource || !treemapRenderer) return listing
      return (
        <DirView
          treeSource={treeSource}
          treemapRenderer={treemapRenderer}
          prefix={parsed.prefix}
          rootPrefix={rootPrefix}
          rootLabel={store.describe?.() ?? 'root'}
          usePersistedState={usePersistedState}
          listing={listing}
        />
      )
    }
    case 'text': {
      const ext = extOf(parsed.path)
      const isMd = ext === 'md' || ext === 'markdown'
      const isJson = ext === 'json'
      const isCsv = ext === 'csv' || ext === 'tsv'
      const lang = CODE_LANG[ext]
      if (isCsv && csvRenderer) {
        const Component = csvRenderer
        return <Component store={store} path={parsed.path} delimiter={ext === 'tsv' ? '\t' : ','} usePersistedState={usePersistedState} />
      }
      return (
        <TextViewer
          store={store}
          path={parsed.path}
          markdownRenderer={isMd ? markdownRenderer : undefined}
          jsonRenderer={isJson ? jsonRenderer : undefined}
          codeRenderer={!isMd && !isJson && lang ? codeRenderer : undefined}
          codeLang={lang}
          usePersistedState={usePersistedState}
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
      return <Component store={store} path={parsed.path} usePersistedState={usePersistedState} {...parquetOptions} />
    }
    case 'notebook': {
      if (!notebookRenderer) return <UnsupportedView label="Notebook preview" />
      const Component = notebookRenderer
      return <Component store={store} path={parsed.path} usePersistedState={usePersistedState} />
    }
    case 'image':
      return <MediaViewer store={store} path={parsed.path} kind="image" />
    case 'video':
      return <MediaViewer store={store} path={parsed.path} kind="video" />
    case 'audio':
      return <MediaViewer store={store} path={parsed.path} kind="audio" />
    case 'pdf': {
      if (pdfRenderer) {
        const Component = pdfRenderer
        return <Component store={store} path={parsed.path} usePersistedState={usePersistedState} />
      }
      return <PdfViewer store={store} path={parsed.path} />
    }
    case 'binary':
      return (
        <div style={{ opacity: 0.7 }}>
          Preview not supported for this file type.
        </div>
      )
  }
}

/** The three view modes offered when a treemap is wired: `list` (the
 *  listing alone), `tree` (the map alone), `split` (listing above a
 *  shorter map, both off the one shared source). */
type DirViewMode = 'list' | 'tree' | 'split'

/** The directory body when both a `treeSource` and a `treemapRenderer`
 *  are wired: a list / map / split toggle over one shared source.
 *  `view` persists via the same `usePersistedState` the rest of the
 *  browser uses, so `useUrlPersistedState` puts it in `?view=tree` /
 *  `?view=split`. The listing is passed in already-built; the map's own
 *  drill state is cheap to rebuild on toggle, so `list`/`tree` mount
 *  only the selected view, while `split` mounts both. */
function DirView({ treeSource, treemapRenderer: Map, prefix, rootPrefix, rootLabel, usePersistedState, listing }: {
  treeSource: TreeSource
  treemapRenderer: TreemapRenderer
  prefix: string
  rootPrefix: string
  rootLabel: string
  usePersistedState?: PersistedState
  listing: ReactNode
}) {
  const use = usePersistedState ?? defaultUseState
  const [stored, setView] = use('view', 'split' as DirViewMode)
  const view: DirViewMode = stored === 'tree' || stored === 'split' ? stored : 'list'
  const treePath = keyToSplat(prefix, rootPrefix).replace(/\/+$/, '')
  // Cross-highlight ("scrub") state, both tree-relative paths. `hovered`
  // is transient (a listing row under the cursor); `selected` is
  // persistent (a file tile clicked in the map). Both flow to the map
  // (emphasize that tile) and to the listing (light that row); neither is
  // persisted — `selected` resets when the viewed directory changes.
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { setSelected(null); setHovered(null) }, [treePath])
  // `onHover` (the map → listing reverse brush) is wired only in split view,
  // where a listing row is there to light up. In tree-only view the map keeps
  // its own built-in hover affordance; feeding hover back as `highlightedPath`
  // would just have a tile ring itself, doubling up.
  const map = (height?: string, onHover?: (p: string | null) => void) =>
    <Map source={treeSource} path={treePath} rootLabel={rootLabel} height={height}
      highlightedPath={hovered} selectedPath={selected} onSelectPath={setSelected} onHoverPath={onHover} />
  // Inject scrub props into the already-built listing element (Body owns
  // its construction; only split view needs the wiring, so clone rather
  // than thread the props through every mode).
  const scrubListing = isValidElement(listing)
    ? cloneElement(
        listing as ReactElement<{ highlightedPath?: string | null; selectedPath?: string | null; onHoverPath?: (p: string | null) => void }>,
        { highlightedPath: hovered, selectedPath: selected, onHoverPath: setHovered },
      )
    : listing
  return (
    <div>
      <ViewToggle view={view} setView={setView} />
      {view === 'tree' && map()}
      {view === 'list' && listing}
      {view === 'split' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
          {scrubListing}
          {map('45vh', setHovered)}
        </div>
      )}
    </div>
  )
}

/** Three-state segmented toggle (list / treemap / split). Inline SVGs,
 *  `currentColor` so they track the theme. */
function ViewToggle({ view, setView }: { view: DirViewMode; setView: (v: DirViewMode) => void }) {
  const btn = (v: DirViewMode, label: string, path: ReactNode) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '0.15em 0.45em',
        background: view === v ? 'var(--ft-toggle-on, #e0e0e0)' : 'transparent',
        border: '1px solid var(--ft-border, #ccc)', cursor: 'pointer', color: 'inherit',
        lineHeight: 1,
      }}
    >
      <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    </button>
  )
  return (
    <div style={{ display: 'inline-flex', gap: 0, marginBottom: '0.5em' }} role="group" aria-label="View">
      {btn('list', 'List view', <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>)}
      {btn('tree', 'Treemap view', <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>)}
      {btn('split', 'Split view (list + map)', <><path d="M4 6h16" /><path d="M4 9h16" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>)}
    </div>
  )
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

function buildCrumbs(parsed: Parsed, routeBase: string, rootPrefix: string, rootLabel: string): Crumb[] {
  const path = parsed.kind === 'dir' ? parsed.prefix : parsed.kind === 'zipEntry' ? `${parsed.path}!/${parsed.entry}` : parsed.path
  const splat = keyToSplat(path, rootPrefix)
  const parts = splat.split('/').filter(p => p.length > 0)
  const baseTrimmed = routeBase.replace(/\/+$/, '')
  const crumbs: Crumb[] = [{ label: rootLabel, to: `${baseTrimmed}/`, path: rootPrefix }]
  let cum = ''
  for (const p of parts) {
    cum = cum ? `${cum}/${p}` : p
    // Every crumb but a file leaf addresses a directory, so its store key
    // carries a trailing slash (`to` only gets one for the current dir).
    const isFileLeaf = parsed.kind !== 'dir' && cum === splat
    crumbs.push({
      label: basename(p),
      to: `${baseTrimmed}/${cum}${parsed.kind === 'dir' && cum === splat ? '/' : ''}`,
      path: `${rootPrefix}${cum}${isFileLeaf ? '' : '/'}`,
    })
  }
  return crumbs
}
