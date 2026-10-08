/** Tarball member listing (`.tar`, `.tar.gz` / `.tgz`, `.tar.zst`).
 *  Files link to `<routeBase>/<path>!/<member>`, the same pkzip-style
 *  form zip entries use. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Store } from '../types'
import { fmtSize } from './fmt'
import { keyToSplat, type Codec } from './parsePath'
import { readTar, type TarArchive } from './tar'

export interface TarEntryListProps {
  store: Store
  path: string
  codec?: Codec
  routeBase: string
  rootPrefix?: string
}

const TD = { padding: '0.3em 0.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const

export function TarEntryList({ store, path, codec, routeBase, rootPrefix = '' }: TarEntryListProps) {
  const [archive, setArchive] = useState<TarArchive | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setArchive(null); setError(null)
    readTar(store, path, codec)
      .then(a => { if (!cancelled) setArchive(a) })
      .catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path, codec])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!archive) return <div style={{ opacity: 0.6 }}>reading {path}…</div>

  const href = (name: string) => `${routeBase.replace(/\/+$/, '')}/${keyToSplat(path, rootPrefix)}!/${name}`
  const files = archive.entries.filter(e => e.type === 'file')
  const total = files.reduce((n, e) => n + e.size, 0)

  return (
    <>
      <p style={{ opacity: 0.7, fontSize: '0.95em', margin: '0 0 0.6em' }}>
        <b>{files.length}</b> files · <b>{fmtSize(total)}</b>
        {codec && <> · {codec}</>}
      </p>
      {archive.truncated && (
        <p data-testid="tar-truncated" style={{ fontSize: '0.9em', margin: '0 0 0.6em', color: 'rgb(220,165,60)' }}>
          Archive read stopped at {fmtSize(archive.bytes.byteLength)}; members past that point aren't listed.
        </p>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', opacity: 0.7 }}>
            <th style={{ padding: '0.2em 0.6em 0.2em 0', fontWeight: 400 }}>name</th>
            <th style={{ ...TD, padding: '0.2em 0.6em', fontWeight: 400 }}>size</th>
            <th style={{ ...TD, padding: '0.2em 0', fontWeight: 400 }}>modified</th>
          </tr>
        </thead>
        <tbody>
          {archive.entries.map(e => (
            <tr key={e.name} style={{ borderTop: '1px solid rgba(127,127,127,0.2)' }}>
              <td style={{ padding: '0.3em 0.6em 0.3em 0', fontFamily: 'ui-monospace, monospace' }}>
                {e.type === 'file'
                  ? <Link to={href(e.name)}>{e.name}</Link>
                  : <span style={{ opacity: 0.7 }}>{e.name}{e.linkName ? ` → ${e.linkName}` : ''}</span>}
              </td>
              <td style={TD}>{e.type === 'file' ? fmtSize(e.size) : ''}</td>
              <td style={{ ...TD, padding: '0.3em 0', opacity: 0.7 }}>{e.lastModified?.slice(0, 10) ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
