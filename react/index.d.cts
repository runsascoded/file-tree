import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, ComponentType } from 'react';
import { Store } from '../index.cjs';

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
 *  + `parquetRead`. See `site/src/ParquetViewer.tsx` for a reference impl. */
type ParquetRenderer = ComponentType<{
    store: Store;
    path: string;
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
     *  (typically a collapsible tree) instead of plaintext `<pre>`. */
    jsonRenderer?: (source: string) => ReactNode;
}
declare function FileTree({ store, routeBase, rootPrefix, extraTexty, title, className, style, markdownRenderer, parquetRenderer, jsonRenderer }: FileTreeProps): react_jsx_runtime.JSX.Element;

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

interface Crumb {
    label: string;
    to: string;
}
declare function Breadcrumb({ crumbs, separator, rightSlot }: {
    crumbs: Crumb[];
    separator?: string;
    rightSlot?: ReactNode;
}): react_jsx_runtime.JSX.Element | null;

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
    /** When set + a `README.md` (case-insensitive) is in the listing, the
     *  README is fetched and rendered below the table via this fn. */
    markdownRenderer?: (source: string) => ReactNode;
}
declare function DirListing({ store, prefix, routeBase, rootPrefix, q: qExternal, setQ: setQExternal, markdownRenderer }: DirListingProps): react_jsx_runtime.JSX.Element;

interface TextViewerProps {
    store: Store;
    path: string;
    /** When provided, render the bytes as rich markdown via this fn
     *  instead of plaintext `<pre>`. Caller decides which extensions
     *  qualify (typically `.md`/`.markdown`). */
    markdownRenderer?: (source: string) => ReactNode;
    /** When provided, render the bytes as a JSON tree via this fn
     *  instead of plaintext `<pre>`. Caller decides which extensions
     *  qualify (typically `.json`). */
    jsonRenderer?: (source: string) => ReactNode;
}
declare function TextViewer({ store, path, markdownRenderer, jsonRenderer }: TextViewerProps): react_jsx_runtime.JSX.Element;

type MediaKind = 'image' | 'video';
interface MediaViewerProps {
    store: Store;
    path: string;
    kind: MediaKind;
}
declare function MediaViewer({ store, path, kind }: MediaViewerProps): react_jsx_runtime.JSX.Element;

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
declare const IMAGE: Set<string>;
declare const VIDEO: Set<string>;
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
    kind: 'pdf';
    path: string;
} | {
    kind: 'image';
    path: string;
} | {
    kind: 'video';
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

declare function fmtSize(n: number | undefined): string;

/** Filter-string → predicate. Substring (case-insensitive) by default;
 *  if the value contains `*` or `?`, treats it as an anchored glob. */
declare function makeMatcher(q: string): (s: string) => boolean;

export { type AsyncBuffer, Breadcrumb, type Crumb, DirListing, type DirListingProps, FileTree, type FileTreeProps, IMAGE, type MarkdownRenderer, type MediaKind, MediaViewer, type MediaViewerProps, type ParquetRenderer, type ParsePathOptions, type Parsed, TEXTY, TextViewer, type TextViewerProps, VIDEO, asyncBufferFromStore, basename, extOf, fmtSize, keyToSplat, makeMatcher, parsePath };
