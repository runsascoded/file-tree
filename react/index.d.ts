import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, ComponentType, ComponentProps } from 'react';
import { M as MarkdownCtx } from '../markdownLinks-CyvzSz5A.js';
export { i as isPlainClick, m as markdownCtx, r as resolveTreeHref, a as resolveTreeKey } from '../markdownLinks-CyvzSz5A.js';
import { Entry, Store, ZipEntriesResult, GetResult } from '../index.js';
import { TreeSource } from '../renderers/treeSource.js';
export { ChildrenRequest, DiffLevel, DiffRequest, ScanJob, ScanRequest, Snapshot, SnapshotNotFoundError, TreeDiffNode, TreeLevel, TreeNode, TreeSourceCapabilities, TreeTooLargeError, diffLevels, diffNode, diffStatus } from '../renderers/treeSource.js';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';
import { a as Parsed, C as Codec } from '../parsePath-D2tUNIiO.js';
export { A as AUDIO, b as CODECS, c as CODE_LANG, I as IMAGE, J as JSONL, P as ParsePathOptions, T as TEXTY, d as TEXT_NAMES, V as VIDEO, e as basename, f as extOf, k as keyToSplat, p as parseFileKey, g as parsePath, t as tarCodec } from '../parsePath-D2tUNIiO.js';
export { WalkTreeSourceOptions, walkTreeSource } from '../renderers/walkTreeSource.js';
export { DiskTreeTreeSourceOptions, diskTreeTreeSource } from '../renderers/diskTreeTreeSource.js';
export { HttpTreeSourceOptions, httpTreeSource } from '../renderers/httpTreeSource.js';
export { SnapshotManifest, SnapshotManifestEntry, SnapshotTreeSourceOptions } from '../renderers/snapshotTreeSource.js';
import 'hyparquet';

interface Crumb {
    label: ReactNode;
    /** Route (router-relative) for tree crumbs; a plain `href` for the
     *  `home` crumb, which usually leaves the router's `routeBase`. */
    to: string;
    /** `'home'` marks the host-site link `<FileTree home>` prepends before
     *  the root crumb; absent for tree crumbs. */
    kind?: 'home';
    /** Store key this crumb addresses (directories include a trailing
     *  slash). Populated by `<FileTree>`; optional so hand-built
     *  `Crumb[]`s stay valid. */
    path?: string;
}
interface CrumbCtx {
    crumb: Crumb;
    index: number;
    /** The current location — rendered as plain text, not a link. */
    isLast: boolean;
    /** What `<Breadcrumb>` would have rendered for this crumb. */
    defaultNode: ReactNode;
}
/** Per-crumb render hook, mirroring `CellRenderer` — return
 *  `ctx.defaultNode` for crumbs you don't want to touch. */
type CrumbRenderer = (ctx: CrumbCtx) => ReactNode;
declare function Breadcrumb({ crumbs, separator, rightSlot, renderCrumb }: {
    crumbs: Crumb[];
    separator?: string;
    rightSlot?: ReactNode;
    renderCrumb?: CrumbRenderer;
}): react_jsx_runtime.JSX.Element | null;

/** Columns rendered by the default `<DirListing>` table. */
type CellColumn = 'name' | 'size' | 'modified';
interface CellCtx {
    /** The listing entry this row is for. */
    entry: Entry;
    column: CellColumn;
    /** Store-relative prefix of the directory being listed. */
    prefix: string;
    /** Route this row links to (`routeBase` + splat). */
    href: string;
    /** What `<DirListing>` would have rendered for this cell. Decorating
     *  callers wrap it; overriding callers ignore it. */
    defaultNode: ReactNode;
}
/** Per-cell render hook. Called for every cell of every row; return
 *  `ctx.defaultNode` for the cells you don't care about:
 *
 *    renderCell={({ entry, column, defaultNode }) =>
 *      column === 'name' && isDevice(entry.key)
 *        ? <>{defaultNode} <em>{deviceName(entry.key)}</em></>
 *        : defaultNode}
 *
 *  Deliberately unopinionated about placement/styling — the library
 *  hands back the node it would have rendered and gets out of the way. */
type CellRenderer = (ctx: CellCtx) => ReactNode;
interface DirListingProps {
    store: Store;
    /** Store-relative prefix (incl. trailing slash). */
    prefix: string;
    /** Route base for sub-links. E.g. `/files`. */
    routeBase: string;
    /** Optional root prefix for splat conversion (matches `<FileTree rootPrefix>`). */
    rootPrefix?: string;
    /** Optional filter string (controlled). If omitted, an internal text input
     *  is rendered. */
    q?: string;
    setQ?: (q: string) => void;
    /** Placeholder for the internal filter input. Default `"filter"`. */
    filterPlaceholder?: string;
    /** Persisted-state hook for the internal filter `q`. Default is
     *  `useState` (in-memory). Pass `useUrlPersistedState` (from
     *  `@rdub/file-tree/url-state`) to bind `q` to `?q=…`. Ignored when
     *  the caller controls `q`/`setQ` directly. */
    usePersistedState?: PersistedState;
    /** When set + a README is in the listing (`README.md`, `.markdown`,
     *  `.rst`, `.txt` or bare `README`, case-insensitive), it's fetched and
     *  rendered below the table: markdown via this fn, the rest as text. */
    markdownRenderer?: MarkdownRenderer;
    /** Optional per-cell render hook (see `CellRenderer`). */
    renderCell?: CellRenderer;
    /** When set, directory rows show their *recursive* size (instead of
     *  `—`): the listing calls `treeSource.children(prefix)` once and reads
     *  each child directory's rollup. A `TreeTooLargeError` (or any
     *  failure) is swallowed — the `—` stays, so an oversized tree degrades
     *  to today's behaviour rather than erroring. File sizes still come
     *  from the store's own listing. */
    treeSource?: TreeSource;
    /** Cross-highlight ("scrub") callback: fired with a row's tree-relative
     *  path (no trailing slash) on hover-in, `null` on hover-out. `<FileTree>`
     *  wires this in split view so hovering a row can emphasize the matching
     *  treemap tile. Optional — omitted outside split view. */
    onHoverPath?: (path: string | null) => void;
    /** The path to highlight (from the shared scrub state): the row whose
     *  tree-relative path equals this gets an emphasized background. `null`
     *  for none. Optional. */
    highlightedPath?: string | null;
    /** The persistently-selected path (a pinned file tile in the split
     *  map): its row gets a distinct, persistent background. `null` for
     *  none. A hover (`highlightedPath`) takes visual priority. Optional. */
    selectedPath?: string | null;
}
declare function DirListing({ store, prefix, routeBase, rootPrefix, q: qExternal, setQ: setQExternal, filterPlaceholder, usePersistedState, markdownRenderer, renderCell, treeSource, onHoverPath, highlightedPath, selectedPath }: DirListingProps): react_jsx_runtime.JSX.Element;

/** What a viewer is handed. Every viewer takes these; anything else it
 *  needs comes from its entry's `options`. */
interface ViewerProps {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
}
/** What `match` gets to decide on. Deliberately a predicate rather than
 *  an extension list: plenty of real dispatch isn't extension-shaped —
 *  `manifest.jsonl` wanting a different viewer than other `.jsonl`,
 *  `part-*.parquet` under a directory that should render as one logical
 *  table, or a key with no extension at all. */
interface ViewerMatchCtx {
    /** Store key of the file. */
    path: string;
    /** Lower-cased extension, or `''` when there isn't one. */
    ext: string;
}
interface ViewerEntry<O = Record<string, unknown>> {
    /** Stable identity for the lazy component this entry resolves to.
     *
     *  Required, and it must be stable across renders: `React.lazy`
     *  mints a component *type*, and a new type each render remounts the
     *  viewer (dropping whatever it had cached). Keying the cache on a
     *  string rather than the entry object means an inline `viewers={[…]}`
     *  array still behaves — which is the mistake everyone makes once. */
    id: string;
    /** First match wins, so array order is the consumer's priority. */
    match: (ctx: ViewerMatchCtx) => boolean;
    /** Dynamic import of the viewer's module. Nothing is fetched until a
     *  matching path is opened. */
    load: () => Promise<{
        default: ComponentType<ViewerProps & O>;
    }>;
    /** Forwarded to the viewer as props. */
    options?: O;
}
declare function findViewer(viewers: readonly ViewerEntry<never>[] | undefined, path: string): ViewerEntry<never> | undefined;
declare function RegistryViewer({ entry, store, path, usePersistedState, fallback }: {
    entry: ViewerEntry<never>;
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
    fallback?: ReactNode;
}): react_jsx_runtime.JSX.Element;

/** Optional renderer that converts a markdown source string into a
 *  React node. Pluggable so the lib doesn't bundle a markdown library;
 *  consumers wire `react-markdown` (or any equivalent). When provided,
 *  `<TextViewer>` uses it for `.md`/`.markdown` files and
 *  `<DirListing>` uses it for default-README rendering below the
 *  directory table.
 *
 *  `ctx` (absent outside a tree, e.g. a zip entry) resolves relative links
 *  and images against the file's place in the tree; see `MarkdownCtx`.
 *  `renderMarkdown` applies it; a custom renderer may ignore it. */
type MarkdownRenderer = (source: string, ctx?: MarkdownCtx) => ReactNode;
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
interface ParquetRendererProps {
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
}
type ParquetRenderer = ComponentType<ParquetRendererProps>;
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
interface TreemapRendererProps {
    source: TreeSource;
    path?: string;
    rootLabel?: string;
    height?: number | string;
    highlightedPath?: string | null;
    selectedPath?: string | null;
    onSelectPath?: (path: string | null) => void;
    /** Navigate the browser to a directory tile's tree-relative path — the
     *  reference map calls this when a *dir* tile is clicked, so drilling the
     *  map moves the URL (and with it the listing, breadcrumb, and the map's
     *  own root) in lockstep rather than drilling the map alone. */
    onNavigate?: (path: string) => void;
    /** The reverse brush edge (map → listing): the tree-relative path of the
     *  tile under the cursor, `null` when the cursor leaves the map. The split
     *  view wires it to the same hover state the listing drives, so hovering a
     *  tile lights its row just as hovering a row lights its tile. */
    onHoverPath?: (path: string | null) => void;
}
type TreemapRenderer = ComponentType<TreemapRendererProps>;
/** Whatever `R` accepts *beyond* the three props `<FileTree>` supplies
 *  itself — i.e. exactly what's left to configure. Collapses to `never`
 *  for a renderer that takes nothing extra, so handing options to one
 *  that can't use them is a compile error rather than a bag of unknown
 *  props spread onto someone's component. */
type ParquetOptionsOf<R extends ParquetRenderer> = keyof Omit<ComponentProps<R>, keyof ParquetRendererProps> extends never ? never : Omit<ComponentProps<R>, keyof ParquetRendererProps>;
interface FileTreeProps<R extends ParquetRenderer = ParquetRenderer> {
    store: Store;
    /** Path the browser is mounted under, e.g. `/files`. */
    routeBase: string;
    /** Optional store-key prefix prepended to the URL splat (e.g. `'raw/'`).
     *  Use this when the route exposes only a sub-tree of the store. */
    rootPrefix?: string;
    /** Additional file extensions to render as text. */
    extraTexty?: string[];
    /** Optional title to show above the breadcrumb (text, or e.g. a logo). */
    title?: ReactNode;
    /** Make `title` a link (inherits color, underlines on hover) — typically
     *  the host site's root, or the same `href` as `home`. */
    titleHref?: string;
    /** Link back to the site this tree is mounted in, rendered as the first
     *  breadcrumb segment before the root: `Site / root / dir / file`. A plain
     *  `<a href>` (it usually leaves `routeBase`), styled like the other
     *  crumbs. `renderCrumb` sees it with `crumb.kind === 'home'`. */
    home?: {
        href: string;
        label: ReactNode;
    };
    /** Optional className for the outer wrapper. */
    className?: string;
    /** Optional inline style for the outer wrapper. */
    style?: React.CSSProperties;
    /** Optional markdown renderer (see `MarkdownRenderer`). When set, `.md`
     *  files render as rich markdown (instead of plaintext `<pre>`) and a
     *  directory's or archive's README (`README.md`, `.rst`, `.txt`, bare
     *  `README`, …; see `pickReadme`) is rendered below its listing. */
    markdownRenderer?: MarkdownRenderer;
    /** Optional parquet renderer (see `ParquetRenderer`). When set,
     *  `.parquet`/`.pqt` paths render via this component (typically a
     *  hyparquet-backed table). */
    parquetRenderer?: R;
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
    parquetOptions?: ParquetOptionsOf<R>;
    /** Optional recursive-size source for the directory listing. When set,
     *  directory rows show their *recursive* size (from a scan) instead of
     *  `—`. Root it at the same `rootPrefix` the tree is mounted under, so
     *  its node paths line up with the browser's splat space.
     *
     *  `walkTreeSource(store)` (from `@rdub/file-tree/renderers/walkTreeSource`)
     *  is the zero-infrastructure default — it walks the store live and is
     *  right for small/medium trees; large trees want a snapshot-backed
     *  source. See `specs/tree-sources-and-treemap.md`. */
    treeSource?: TreeSource;
    /** Optional treemap renderer (see `TreemapRenderer`). When set
     *  alongside `treeSource`, the directory view gains a list↔map toggle
     *  and can render the current subtree as a treemap. Pluggable so the
     *  lib doesn't bundle `@rdub/treemap`; wire `<TreeMapView>` from
     *  `@rdub/file-tree/renderers/treemap` (lazy-loaded). */
    treemapRenderer?: TreemapRenderer;
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
    viewers?: readonly ViewerEntry<never>[];
    /** Optional JSON renderer. When set, `.json` files render via this fn
     *  (typically a collapsible tree) instead of plaintext `<pre>`. The
     *  second arg is the resolved `usePersistedState` hook (forward it
     *  if you want URL-state for the JSON viewer's search / jq inputs;
     *  otherwise ignore). */
    jsonRenderer?: (source: string, usePersistedState?: PersistedState) => ReactNode;
    /** Optional CSV/TSV renderer. When set, `.csv` and `.tsv` paths
     *  render via this component (typically a range-paginated sticky-
     *  header table) instead of plaintext `<pre>`. */
    csvRenderer?: ComponentType<{
        store: Store;
        path: string;
        delimiter: string;
        usePersistedState?: PersistedState;
    }>;
    /** Optional JSONL renderer. When set, `.jsonl` / `.ndjson` paths
     *  (including `.jsonl.gz` and members of a tarball) render via this
     *  component (typically one record per table row, as `JsonlViewer`
     *  from `@rdub/file-tree/renderers/jsonl`) instead of plaintext. */
    jsonlRenderer?: ComponentType<{
        store: Store;
        path: string;
        usePersistedState?: PersistedState;
    }>;
    /** Optional notebook renderer. When set, `.ipynb` paths render via
     *  this component (typically a cell-by-cell view with rendered
     *  markdown cells + code outputs). */
    notebookRenderer?: ComponentType<{
        store: Store;
        path: string;
        usePersistedState?: PersistedState;
    }>;
    /** Optional PDF renderer. When set, `.pdf` paths render via this
     *  component (e.g. a pdf.js viewer with text selection / search)
     *  instead of the built-in `<PdfViewer>`, which embeds the file in a
     *  native `<iframe>` — the browser's own PDF chrome, no peer needed. */
    pdfRenderer?: ComponentType<{
        store: Store;
        path: string;
        usePersistedState?: PersistedState;
    }>;
    /** Optional code-highlighting renderer. When set, TEXTY paths whose
     *  extension maps to a language in `CODE_LANG` (e.g. `.ts`, `.py`,
     *  `.go`) render via this fn (`(source, lang) => ReactNode`) instead
     *  of plaintext `<pre>`. */
    codeRenderer?: (source: string, lang: string) => ReactNode;
    /** Optional per-viewer action factory. Called for every non-`dir`
     *  view; the returned node renders next to the download icon in the
     *  breadcrumb row. Use this for "open in SQL", "view raw", "share",
     *  etc. — actions specific to a consumer's surrounding app. */
    viewerActions?: (ctx: ViewerActionCtx) => ReactNode;
    /** Optional per-cell render hook for the directory listing (see
     *  `CellRenderer`). Receives the node the listing would have rendered
     *  plus the row's entry/column, so consumers can decorate specific
     *  cells (e.g. append a human-readable name to a directory whose key
     *  encodes an ID) without reimplementing the default. */
    renderCell?: CellRenderer;
    /** Optional per-crumb render hook for the breadcrumb (see
     *  `CrumbRenderer`) — same shape as `renderCell`, so the same
     *  decoration can be applied to path segments. */
    renderCrumb?: CrumbRenderer;
    /** Placeholder for the directory-listing filter input. Default
     *  `"filter"`. Consumers can supply something more specific
     *  (e.g. `"filter (e.g. *.parquet)"` or project-specific nouns). */
    filterPlaceholder?: string;
    /** Persisted-state hook. Default is in-memory `useState` (no URL
     *  state, lib's main entry doesn't import `use-prms`). Pass
     *  `useUrlPersistedState` from `@rdub/file-tree/url-state` to bind
     *  the dir-listing filter, parquet pagination, and JSON viewer
     *  search/jq inputs to URL query params. Bring-your-own (nuqs,
     *  custom `URLSearchParams` hook, etc.) by passing a function that
     *  matches the `PersistedState` signature. */
    usePersistedState?: PersistedState;
}
interface ViewerActionCtx {
    store: Store;
    path: string;
    kind: Parsed['kind'];
    /** Set only when `kind` is `'zipEntry'` / `'tarEntry'`: the member name inside the archive. */
    entry?: string;
}
declare function FileTree<R extends ParquetRenderer = ParquetRenderer>({ store, routeBase, rootPrefix, extraTexty, title, titleHref, home, className, style, markdownRenderer, parquetRenderer, parquetOptions, viewers, jsonRenderer, jsonlRenderer, csvRenderer, notebookRenderer, pdfRenderer, codeRenderer, viewerActions, renderCell, renderCrumb, filterPlaceholder, usePersistedState, treeSource, treemapRenderer }: FileTreeProps<R>): react_jsx_runtime.JSX.Element;

/** Adapter from `Store` to hyparquet's `AsyncBuffer` shape
 *  (`{ byteLength: number; slice(start, end?): Promise<ArrayBuffer> }`).
 *  Exported so consumers wiring `parquetRenderer` can feed any backend
 *  (R2, HTTP, S3, …) to hyparquet without knowing the underlying URL.
 *
 *  Usage:
 *      import { asyncBufferFromStore } from '@rdub/file-tree/react'
 *      import { parquetMetadataAsync } from 'hyparquet'
 *
 *      const file = await asyncBufferFromStore(store, path)
 *      const meta = await parquetMetadataAsync(file)
 */

interface AsyncBuffer {
    byteLength: number;
    slice(start: number, end?: number): Promise<ArrayBuffer>;
}
declare function asyncBufferFromStore(store: Store, path: string): Promise<AsyncBuffer>;

interface TextViewerProps {
    store: Store;
    path: string;
    /** When provided, render the bytes as rich markdown via this fn
     *  instead of plaintext `<pre>`. Caller decides which extensions
     *  qualify (typically `.md`/`.markdown`). */
    markdownRenderer?: (source: string) => ReactNode;
    /** When provided, render the bytes as a JSON tree via this fn
     *  instead of plaintext `<pre>`. Caller decides which extensions
     *  qualify (typically `.json`). The second arg is the resolved
     *  `usePersistedState` hook — forward it to enable URL-state for
     *  the JSON viewer's search / jq inputs. */
    jsonRenderer?: (source: string, usePersistedState?: PersistedState) => ReactNode;
    /** When provided, render the bytes as syntax-highlighted code via
     *  this fn (`(source, lang) => ReactNode`). Caller decides which
     *  extensions qualify + supplies the `lang` hint. */
    codeRenderer?: (source: string, lang: string) => ReactNode;
    /** Language hint passed to `codeRenderer`. */
    codeLang?: string;
    /** Persisted-state hook threaded down from `<FileTree>` (forwarded
     *  to `jsonRenderer` for URL-state binding). */
    usePersistedState?: PersistedState;
}
declare function TextViewer({ store, path, markdownRenderer, jsonRenderer, codeRenderer, codeLang, usePersistedState }: TextViewerProps): react_jsx_runtime.JSX.Element;

interface ZipEntryListProps {
    store: Store;
    path: string;
    /** Route base for the surrounding `<FileTree>` mount. */
    routeBase: string;
    /** Root prefix, mirroring `<FileTree rootPrefix>`. */
    rootPrefix?: string;
    /** When set, the archive's README (if any) renders below the listing. */
    markdownRenderer?: MarkdownRenderer;
}
declare function ZipEntryList({ store, path, routeBase, rootPrefix, markdownRenderer }: ZipEntryListProps): react_jsx_runtime.JSX.Element;

interface ZipEntryPreviewProps {
    store: Store;
    path: string;
    entry: string;
    /** Optional markdown renderer applied to `.md` / `.markdown` entries. */
    markdownRenderer?: (source: string) => ReactNode;
}
declare function ZipEntryPreview({ store, path, entry, markdownRenderer }: ZipEntryPreviewProps): react_jsx_runtime.JSX.Element;

/** Client-side zip browsing helpers — used by the lib's default
 *  `<ZipEntryList>` / `<ZipEntryPreview>` when the underlying `Store`
 *  doesn't provide `getZipEntries` / `getZipEntry` overrides.
 *
 *  Reads only the central-directory trailer (~64 KB) for listing and
 *  the per-entry local-header + compressed data for previewing. Inflate
 *  uses the platform's `DecompressionStream('deflate-raw')` (Chrome
 *  103+, Firefox 113+, Safari 16.4+, modern Workers) — no JS deflate
 *  dependency.
 *
 *  Zip64 is intentionally not supported here; archives ≥4 GB (or with
 *  ≥65535 entries) need a server-side fast path via `Store.getZipEntries`.
 */

/** Read the central directory of a zip and return all entries.
 *  Uses two range reads: one for the EOCD trailer and one for the
 *  central directory block it points at. */
declare function readZipEntries(store: Store, path: string): Promise<ZipEntriesResult>;
/** Fetch and inflate one entry's bytes. Honors `opts.max` by truncating
 *  the inflate stream once that many output bytes are produced. */
declare function readZipEntry(store: Store, path: string, entryName: string, opts?: {
    max?: number;
}): Promise<GetResult>;

interface TarEntryListProps {
    store: Store;
    path: string;
    codec?: Codec;
    routeBase: string;
    rootPrefix?: string;
    /** When set, the archive's README (if any) renders below the listing. */
    markdownRenderer?: MarkdownRenderer;
}
declare function TarEntryList({ store, path, codec, routeBase, rootPrefix, markdownRenderer }: TarEntryListProps): react_jsx_runtime.JSX.Element;

/** Which file to render as a listing's README, GitHub-style: any basename
 *  `README` (case-insensitive) with a markdown or plain-text extension, or
 *  none. Markdown renders through the `markdownRenderer`; the rest render
 *  as preformatted text (there's no reStructuredText renderer). */
type ReadmeFormat = 'markdown' | 'text';
declare function readmeFormat(name: string): ReadmeFormat;
/** The preferred README among `names` sitting directly in `dir` (`''` or a
 *  `/`-terminated prefix), or `null`. Directory names (trailing `/`) never
 *  match. */
declare function pickReadme(names: readonly string[], dir?: string): string | null;
/** An archive's README: one at the archive root, else — when every member
 *  sits under a single top-level directory, as most tarballs wrap theirs
 *  (`foo-1.2.3/…`) — one directly in that directory. */
declare function pickArchiveReadme(names: readonly string[]): string | null;

/** Client-side tarball reading: `.tar`, `.tar.gz` / `.tgz`, `.tar.zst`.
 *
 *  A tar has no index — headers are interleaved with member data, and a
 *  compressed tar can't be range-read at all — so unlike zip this reads
 *  the archive whole (capped) and walks it. The parsed archive is cached
 *  per store + path, so going from the listing to a member and back
 *  doesn't refetch. */

type TarEntryType = 'file' | 'dir' | 'symlink' | 'other';
interface TarEntry {
    /** Path inside the archive; directories end in `/`. */
    name: string;
    size: number;
    type: TarEntryType;
    /** ISO-8601, from the header's mtime. */
    lastModified?: string;
    /** Symlink target. */
    linkName?: string;
    /** Offset of the member's data in the (decompressed) archive. */
    offset: number;
}
interface TarArchive {
    entries: TarEntry[];
    bytes: Uint8Array;
    /** The archive was cut at a read or decompression cap; members past the
     *  cut are missing, and the last one listed may be partial. */
    truncated: boolean;
}
/** Walk a tar's headers. Handles ustar (`prefix` + `name`), GNU long
 *  names (`L`) and PAX `path` / `size` overrides; stops at the
 *  end-of-archive marker or the end of `bytes`. */
declare function parseTar(bytes: Uint8Array): TarEntry[];
/** One member's bytes, clipped to what was read. */
declare function tarEntryBytes(archive: TarArchive, entry: TarEntry): Uint8Array;
/** Read and parse the tarball at `path`, once per store + path. */
declare function readTar(store: Store, path: string, codec?: Codec): Promise<TarArchive>;

/** Whole-file decompression for `foo.csv.gz`-style keys and compressed
 *  tarballs. `gzip` uses the platform's `DecompressionStream` (no JS
 *  inflate shipped); `zstd` lazy-loads `fzstd`, so pages that never open
 *  a `.zst` don't pay for it.
 *
 *  Output is capped: a small compressed object can expand enormously,
 *  and the viewers above hold the result in memory. Callers disclose
 *  `truncated`. */

/** Compressed bytes read for one object. Above this the input itself is
 *  cut, which `truncated` reports the same way. */
declare const MAX_COMPRESSED_BYTES: number;
/** Decompressed bytes kept. */
declare const MAX_DECOMPRESSED_BYTES: number;
interface Decompressed {
    bytes: Uint8Array;
    /** Output stopped at `max`, or the input was already cut short. */
    truncated: boolean;
}
/** Decompress `input` with `codec`, keeping at most `max` output bytes.
 *  `inputTruncated` marks input that was already cut short (a capped
 *  read), so a decode that runs out of data reports `truncated` rather
 *  than failing. */
declare function decompress(input: Uint8Array, codec: Codec, opts?: {
    max?: number;
    inputTruncated?: boolean;
}): Promise<Decompressed>;

/** Bytes shown. A hexdump line is 16 bytes, so this is 256 lines. */
declare const HEXDUMP_BYTES = 4096;
declare function BinaryView({ store, path }: {
    store: Store;
    path: string;
}): react_jsx_runtime.JSX.Element;

/** `hexdump -C`-style lines: offset, 16 bytes in two groups of 8, and
 *  the printable-ASCII column.
 *
 *    00000000  48 65 6c 6c 6f 0a                                 |Hello.|
 */
declare function hexdump(bytes: Uint8Array, base?: number): string[];
/** Whether `bytes` reads as text: no NUL, and valid UTF-8 apart from a
 *  multi-byte sequence cut off at the end (a head read can split one). */
declare function looksLikeText(bytes: Uint8Array): boolean;

/** A one-file `Store` over bytes that aren't an object in the real
 *  store: a decompressed `foo.csv.gz`, or a member of a tarball. Every
 *  viewer already speaks `Store`, so wrapping the bytes in one is what
 *  lets `foo.jsonl.gz` get the JSONL table, a `.parquet` inside a
 *  `.tar.gz` get the parquet viewer, and so on, with no viewer knowing.
 *
 *  `load` runs once, on first `get`. The bytes are in memory, so ranges
 *  are free and `capabilities.range` is on. */

declare function bytesStore(key: string, load: () => Promise<Uint8Array>, opts?: {
    describe?: string;
}): Store;

/** `foo.jsonl.gz` → the JSONL viewer over the decompressed bytes. */
declare function CompressedView({ store, path, codec, inner, render }: {
    store: Store;
    path: string;
    codec: Codec;
    /** `path` minus the codec extension; the virtual file's key. */
    inner: string;
    render: (store: Store, key: string) => ReactNode;
}): react_jsx_runtime.JSX.Element;
/** One member of a tarball, rendered by its own name's viewer. */
declare function TarMember({ store, path, entry, codec, render }: {
    store: Store;
    path: string;
    entry: string;
    codec?: Codec;
    render: (store: Store, key: string) => ReactNode;
}): react_jsx_runtime.JSX.Element;

type MediaKind = 'image' | 'video' | 'audio';
interface MediaViewerProps {
    store: Store;
    path: string;
    kind: MediaKind;
}
declare function MediaViewer({ store, path, kind }: MediaViewerProps): react_jsx_runtime.JSX.Element;

interface PdfViewerProps {
    store: Store;
    path: string;
}
declare function PdfViewer({ store, path }: PdfViewerProps): react_jsx_runtime.JSX.Element;

declare function fmtSize(n: number | undefined): string;

/** Filter-string → predicate. Substring (case-insensitive) by default;
 *  if the value contains `*` or `?`, treats it as an anchored glob. */
declare function makeMatcher(q: string): (s: string) => boolean;

export { type AsyncBuffer, BinaryView, Breadcrumb, type CellColumn, type CellCtx, type CellRenderer, Codec, CompressedView, type Crumb, type CrumbCtx, type CrumbRenderer, type Decompressed, DirListing, type DirListingProps, FileTree, type FileTreeProps, HEXDUMP_BYTES, MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES, MarkdownCtx, type MarkdownRenderer, type MediaKind, MediaViewer, type MediaViewerProps, type ParquetRenderer, Parsed, PdfViewer, type PdfViewerProps, PersistedState, type ReadmeFormat, RegistryViewer, type TarArchive, type TarEntry, TarEntryList, type TarEntryListProps, type TarEntryType, TarMember, TextViewer, type TextViewerProps, TreeSource, type TreemapRenderer, type TreemapRendererProps, type ViewerActionCtx, type ViewerEntry, type ViewerMatchCtx, type ViewerProps, ZipEntryList, type ZipEntryListProps, ZipEntryPreview, type ZipEntryPreviewProps, asyncBufferFromStore, bytesStore, decompress, findViewer, fmtSize, hexdump, looksLikeText, makeMatcher, parseTar, pickArchiveReadme, pickReadme, readTar, readZipEntries, readZipEntry, readmeFormat, tarEntryBytes };
