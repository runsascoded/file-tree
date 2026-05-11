import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { Store } from '../index.cjs';

/** Optional renderer that converts a markdown source string into a
 *  React node. Pluggable so the lib doesn't bundle a markdown library;
 *  consumers wire `react-markdown` (or any equivalent). When provided,
 *  `<TextViewer>` uses it for `.md`/`.markdown` files and
 *  `<DirListing>` uses it for default-README rendering below the
 *  directory table. */
type MarkdownRenderer = (source: string) => ReactNode;
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
}
declare function FileTree({ store, routeBase, rootPrefix, extraTexty, title, className, style, markdownRenderer }: FileTreeProps): react_jsx_runtime.JSX.Element;

interface Crumb {
    label: string;
    to: string;
}
declare function Breadcrumb({ crumbs, separator }: {
    crumbs: Crumb[];
    separator?: string;
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
}
declare function TextViewer({ store, path, markdownRenderer }: TextViewerProps): react_jsx_runtime.JSX.Element;

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

export { Breadcrumb, type Crumb, DirListing, type DirListingProps, FileTree, type FileTreeProps, type ParsePathOptions, type Parsed, TEXTY, TextViewer, type TextViewerProps, basename, extOf, fmtSize, keyToSplat, makeMatcher, parsePath };
