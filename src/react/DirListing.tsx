import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Entry, Store } from '../types'
import type { TreeSource } from '../renderers/treeSource'
import { fmtSize } from './fmt'
import { makeMatcher } from './match'
import { basename, keyToSplat } from './parsePath'
import { defaultUseState, type PersistedState } from './persistedState'

/** Columns rendered by the default `<DirListing>` table. */
export type CellColumn = 'name' | 'size' | 'modified'

export interface CellCtx {
  /** The listing entry this row is for. */
  entry: Entry
  column: CellColumn
  /** Store-relative prefix of the directory being listed. */
  prefix: string
  /** Route this row links to (`routeBase` + splat). */
  href: string
  /** What `<DirListing>` would have rendered for this cell. Decorating
   *  callers wrap it; overriding callers ignore it. */
  defaultNode: ReactNode
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
export type CellRenderer = (ctx: CellCtx) => ReactNode

export interface DirListingProps {
  store: Store
  /** Store-relative prefix (incl. trailing slash). */
  prefix: string
  /** Route base for sub-links. E.g. `/files`. */
  routeBase: string
  /** Optional root prefix for splat conversion (matches `<FileTree rootPrefix>`). */
  rootPrefix?: string
  /** Optional filter string (controlled). If omitted, an internal text input
   *  is rendered. */
  q?: string
  setQ?: (q: string) => void
  /** Placeholder for the internal filter input. Default `"filter"`. */
  filterPlaceholder?: string
  /** Persisted-state hook for the internal filter `q`. Default is
   *  `useState` (in-memory). Pass `useUrlPersistedState` (from
   *  `@rdub/file-tree/url-state`) to bind `q` to `?q=…`. Ignored when
   *  the caller controls `q`/`setQ` directly. */
  usePersistedState?: PersistedState
  /** When set + a `README.md` (case-insensitive) is in the listing, the
   *  README is fetched and rendered below the table via this fn. */
  markdownRenderer?: (source: string) => ReactNode
  /** Optional per-cell render hook (see `CellRenderer`). */
  renderCell?: CellRenderer
  /** When set, directory rows show their *recursive* size (instead of
   *  `—`): the listing calls `treeSource.children(prefix)` once and reads
   *  each child directory's rollup. A `TreeTooLargeError` (or any
   *  failure) is swallowed — the `—` stays, so an oversized tree degrades
   *  to today's behaviour rather than erroring. File sizes still come
   *  from the store's own listing. */
  treeSource?: TreeSource
  /** Cross-highlight ("scrub") callback: fired with a row's tree-relative
   *  path (no trailing slash) on hover-in, `null` on hover-out. `<FileTree>`
   *  wires this in split view so hovering a row can emphasize the matching
   *  treemap tile. Optional — omitted outside split view. */
  onHoverPath?: (path: string | null) => void
  /** The path to highlight (from the shared scrub state): the row whose
   *  tree-relative path equals this gets an emphasized background. `null`
   *  for none. Optional. */
  highlightedPath?: string | null
  /** The persistently-selected path (a pinned file tile in the split
   *  map): its row gets a distinct, persistent background. `null` for
   *  none. A hover (`highlightedPath`) takes visual priority. Optional. */
  selectedPath?: string | null
}

/** Recursive directory sizes for the current level, keyed by store key.
 *  `null` while loading or unavailable — callers fall back to `—`.
 *
 *  A `treeSource`'s node paths are relative to *its* root, which is
 *  expected to equal the `<FileTree rootPrefix>` (so they live in the
 *  same splat space `keyToSplat` produces). We ask it for the current
 *  level's children by that relative path, then re-key each child's
 *  rollup by store key for the listing to look up. */
function useDirSizes(
  treeSource: TreeSource | undefined,
  prefix: string,
  rootPrefix: string,
): Map<string, number> | null {
  const [sizes, setSizes] = useState<Map<string, number> | null>(null)
  useEffect(() => {
    setSizes(null)
    if (!treeSource) return
    let cancelled = false
    const treePath = keyToSplat(prefix, rootPrefix).replace(/\/+$/, '')
    treeSource.children({ path: treePath }).then(
      level => {
        if (cancelled) return
        const m = new Map<string, number>()
        for (const c of level.children) {
          if (c.kind === 'dir' && c.size != null) m.set(`${prefix}${c.name}/`, c.size)
        }
        setSizes(m)
      },
      () => { if (!cancelled) setSizes(null) },
    )
    return () => { cancelled = true }
  }, [treeSource, prefix, rootPrefix])
  return sizes
}

/** A directory row's size cell: its recursive rollup when the tree
 *  source has answered, `—` otherwise (no source, still loading, or the
 *  tree was too large to walk). */
function dirSize(sizes: Map<string, number> | null, key: string): ReactNode {
  const s = sizes?.get(key)
  return s == null ? '—' : fmtSize(s)
}

export function DirListing({ store, prefix, routeBase, rootPrefix = '', q: qExternal, setQ: setQExternal, filterPlaceholder = 'filter', usePersistedState, markdownRenderer, renderCell, treeSource, onHoverPath, highlightedPath, selectedPath }: DirListingProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  // When uncontrolled, `usePersistedState` decides how `q` is stored:
  // default `useState` (in-memory), or `useUrlPersistedState` (URL)
  // when the consumer opts in via `<FileTree>`. Controlled callers
  // manage their own state.
  const use = usePersistedState ?? defaultUseState
  const [qInner, setQInner] = use<string>('q', '')
  const q = qExternal ?? qInner
  const setQ = setQExternal ?? setQInner

  // Reset the filter on every dir-nav, regardless of router strategy.
  // BrowserRouter consumers get this for free (Links carry no query, so
  // the new URL drops `?q=`), but HashRouter consumers (e.g. tomat)
  // navigate via `location.hash` only, so `?q=` in `location.search`
  // survives — and they land in the new dir with "no entries match
  // <stale-q>". The explicit reset covers both. (If `use-prms` later
  // gains a HashRouter-aware query strategy, this can go.)
  useEffect(() => {
    setQ('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix])

  useEffect(() => {
    let cancelled = false
    setEntries(null); setError(null); setCursor(undefined)
    // Auto-follow cursors up to a safe cap. R2 (and S3-likes) page their
    // delimiter-grouped listing internally — a "dir" with 1440 child
    // objects still requires multiple LIST calls to exhaust. Most users
    // expect "all entries" when they navigate to a dir, so we follow
    // automatically. Stop at MAX_PAGES so a runaway prefix can't wedge
    // the UI; remaining cursor is exposed via the "load more" button.
    const MAX_PAGES = 20
    ;(async () => {
      try {
        const collected: Entry[] = []
        let cur: string | undefined = undefined
        for (let i = 0; i < MAX_PAGES; i++) {
          const r: { entries: Entry[]; cursor?: string } = await store.list(prefix, cur ? { cursor: cur } : undefined)
          if (cancelled) return
          collected.push(...r.entries)
          if (!r.cursor) { cur = undefined; break }
          cur = r.cursor
        }
        if (cancelled) return
        setEntries(collected)
        setCursor(cur)
      } catch (e) {
        if (cancelled) return
        setError(String(e))
      }
    })()
    return () => { cancelled = true }
  }, [store, prefix])

  async function loadMore() {
    if (!cursor) return
    const r = await store.list(prefix, { cursor })
    setEntries(prev => [...(prev ?? []), ...r.entries])
    setCursor(r.cursor)
  }

  const dirSizes = useDirSizes(treeSource, prefix, rootPrefix)

  const matcher = useMemo(() => makeMatcher(q), [q])
  const filtered = useMemo(() => {
    if (!entries) return null
    if (!q) return entries
    return entries.filter(e => matcher(basename(e.key)))
  }, [entries, q, matcher])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!entries || !filtered) return <div style={{ opacity: 0.6 }}>loading {prefix}…</div>

  const filterUI = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.5em', fontSize: '0.9em' }}>
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={filterPlaceholder}
        style={{
          padding: '0.3em 0.6em',
          borderRadius: 4,
          border: '1px solid rgba(127,127,127,0.4)',
          background: 'rgba(127,127,127,0.08)',
          color: 'inherit',
          fontFamily: 'ui-monospace, monospace',
          minWidth: '20em',
        }}
      />
      <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
        {q ? <>{filtered.length} / {entries.length}</> : <>{entries.length} entries</>}
      </span>
      {q && (
        <button onClick={() => setQ('')} style={{ fontSize: '0.85em', padding: '0.2em 0.6em' }}>clear</button>
      )}
    </div>
  )

  if (filtered.length === 0) {
    return (
      <>
        {filterUI}
        <div style={{ opacity: 0.6 }}>
          {q ? <>no entries match <code>{q}</code></> : <>empty: <code>{prefix}</code></>}
        </div>
      </>
    )
  }

  const baseTrimmed = routeBase.replace(/\/+$/, '')
  return (
    <>
      {filterUI}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', opacity: 0.7 }}>
            <th style={{ padding: '0.2em 0.6em 0.2em 0', fontWeight: 400 }}>name</th>
            <th style={{ padding: '0.2em 0.6em', fontWeight: 400, textAlign: 'right' }}>size</th>
            <th style={{ padding: '0.2em 0', fontWeight: 400, textAlign: 'right' }}>modified</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(e => {
            const name = basename(e.key)
            const splat = keyToSplat(e.key, rootPrefix)
            const href = `${baseTrimmed}/${splat}`
            const rowPath = splat.replace(/\/+$/, '')
            const cell = (column: CellColumn, defaultNode: ReactNode) =>
              renderCell ? renderCell({ entry: e, column, prefix, href, defaultNode }) : defaultNode
            return (
              <tr
                key={e.key}
                onMouseEnter={onHoverPath ? () => onHoverPath(rowPath) : undefined}
                onMouseLeave={onHoverPath ? () => onHoverPath(null) : undefined}
                style={{
                  borderTop: '1px solid rgba(127,127,127,0.2)',
                  background: highlightedPath === rowPath ? 'rgba(127,127,127,0.16)'
                    : selectedPath === rowPath ? 'rgba(74,158,255,0.18)'
                      : undefined,
                }}
              >
                <td style={{ padding: '0.3em 0.6em 0.3em 0', fontFamily: 'ui-monospace, monospace' }}>
                  {cell('name', (
                    <Link to={href}>
                      {e.isDir ? <span style={{ opacity: 0.6 }}>📁 </span> : null}
                      {name}{e.isDir ? '/' : ''}
                    </Link>
                  ))}
                </td>
                <td style={{ padding: '0.3em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: e.isDir && !dirSizes?.has(e.key) ? 0.4 : 1 }}>
                  {cell('size', e.isDir ? dirSize(dirSizes, e.key) : fmtSize(e.size))}
                </td>
                <td style={{ padding: '0.3em 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.6, fontSize: '0.9em' }}>
                  {cell('modified', e.lastModified?.slice(0, 10) ?? '')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {cursor && (
        <button onClick={loadMore} style={{ marginTop: '0.5em' }}>load more</button>
      )}
      {markdownRenderer && (
        <DefaultReadme store={store} entries={entries} markdownRenderer={markdownRenderer} />
      )}
    </>
  )
}

/** Find the directory's `README.md` (case-insensitive basename match) and
 *  render it below the listing. Renders nothing when no README is present
 *  or the fetch fails (404/network), so the dir UI stays clean. */
function DefaultReadme({ store, entries, markdownRenderer }: { store: Store; entries: Entry[]; markdownRenderer: (source: string) => ReactNode }) {
  const readme = entries.find(e => !e.isDir && /^README\.md$/i.test(basename(e.key)))
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    setText(null)
    if (!readme) return
    let cancelled = false
    store.get(readme.key).then(r => {
      if (cancelled) return
      setText(new TextDecoder().decode(r.bytes))
    }).catch(() => { /* swallow — README is best-effort */ })
    return () => { cancelled = true }
  }, [store, readme?.key])
  if (!readme || text == null) return null
  return (
    <div
      className="rdub-file-tree-default-readme"
      data-readme-key={readme.key}
      style={{
        marginTop: '1.5em',
        padding: '0.8em 1em',
        border: '1px solid rgba(127,127,127,0.25)',
        borderRadius: 6,
        background: 'rgba(127,127,127,0.04)',
      }}
    >
      <div style={{ fontSize: '0.8em', opacity: 0.6, fontFamily: 'ui-monospace, monospace', marginBottom: '0.5em' }}>
        {basename(readme.key)}
      </div>
      {markdownRenderer(text)}
    </div>
  )
}
