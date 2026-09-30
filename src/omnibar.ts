/** ⌘K path search over a `TreeSource`, as a `use-kbd` omnibar endpoint.
 *
 *  The search corpus is the same tree `<FileTree treeSource>` already reads
 *  for dir sizes and the treemap, so this is a third reader of that seam, not
 *  a new data source. Opt-in: nothing here is imported by `<FileTree>`, and
 *  `use-kbd` is only named in types (an optional peer), so a consumer who
 *  doesn't mount an omnibar bundles none of it.
 *
 *  ```tsx
 *  useOmnibarEndpoint('files', treePathEndpoint(treeSource, { routeBase: '/files' }))
 *  <Omnibar onExecuteRemote={e => 'href' in e && e.href && navigate(e.href)} />
 *  ```
 *
 *  See `specs/done/omnibar-path-search.md`. */
import type { EndpointPagination, EndpointResponse, OmnibarEndpointAsyncConfig, OmnibarEntry } from 'use-kbd'
import { TreeTooLargeError, type TreeNode, type TreeSource } from './renderers/treeSource'
import { fmtSize } from './react/fmt'

/** Default cap on the nodes {@link treePathIndex} enumerates. */
export const DEFAULT_INDEX_MAX_NODES = 50_000

export interface TreePathIndexOptions {
  /** Subtree to index (tree-relative, `''` = the whole tree). The scope root
   *  itself is not an entry. */
  path?: string
  /** Stop and throw {@link TreeTooLargeError} past this many nodes. Default
   *  {@link DEFAULT_INDEX_MAX_NODES}. */
  maxNodes?: number
}

/** Every node under `path`, breadth-first (so shallower nodes come first),
 *  via `source.children`. On a `walkTreeSource` that has already walked the
 *  tree (for sizes or the treemap), every level is a cache hit. */
export async function treePathIndex(source: TreeSource, opts: TreePathIndexOptions = {}): Promise<TreeNode[]> {
  const { path = '', maxNodes = DEFAULT_INDEX_MAX_NODES } = opts
  const out: TreeNode[] = []
  let frontier = [path]
  while (frontier.length) {
    const levels = await Promise.all(frontier.map(p => source.children({ path: p })))
    frontier = []
    for (const { children } of levels) {
      for (const c of children) {
        out.push(c)
        if (c.kind === 'dir') frontier.push(c.path)
      }
      if (out.length > maxNodes) {
        throw new TreeTooLargeError(`tree under ${path || '(root)'} exceeds ${maxNodes} entries`, out.length)
      }
    }
  }
  return out
}

const BOUNDARY = /[\s\-_./]/
/** Shortest token that may match as a scattered subsequence. */
const MIN_SUBSEQ = 3

/** Score one lowercase token against `text`, or `null` if it doesn't match.
 *  A contiguous hit beats a scattered one; a hit starting at a word boundary
 *  (start, or after `/ . _ -` / space) beats one mid-word; earlier beats later.
 *  Tokens of 3+ chars fall back to an in-order subsequence (`fbr` →
 *  `foo-bar`), scored per char
 *  with bonuses for runs and boundaries. */
function scoreToken(token: string, text: string): number | null {
  const lo = text.toLowerCase()
  let best: number | null = null
  for (let i = lo.indexOf(token); i >= 0; i = lo.indexOf(token, i + 1)) {
    const s = 10 * token.length + (i === 0 || BOUNDARY.test(text[i - 1]) ? 8 : 0) - i * 0.01
    if (best === null || s > best) best = s
  }
  if (best !== null) return best
  // Scattered matches of a short token are mostly noise (`ny` would hit
  // `config.yaml`); only a longer one earns the subsequence fallback.
  if (token.length < MIN_SUBSEQ) return null
  let score = 0, run = 0, last = -2, ti = 0
  for (let i = 0; i < lo.length && ti < token.length; i++) {
    if (lo[i] !== token[ti]) continue
    run = last === i - 1 ? run + 1 : 0
    score += 1 + run + (i === 0 || BOUNDARY.test(text[i - 1]) ? 2 : 0) - i * 0.01
    last = i
    ti++
  }
  return ti === token.length ? score : null
}

/** Bonus for a token matched within the basename, where the eye looks. */
const NAME_BONUS = 5

/** Fuzzy score of `query` against a tree path, or `null` if some token misses.
 *  Whitespace separates tokens, each of which must match (in any order), so
 *  `csv data` finds `data/2024/sales.csv`. A token matched in the basename
 *  scores above the same match in a parent segment, and among equal matches a
 *  shorter path wins. Case-insensitive. Dependency-free, and deliberately
 *  separate from the dir filter's substring/glob `makeMatcher`, whose
 *  semantics stay unchanged. */
export function scorePath(query: string, path: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const name = path.slice(path.lastIndexOf('/') + 1)
  let total = 0
  for (const t of tokens) {
    const inName = scoreToken(t, name)
    const inPath = scoreToken(t, path)
    if (inName === null && inPath === null) return null
    total += Math.max(inName === null ? -Infinity : inName + NAME_BONUS, inPath ?? -Infinity)
  }
  return total - path.length * 0.001
}

export interface TreePathEndpointOptions extends TreePathIndexOptions {
  /** Route base the hrefs resolve against: the `<FileTree routeBase>`. */
  routeBase: string
  /** Omnibar group label. Default `'Files'`; `null` for none (e.g. the
   *  current folder's scope, whose hits' paths already say where they are).
   *  Register one endpoint per scope (this subtree at a higher `priority`,
   *  ancestors lower) to rank nearer hits first. */
  group?: string | null
  /** Group ordering among endpoints (higher first). Default 50. */
  priority?: number
  /** Skip this subtree (tree-relative; the node and everything under it).
   *  For an ancestor-scope endpoint, so hits a nearer-scope endpoint already
   *  shows aren't listed twice. */
  excludePath?: string
  /** Restrict entries to files or dirs. Default both. */
  kinds?: ReadonlyArray<'file' | 'dir'>
  /** Passed through to `use-kbd` (e.g. off for an "elsewhere" scope while at
   *  the root, where it would repeat every hit). Default `true`. */
  enabled?: boolean
  /** Minimum query length before searching. Default 1. */
  minQueryLength?: number
  /** Results per page. Default `use-kbd`'s. */
  pageSize?: number
}

/** Per-source index cache, keyed by scope path + cap, so re-creating the
 *  endpoint config on every render (as `useOmnibarEndpoint` callers tend to)
 *  doesn't re-enumerate the tree. A failed build is evicted so it can retry. */
const indexes = new WeakMap<TreeSource, Map<string, Promise<TreeNode[]>>>()

function cachedIndex(source: TreeSource, opts: TreePathIndexOptions): Promise<TreeNode[]> {
  let bySource = indexes.get(source)
  if (!bySource) indexes.set(source, bySource = new Map())
  const key = `${opts.path ?? ''}\0${opts.maxNodes ?? DEFAULT_INDEX_MAX_NODES}`
  let p = bySource.get(key)
  if (!p) {
    p = treePathIndex(source, opts)
    p.catch(() => bySource.delete(key))
    bySource.set(key, p)
  }
  return p
}

/** `use-kbd` > 0.13 keeps an endpoint's own order under `sort: 'none'`; 0.13
 *  doesn't know the key (it re-ranks by its own fuzzy score, over the same
 *  hits). Spread from a variable so it type-checks against either. */
const KEEP_ORDER = { sort: 'none' as const }

/** A `use-kbd` omnibar endpoint searching the paths under a `TreeSource`.
 *  Each hit is a link entry: basename as label, path (plus size, when known)
 *  as description, and the same `routeBase/<path>` href a listing click
 *  navigates to (dirs with a trailing `/`). Pass `<Omnibar onExecuteRemote>`
 *  an SPA `navigate` so selecting a hit doesn't full-reload the page.
 *
 *  The index is built on the first query and cached per source; results are
 *  ranked here by {@link scorePath} (`sort: 'none'`), not re-ranked by the
 *  omnibar. A tree past `maxNodes` yields a single explanatory entry rather
 *  than a silent empty list. */
export function treePathEndpoint(source: TreeSource, opts: TreePathEndpointOptions): OmnibarEndpointAsyncConfig {
  const { routeBase, group = 'Files', priority = 50, excludePath, kinds, minQueryLength = 1, pageSize } = opts
  const base = routeBase.replace(/\/+$/, '')
  const kindSet = kinds ? new Set(kinds) : undefined
  return {
    ...(group !== null ? { group } : {}),
    priority,
    minQueryLength,
    ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...KEEP_ORDER,
    fetch: async (query: string, _signal: AbortSignal, { offset, limit }: EndpointPagination): Promise<EndpointResponse> => {
      let index: TreeNode[]
      try {
        index = await cachedIndex(source, opts)
      } catch (e) {
        if (!(e instanceof Error && e.name === 'TreeTooLargeError')) throw e
        return { entries: [{ id: `${group ?? 'files'}:too-large`, label: 'Tree too large to index', description: e.message, handler: () => {} }], total: 1 }
      }
      const hits: { node: TreeNode; score: number }[] = []
      for (const node of index) {
        if (kindSet && !kindSet.has(node.kind)) continue
        if (excludePath !== undefined && (node.path === excludePath || node.path.startsWith(`${excludePath}/`))) continue
        const score = scorePath(query, node.path)
        if (score !== null) hits.push({ node, score })
      }
      hits.sort((a, b) => b.score - a.score)
      const entries: OmnibarEntry[] = hits.slice(offset, offset + limit).map(({ node }) => {
        const dir = node.kind === 'dir'
        const shown = dir ? `${node.path}/` : node.path
        return {
          id: node.path,
          label: dir ? `${node.name}/` : node.name,
          description: node.size != null ? `${shown} · ${fmtSize(node.size)}` : shown,
          href: `${base}/${shown}`,
        }
      })
      return { entries, total: hits.length, hasMore: offset + limit < hits.length }
    },
  }
}
