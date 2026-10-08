/** A file of no known type: read the head, then show it as text when it
 *  reads as text (no NUL, valid UTF-8 — a `.dat`, an extension-less
 *  `foo.gz` member), else as a hexdump. */
import { useEffect, useState } from 'react'
import type { Store } from '../types'
import { fmtSize } from './fmt'
import { hexdump, looksLikeText } from './hexdump'

/** Bytes shown. A hexdump line is 16 bytes, so this is 256 lines. */
export const HEXDUMP_BYTES = 4096

const PRE = {
  background: 'rgba(127,127,127,0.08)',
  padding: '0.6em 0.8em',
  borderRadius: 4,
  overflow: 'auto',
  maxHeight: '80vh',
  fontSize: '0.85em',
  fontFamily: 'ui-monospace, monospace',
  margin: 0,
} as const

export function BinaryView({ store, path }: { store: Store; path: string }) {
  const [head, setHead] = useState<{ bytes: Uint8Array; total?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHead(null); setError(null)
    store.get(path, store.capabilities?.range ? { offset: 0, length: HEXDUMP_BYTES } : undefined)
      .then(r => {
        if (cancelled) return
        const bytes = r.bytes.subarray(0, HEXDUMP_BYTES)
        setHead({ bytes, total: r.totalSize ?? r.bytes.byteLength })
      })
      .catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!head) return <div style={{ opacity: 0.6 }}>loading {path}…</div>

  const text = looksLikeText(head.bytes)
  const shown = head.total != null && head.total > head.bytes.byteLength
    ? `first ${fmtSize(head.bytes.byteLength)} of ${fmtSize(head.total)}`
    : fmtSize(head.bytes.byteLength)
  return (
    <>
      <div style={{ opacity: 0.7, fontSize: '0.85em', margin: '0 0 0.5em' }}>
        {text ? 'Unknown type; reads as text' : 'Binary'} · {shown}
      </div>
      {text
        ? <pre data-testid="binary-text" style={{ ...PRE, whiteSpace: 'pre-wrap' }}>{new TextDecoder().decode(head.bytes)}</pre>
        : <pre data-testid="hexdump" style={PRE}>{hexdump(head.bytes).join('\n')}</pre>}
    </>
  )
}
