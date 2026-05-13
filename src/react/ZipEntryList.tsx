/** Default zip listing component. Uses `store.getZipEntries?(path)`
 *  when defined (server-side path); otherwise parses the central
 *  directory client-side via range reads. Linked entries route to
 *  `<routeBase>/<path>!/<entry>` (file-tree's pkzip-style URI form). */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Store, ZipEntriesResult } from '../types'
import { fmtSize } from './fmt'
import { keyToSplat } from './parsePath'
import { readZipEntries } from './zip'

export interface ZipEntryListProps {
  store: Store
  path: string
  /** Route base for the surrounding `<FileTree>` mount. */
  routeBase: string
  /** Root prefix, mirroring `<FileTree rootPrefix>`. */
  rootPrefix?: string
}

export function ZipEntryList({ store, path, routeBase, rootPrefix = '' }: ZipEntryListProps) {
  const [resp, setResp] = useState<ZipEntriesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResp(null); setError(null)
    const fetcher = store.getZipEntries
      ? store.getZipEntries.bind(store)
      : (p: string) => readZipEntries(store, p)
    fetcher(path).then(r => {
      if (!cancelled) setResp(r)
    }).catch(e => {
      if (!cancelled) setError(String(e))
    })
    return () => { cancelled = true }
  }, [store, path])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!resp) return <div style={{ opacity: 0.6 }}>reading central directory of {path}…</div>

  const baseTrimmed = routeBase.replace(/\/+$/, '')
  const splat = keyToSplat(path, rootPrefix)

  return (
    <>
      <p style={{ opacity: 0.7, fontSize: '0.95em', margin: '0 0 0.6em' }}>
        <b>{resp.entries.length}</b> entries · uncompressed{' '}
        <b>{fmtSize(resp.totalSize)}</b> · compressed{' '}
        <b>{fmtSize(resp.totalCompressed)}</b>
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', opacity: 0.7 }}>
            <th style={{ padding: '0.2em 0.6em 0.2em 0', fontWeight: 400 }}>name</th>
            <th style={{ padding: '0.2em 0.6em', fontWeight: 400, textAlign: 'right' }}>size</th>
            <th style={{ padding: '0.2em 0.6em', fontWeight: 400, textAlign: 'right' }}>compressed</th>
            <th style={{ padding: '0.2em 0', fontWeight: 400, textAlign: 'right' }}>method</th>
          </tr>
        </thead>
        <tbody>
          {resp.entries.map(e => {
            const href = `${baseTrimmed}/${splat}!/${e.name}`
            const methodLabel = e.method === 0 ? 'store' : e.method === 8 ? 'deflate' : `m${e.method}`
            return (
              <tr key={e.name} style={{ borderTop: '1px solid rgba(127,127,127,0.2)' }}>
                <td style={{ padding: '0.3em 0.6em 0.3em 0', fontFamily: 'ui-monospace, monospace' }}>
                  <Link to={href}>{e.name}</Link>
                </td>
                <td style={{ padding: '0.3em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSize(e.size)}
                </td>
                <td style={{ padding: '0.3em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>
                  {fmtSize(e.compressedSize)}
                </td>
                <td style={{ padding: '0.3em 0', textAlign: 'right', opacity: 0.7, fontSize: '0.9em' }}>
                  {methodLabel}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
