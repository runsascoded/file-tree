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

export const TEXTY = new Set([
  'txt', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'md', 'markdown', 'log', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sql', 'sh', 'bash', 'zsh', 'py', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'html', 'css', 'scss', 'xml',
  'go', 'rs', 'rb', 'java', 'c', 'cpp', 'h', 'hpp',
  'gitignore', 'dockerignore', 'editorconfig',
])

/** Extension-less basenames that are text by convention, rather than the
 *  directory an extension-less key otherwise means. */
export const TEXT_NAMES = new Set([
  'Makefile', 'Dockerfile', 'Justfile', 'Procfile', 'Gemfile', 'Rakefile', 'Vagrantfile',
  'LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'AUTHORS', 'README', 'CHANGELOG', 'CODEOWNERS',
])

/** Line-delimited JSON: one record per line, rendered as a table when a
 *  `jsonlRenderer` is wired (else as text). */
export const JSONL = new Set(['jsonl', 'ndjson'])

/** Whole-file compression codecs, by extension. `foo.csv.gz` is the CSV
 *  `foo.csv`, decompressed in the browser (`gzip` via the platform's
 *  `DecompressionStream`, `zstd` via `fzstd`). */
export type Codec = 'gzip' | 'zstd'
export const CODECS: Record<string, Codec> = { gz: 'gzip', gzip: 'gzip', zst: 'zstd', zstd: 'zstd' }

/** Map file extension → highlight.js / shiki language id. Subset of
 *  TEXTY; extensions not in this map fall through to plaintext. */
export const CODE_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx',
  js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
  sh: 'bash', bash: 'bash',
  sql: 'sql',
  html: 'html', css: 'css', scss: 'scss',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  go: 'go', rs: 'rust', rb: 'ruby', java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
}
export const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
export const VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
export const AUDIO = new Set(['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac'])

export type Parsed =
  | { kind: 'dir'; prefix: string }
  | { kind: 'zip'; path: string }
  | { kind: 'zipEntry'; path: string; entry: string }
  | { kind: 'tar'; path: string; codec?: Codec }
  | { kind: 'tarEntry'; path: string; entry: string; codec?: Codec }
  /** A compressed file; `inner` is its key minus the codec extension,
   *  which decides how the decompressed bytes render. */
  | { kind: 'compressed'; path: string; codec: Codec; inner: string }
  | { kind: 'text'; path: string }
  | { kind: 'parquet'; path: string }
  | { kind: 'notebook'; path: string }
  | { kind: 'pdf'; path: string }
  | { kind: 'image'; path: string }
  | { kind: 'video'; path: string }
  | { kind: 'audio'; path: string }
  | { kind: 'binary'; path: string }

export interface ParsePathOptions {
  /** Optional root prefix prepended to every key. E.g. `'raw/'` makes
   *  `parsePath('njdot/data/')` resolve to `{ kind: 'dir', prefix: 'raw/njdot/data/' }`.
   *  Default: empty string (splat is the full key). */
  rootPrefix?: string
  /** Additional file extensions to render as text. Merged with the default
   *  TEXTY set. */
  extraTexty?: string[]
}

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function parsePath(splat: string, opts: ParsePathOptions = {}): Parsed {
  const root = opts.rootPrefix ?? ''
  const texty = opts.extraTexty ? new Set([...TEXTY, ...opts.extraTexty]) : TEXTY

  let decoded: string
  try {
    decoded = decodeURIComponent(splat)
  } catch {
    decoded = splat
  }
  const stripped = decoded.replace(/^\/+/, '')
  const key = root + stripped

  // Archive member: "<archive>!/<entry>"
  const bangIdx = key.indexOf('!/')
  if (bangIdx >= 0) {
    const path = key.slice(0, bangIdx)
    const entry = key.slice(bangIdx + 2)
    const tar = tarCodec(path)
    if (tar !== null) return { kind: 'tarEntry', path, entry, ...(tar ? { codec: tar } : {}) }
    return { kind: 'zipEntry', path, entry }
  }

  // Empty splat → root dir.
  if (key === '' || key === root) return { kind: 'dir', prefix: root }
  // Trailing slash → dir.
  if (key.endsWith('/')) return { kind: 'dir', prefix: key }

  // No extension and no trailing slash: assume dir (users often type
  // `/files/dir` without the slash), unless the name is a known text file.
  if (!extOf(key) && !TEXT_NAMES.has(basename(key))) return { kind: 'dir', prefix: key + '/' }

  return parseFileKey(key, texty)
}

/** `''` for a plain `.tar`, the codec for a compressed one (`.tar.gz`,
 *  `.tgz`, `.tar.zst`), `null` for anything that isn't a tarball. */
export function tarCodec(key: string): Codec | '' | null {
  const ext = extOf(key)
  if (ext === 'tar') return ''
  if (ext === 'tgz') return 'gzip'
  const codec = CODECS[ext]
  if (codec && extOf(key.slice(0, -(ext.length + 1))) === 'tar') return codec
  return null
}

/** How a file (never a directory) at `key` renders, by extension. Also
 *  used for the bytes inside a compressed file or an archive member,
 *  where an extension-less name is a file of unknown type rather than a
 *  directory. */
export function parseFileKey(key: string, texty: ReadonlySet<string> = TEXTY): Exclude<Parsed, { kind: 'dir' | 'zipEntry' | 'tarEntry' }> {
  const ext = extOf(key)
  const tar = tarCodec(key)
  if (tar !== null) return { kind: 'tar', path: key, ...(tar ? { codec: tar } : {}) }
  const codec = CODECS[ext]
  if (codec) return { kind: 'compressed', path: key, codec, inner: key.slice(0, -(ext.length + 1)) }
  if (ext === 'zip') return { kind: 'zip', path: key }
  if (ext === 'pqt' || ext === 'parquet') return { kind: 'parquet', path: key }
  if (ext === 'ipynb') return { kind: 'notebook', path: key }
  if (ext === 'pdf') return { kind: 'pdf', path: key }
  if (IMAGE.has(ext)) return { kind: 'image', path: key }
  if (VIDEO.has(ext)) return { kind: 'video', path: key }
  if (AUDIO.has(ext)) return { kind: 'audio', path: key }
  if (texty.has(ext) || TEXT_NAMES.has(basename(key))) return { kind: 'text', path: key }
  return { kind: 'binary', path: key }
}

/** Strip the root prefix from a store key to produce a route-relative
 *  splat for `<Link to=...>`. Inverse of `parsePath` when given the
 *  same `rootPrefix`. */
export function keyToSplat(key: string, rootPrefix = ''): string {
  return key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key
}

export function basename(key: string): string {
  const trimmed = key.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i < 0 ? trimmed : trimmed.slice(i + 1)
}
