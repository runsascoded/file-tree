/** Default zip-entry preview. Inflates one entry (truncated for huge
 *  files) and dispatches by entry extension:
 *
 *    - text-like → decode UTF-8 + plain `<pre>` (markdown renderer
 *      welcomed via `markdownRenderer` prop)
 *    - image → object-URL `<img>`
 *    - otherwise → "preview not supported" + download link
 *
 *  Inflate is bounded by `STREAMING_PREVIEW_BYTES` (default 256 KB) so
 *  arbitrarily large entries don't blow the heap; the banner indicates
 *  truncation. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Store } from '../types'
import { fmtSize } from './fmt'
import { extOf, IMAGE, TEXTY } from './parsePath'
import { readZipEntry } from './zip'

/** Hard cap on entry bytes inflated for inline preview. Entries above
 *  this size stream until the cap is hit, with a banner saying so. */
const STREAMING_PREVIEW_BYTES = 256 * 1024
/** Entries smaller than this skip the streaming-preview UX and inflate
 *  the whole thing (smoother for the common case). */
const FULL_FETCH_THRESHOLD = 4 * 1024 * 1024

export interface ZipEntryPreviewProps {
  store: Store
  path: string
  entry: string
  /** Optional markdown renderer applied to `.md` / `.markdown` entries. */
  markdownRenderer?: (source: string) => ReactNode
}

export function ZipEntryPreview({ store, path, entry, markdownRenderer }: ZipEntryPreviewProps) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [totalSize, setTotalSize] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const ext = useMemo(() => extOf(entry), [entry])

  useEffect(() => {
    let cancelled = false
    setBytes(null); setError(null); setTotalSize(undefined)
    const fetcher = store.getZipEntry
      ? store.getZipEntry.bind(store)
      : (p: string, e: string, opts?: { max?: number }) => readZipEntry(store, p, e, opts)
    // Streaming preview: cap inflate at STREAMING_PREVIEW_BYTES. We
    // don't know the entry's true size until the first byte is read;
    // worst case we cap a small file at its own size (free).
    fetcher(path, entry, { max: STREAMING_PREVIEW_BYTES + 1 }).then(r => {
      if (cancelled) return
      setBytes(r.bytes)
      setTotalSize(r.totalSize)
    }).catch(e => {
      if (!cancelled) setError(String(e))
    })
    return () => { cancelled = true }
  }, [store, path, entry])

  const blobUrl = useMemo(() => {
    if (!bytes || !IMAGE.has(ext)) return null
    return URL.createObjectURL(new Blob([bytes as BlobPart]))
  }, [bytes, ext])
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }, [blobUrl])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!bytes) return <div style={{ opacity: 0.6 }}>inflating {entry}…</div>

  const truncated = totalSize != null && totalSize > FULL_FETCH_THRESHOLD && bytes.byteLength < totalSize
  const banner = truncated && totalSize != null
    ? <TruncationBanner shown={bytes.byteLength} total={totalSize} />
    : null

  if (TEXTY.has(ext)) {
    const text = new TextDecoder().decode(bytes)
    const isMd = ext === 'md' || ext === 'markdown'
    return (
      <>
        {banner}
        {isMd && markdownRenderer ? (
          <div className="rdub-file-tree-markdown" data-entry={entry}>
            {markdownRenderer(text)}
          </div>
        ) : (
          <pre style={{
            background: 'rgba(127,127,127,0.08)',
            padding: '0.6em 0.8em',
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: '80vh',
            fontSize: '0.85em',
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
          }}>{text}</pre>
        )}
      </>
    )
  }

  if (IMAGE.has(ext) && blobUrl) {
    return (
      <>
        {banner}
        <img
          src={blobUrl}
          alt={entry}
          style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', borderRadius: 4 }}
        />
      </>
    )
  }

  return (
    <div style={{ opacity: 0.7 }}>
      Inline preview not supported for <code>.{ext}</code> entries.
    </div>
  )
}

function TruncationBanner({ shown, total }: { shown: number; total: number }) {
  return (
    <div style={{
      background: 'rgba(220, 165, 60, 0.12)',
      border: '1px solid rgba(220, 165, 60, 0.4)',
      padding: '0.5em 0.8em', borderRadius: 4,
      marginBottom: '0.6em', fontSize: '0.9em',
    }}>
      <b>Streaming preview:</b> showing the first {fmtSize(shown)} of {fmtSize(total)}.
    </div>
  )
}
