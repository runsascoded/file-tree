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

export { AUDIO as A, CODE_LANG as C, IMAGE as I, type ParsePathOptions as P, TEXTY as T, VIDEO as V, type Parsed as a, basename as b, extOf as e, keyToSplat as k, parsePath as p };
