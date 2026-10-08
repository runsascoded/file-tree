/** Parse a URL path-suffix into a renderable view kind + store key.
 *
 * `splat` is the URL after the route base (e.g. `<FileTree routeBase="/files" />`
 * receives the `pathname.replace(/^\/files\/?/, "")` part). It's
 * percent-encoded; we decode before building the store key so entry names
 * with spaces or unicode round-trip correctly.
 *
 * Archive members use the [pkzip-URI convention][1] of `!/` between the
 * archive path and the entry name (`<zip>!/<entry>`, `<tar.gz>!/<entry>`).
 *
 * [1]: https://docs.gradle.org/current/userguide/declaring_repositories.html#zip_uri
 */
declare const TEXTY: Set<string>;
/** Extension-less basenames that are text by convention, rather than the
 *  directory an extension-less key otherwise means. */
declare const TEXT_NAMES: Set<string>;
/** Line-delimited JSON: one record per line, rendered as a table when a
 *  `jsonlRenderer` is wired (else as text). */
declare const JSONL: Set<string>;
/** Whole-file compression codecs, by extension. `foo.csv.gz` is the CSV
 *  `foo.csv`, decompressed in the browser (`gzip` via the platform's
 *  `DecompressionStream`, `zstd` via `fzstd`). */
type Codec = 'gzip' | 'zstd';
declare const CODECS: Record<string, Codec>;
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
    kind: 'tar';
    path: string;
    codec?: Codec;
} | {
    kind: 'tarEntry';
    path: string;
    entry: string;
    codec?: Codec;
}
/** A compressed file; `inner` is its key minus the codec extension,
 *  which decides how the decompressed bytes render. */
 | {
    kind: 'compressed';
    path: string;
    codec: Codec;
    inner: string;
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
/** `''` for a plain `.tar`, the codec for a compressed one (`.tar.gz`,
 *  `.tgz`, `.tar.zst`), `null` for anything that isn't a tarball. */
declare function tarCodec(key: string): Codec | '' | null;
/** How a file (never a directory) at `key` renders, by extension. Also
 *  used for the bytes inside a compressed file or an archive member,
 *  where an extension-less name is a file of unknown type rather than a
 *  directory. */
declare function parseFileKey(key: string, texty?: ReadonlySet<string>): Exclude<Parsed, {
    kind: 'dir' | 'zipEntry' | 'tarEntry';
}>;
/** Strip the root prefix from a store key to produce a route-relative
 *  splat for `<Link to=...>`. Inverse of `parsePath` when given the
 *  same `rootPrefix`. */
declare function keyToSplat(key: string, rootPrefix?: string): string;
declare function basename(key: string): string;

export { AUDIO as A, type Codec as C, IMAGE as I, JSONL as J, type ParsePathOptions as P, TEXTY as T, VIDEO as V, type Parsed as a, CODECS as b, CODE_LANG as c, TEXT_NAMES as d, basename as e, extOf as f, parsePath as g, keyToSplat as k, parseFileKey as p, tarCodec as t };
