/** Which file to render as a listing's README, GitHub-style: any basename
 *  `README` (case-insensitive) with a markdown or plain-text extension, or
 *  none. Markdown renders through the `markdownRenderer`; the rest render
 *  as preformatted text (there's no reStructuredText renderer). */

export type ReadmeFormat = 'markdown' | 'text'

/** Extension → format, in preference order when a dir holds several. */
const EXTS: [string, ReadmeFormat][] = [
  ['.md', 'markdown'],
  ['.markdown', 'markdown'],
  ['.rst', 'text'],
  ['.txt', 'text'],
  ['', 'text'],
]

/** A basename's README rank (index into the preference order), or `-1`. */
function rank(base: string): number {
  const m = /^readme(\.[^.]*)?$/i.exec(base)
  if (!m) return -1
  const ext = (m[1] ?? '').toLowerCase()
  return EXTS.findIndex(([e]) => e === ext)
}

export function readmeFormat(name: string): ReadmeFormat {
  const base = name.slice(name.lastIndexOf('/') + 1)
  const r = rank(base)
  return r < 0 ? 'text' : EXTS[r][1]
}

/** The preferred README among `names` sitting directly in `dir` (`''` or a
 *  `/`-terminated prefix), or `null`. Directory names (trailing `/`) never
 *  match. */
export function pickReadme(names: readonly string[], dir = ''): string | null {
  let best: string | null = null
  let bestRank = Infinity
  for (const name of names) {
    if (!name.startsWith(dir)) continue
    const base = name.slice(dir.length)
    if (!base || base.includes('/')) continue
    const r = rank(base)
    if (r >= 0 && r < bestRank) { best = name; bestRank = r }
  }
  return best
}

/** An archive's README: one at the archive root, else — when every member
 *  sits under a single top-level directory, as most tarballs wrap theirs
 *  (`foo-1.2.3/…`) — one directly in that directory. */
export function pickArchiveReadme(names: readonly string[]): string | null {
  const root = pickReadme(names)
  if (root) return root
  const tops = new Set(names.map(n => n.split('/')[0]))
  if (tops.size !== 1) return null
  const [top] = tops
  return pickReadme(names, `${top}/`)
}
