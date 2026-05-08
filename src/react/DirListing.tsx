import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
}

export function DirListing({ store, prefix, routeBase, rootPrefix = '', q: qExternal, setQ: setQExternal }: DirListingProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [qInternal, setQInternal] = useState('')
  const q = qExternal ?? qInternal
  const setQ = setQExternal ?? setQInternal

  useEffect(() => {
    let cancelled = false
    setEntries(null); setError(null); setCursor(undefined)
    store.list(prefix).then(r => {
      if (cancelled) return
      setEntries(r.entries)
      setCursor(r.cursor)
    }).catch(e => {
      if (cancelled) return
      setError(String(e))
    })
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
        placeholder="filter (e.g. NewJersey* or pedestr)"
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
    </>
  )
}
