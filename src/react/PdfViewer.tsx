/** Inline PDF viewer.
 *
 *  Preferred path: when the store exposes `getUrl(path)`, render an
 *  `<iframe>` with `src={store.getUrl(path)}` — Chrome renders the PDF
 *  natively (no pdf.js), and the browser handles range requests itself.
 *
 *  Fallback: stores without `getUrl` (in-memory `MockStore`, CFW R2 binding
 *  surfaced through the lib, signed `S3Store`) go through `store.get(path)`
 *  + `URL.createObjectURL(new Blob(...))`. The blob's type is forced to
 *  `application/pdf` regardless of what the store reports — a store that
 *  reports `application/octet-stream` would otherwise trigger a download
 *  rather than an inline render. */
import { useEffect, useState } from 'react'
import type { Store } from '../types'

export interface PdfViewerProps {
  store: Store
  path: string
}

export function PdfViewer({ store, path }: PdfViewerProps) {
  const direct = typeof store.getUrl === 'function' ? store.getUrl(path) : null
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (direct) return
    let cancelled = false
    let createdUrl: string | null = null
    setBlobUrl(null); setError(null)
    store.get(path).then(r => {
      if (cancelled) return
      const blob = new Blob([r.bytes as BlobPart], { type: 'application/pdf' })
      createdUrl = URL.createObjectURL(blob)
      setBlobUrl(createdUrl)
    }).catch(e => {
      if (!cancelled) setError(String(e))
    })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [store, path, direct])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  const src = direct ?? blobUrl
  if (!src) return <div style={{ opacity: 0.6 }}>loading {path}…</div>

  return (
    <iframe
      src={src}
      title={path}
      style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 4 }}
    />
  )
}
