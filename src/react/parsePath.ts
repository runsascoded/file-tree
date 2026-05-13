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

export const TEXTY = new Set(['txt', 'csv', 'tsv', 'json', 'md', 'log', 'yaml', 'yml', 'toml', 'ini', 'sql', 'sh', 'py', 'ts', 'tsx', 'js', 'jsx', 'html', 'css'])

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

  // Zip entry: "<zip>!/<entry>"
  const bangIdx = key.indexOf('!/')
  if (bangIdx >= 0) {
    return {
      kind: 'zipEntry',
      path: key.slice(0, bangIdx),
      entry: key.slice(bangIdx + 2),
    }
  }

  // Empty splat → root dir.
  if (key === '' || key === root) return { kind: 'dir', prefix: root }
  // Trailing slash → dir.
  if (key.endsWith('/')) return { kind: 'dir', prefix: key }

  const ext = extOf(key)
  if (ext === 'zip') return { kind: 'zip', path: key }
  if (ext === 'pqt' || ext === 'parquet') return { kind: 'parquet', path: key }
  if (ext === 'ipynb') return { kind: 'notebook', path: key }
  if (ext === 'pdf') return { kind: 'pdf', path: key }
  if (IMAGE.has(ext)) return { kind: 'image', path: key }
  if (VIDEO.has(ext)) return { kind: 'video', path: key }
  if (AUDIO.has(ext)) return { kind: 'audio', path: key }
  if (texty.has(ext)) return { kind: 'text', path: key }

  // No extension and no trailing slash: assume dir (users often type
  // `/files/dir` without the slash).
  if (!ext) return { kind: 'dir', prefix: key + '/' }

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
