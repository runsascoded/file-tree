import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, ComponentType } from 'react';
import { Entry, Store, ZipEntriesResult, GetResult } from '../index.js';
import { P as PersistedState } from '../persistedState-CB_wfbcb.js';

interface Crumb {
    label: string;
    to: string;
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
    /** When set + a `README.md` (case-insensitive) is in the listing, the
     *  README is fetched and rendered below the table via this fn. */
    markdownRenderer?: (source: string) => ReactNode;
    /** Optional per-cell render hook (see `CellRenderer`). */
    renderCell?: CellRenderer;
}
declare function DirListing({ store, prefix, routeBase, rootPrefix, q: qExternal, setQ: setQExternal, filterPlaceholder, usePersistedState, markdownRenderer, renderCell }: DirListingProps): react_jsx_runtime.JSX.Element;

/** Parse a URL path-suffix into a renderable view kind + store key.
 *
 * `splat` is the URL after the route base (e.g. `<FileTree routeBase="/files" />`
 * receives the `pathname.replace(/^\/files\/?/, "")` part). It's
 * percent-encoded; we decode before building the store key so entry names
 * with spaces or unicode round-trip correctly.
 *
 * Zip entries use the [pkzip-URI convention][1] of `!/` between the
 * archive path and the entry name (`<zip>!/<entry>`). Currently parsed
 * but rendered as `binary` in v1 (zip support TBD).
 *
 * [1]: https://docs.gradle.org/current/userguide/declaring_repositories.html#zip_uri
 */
declare const TEXTY: Set<string>;
/** Map file extension → highlight.js / shiki language id. Subset of
 *  TEXTY; extensions not in this map fall through to plaintext. */
declare const CODE_LANG: Record<string, string>;
declare const IMAGE: Set<string>;
declare const VIDEO: Set<string>;
declare const AUDIO: Set<string>;
type Parsed = {
    kind: 'dir';
    prefix: string;
} | {
    kind: 'zip';
    path: string;
} | {
    kind: 'zipEntry';
    path: string;
    entry: string;
} | {
    kind: 'text';
    path: string;
} | {
    kind: 'parquet';
    path: string;
} | {
    kind: 'notebook';
    path: string;
} | {
    kind: 'pdf';
    path: string;
} | {
    kind: 'image';
    path: string;
} | {
    kind: 'video';
    path: string;
} | {
    kind: 'audio';
    path: string;
} | {
    kind: 'binary';
    path: string;
};
interface ParsePathOptions {
    /** Optional root prefix prepended to every key. E.g. `'raw/'` makes
     *  `parsePath('njdot/data/')` resolve to `{ kind: 'dir', prefix: 'raw/njdot/data/' }`.
     *  Default: empty string (splat is the full key). */
    rootPrefix?: string;
    /** Additional file extensions to render as text. Merged with the default
     *  TEXTY set. */
    extraTexty?: string[];
}
declare function extOf(name: string): string;
declare function parsePath(splat: string, opts?: ParsePathOptions): Parsed;
/** Strip the root prefix from a store key to produce a route-relative
 *  splat for `<Link to=...>`. Inverse of `parsePath` when given the
 *  same `rootPrefix`. */
declare function keyToSplat(key: string, rootPrefix?: string): string;
declare function basename(key: string): string;

/** Optional renderer that converts a markdown source string into a
 *  React node. Pluggable so the lib doesn't bundle a markdown library;
 *  consumers wire `react-markdown` (or any equivalent). When provided,
 *  `<TextViewer>` uses it for `.md`/`.markdown` files and
 *  `<DirListing>` uses it for default-README rendering below the
 *  directory table. */
type MarkdownRenderer = (source: string) => ReactNode;
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
 *  ignore the prop. */
type ParquetRenderer = ComponentType<{
    store: Store;
    path: string;
    usePersistedState?: PersistedState;
}>;
interface FileTreeProps {
    store: Store;
    /** Path the browser is mounted under, e.g. `/files`. */
    routeBase: string;
    /** Optional store-key prefix prepended to the URL splat (e.g. `'raw/'`).
     *  Use this when the route exposes only a sub-tree of the store. */
    rootPrefix?: string;
    /** Additional file extensions to render as text. */
    extraTexty?: string[];
    /** Optional title to show above the breadcrumb. */
    title?: string;
    /** Optional className for the outer wrapper. */
    className?: string;
    /** Optional inline style for the outer wrapper. */
    style?: React.CSSProperties;
    /** Optional markdown renderer (see `MarkdownRenderer`). When set, `.md`
     *  files render as rich markdown (instead of plaintext `<pre>`) and
     *  any `README.md` in a directory is rendered below the listing. */
    markdownRenderer?: MarkdownRenderer;
    /** Optional parquet renderer (see `ParquetRenderer`). When set,
     *  `.parquet`/`.pqt` paths render via this component (typically a
     *  hyparquet-backed table). */
    parquetRenderer?: ParquetRenderer;
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
    /** Optional notebook renderer. When set, `.ipynb` paths render via
     *  this component (typically a cell-by-cell view with rendered
     *  markdown cells + code outputs). */
    notebookRenderer?: ComponentType<{
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
    /** Set only when `kind === 'zipEntry'`: the entry name inside the zip. */
    entry?: string;
}
declare function FileTree({ store, routeBase, rootPrefix, extraTexty, title, className, style, markdownRenderer, parquetRenderer, jsonRenderer, csvRenderer, notebookRenderer, codeRenderer, viewerActions, renderCell, renderCrumb, filterPlaceholder, usePersistedState }: FileTreeProps): react_jsx_runtime.JSX.Element;

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
}
declare function ZipEntryList({ store, path, routeBase, rootPrefix }: ZipEntryListProps): react_jsx_runtime.JSX.Element;

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

type MediaKind = 'image' | 'video' | 'audio';
interface MediaViewerProps {
    store: Store;
    path: string;
    kind: MediaKind;
}
declare function MediaViewer({ store, path, kind }: MediaViewerProps): react_jsx_runtime.JSX.Element;

declare function fmtSize(n: number | undefined): string;

/** Filter-string → predicate. Substring (case-insensitive) by default;
 *  if the value contains `*` or `?`, treats it as an anchored glob. */
declare function makeMatcher(q: string): (s: string) => boolean;

export { AUDIO, type AsyncBuffer, Breadcrumb, CODE_LANG, type CellColumn, type CellCtx, type CellRenderer, type Crumb, type CrumbCtx, type CrumbRenderer, DirListing, type DirListingProps, FileTree, type FileTreeProps, IMAGE, type MarkdownRenderer, type MediaKind, MediaViewer, type MediaViewerProps, type ParquetRenderer, type ParsePathOptions, type Parsed, TEXTY, TextViewer, type TextViewerProps, VIDEO, type ViewerActionCtx, ZipEntryList, type ZipEntryListProps, ZipEntryPreview, type ZipEntryPreviewProps, asyncBufferFromStore, basename, extOf, fmtSize, keyToSplat, makeMatcher, parsePath, readZipEntries, readZipEntry };
