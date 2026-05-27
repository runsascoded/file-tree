import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useUrlState, defStringParam } from 'use-prms'
import type { Entry, Store } from '../types'
import { fmtSize } from './fmt'
import { makeMatcher } from './match'
import { basename, keyToSplat } from './parsePath'

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
  /** When set + a `README.md` (case-insensitive) is in the listing, the
   *  README is fetched and rendered below the table via this fn. */
  markdownRenderer?: (source: string) => ReactNode
}

export function DirListing({ store, prefix, routeBase, rootPrefix = '', q: qExternal, setQ: setQExternal, filterPlaceholder = 'filter', markdownRenderer }: DirListingProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  // When uncontrolled, route filter through `?q=…` URL state so it's
  // shareable + survives reload. (Controlled callers manage their
  // own state.)
  const [qUrl, setQUrl] = useUrlState('q', defStringParam(''))
  const q = qExternal ?? qUrl
  const setQ = setQExternal ?? setQUrl

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
            return (
              <tr key={e.key} style={{ borderTop: '1px solid rgba(127,127,127,0.2)' }}>
                <td style={{ padding: '0.3em 0.6em 0.3em 0', fontFamily: 'ui-monospace, monospace' }}>
                  <Link to={href}>
                    {e.isDir ? <span style={{ opacity: 0.6 }}>📁 </span> : null}
                    {name}{e.isDir ? '/' : ''}
                  </Link>
                </td>
                <td style={{ padding: '0.3em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: e.isDir ? 0.4 : 1 }}>
                  {e.isDir ? '—' : fmtSize(e.size)}
                </td>
                <td style={{ padding: '0.3em 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.6, fontSize: '0.9em' }}>
                  {e.lastModified?.slice(0, 10) ?? ''}
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
