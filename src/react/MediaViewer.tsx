/** Inline image / video viewer.
 *
 *  Preferred path: when the store exposes `getUrl(path)`, render `<img>` /
 *  `<video>` with `src={store.getUrl(path)}` — the browser handles range
 *  requests, streaming, and `seek` natively for media (way better than
 *  fetching all bytes into a Blob).
 *
 *  Fallback: stores without `getUrl` (in-memory `MockStore`, CFW R2 binding
 *  surfaced through the lib, signed `S3Store`) go through `store.get(path)`
 *  + `URL.createObjectURL(new Blob(...))`. Acceptable for images; for large
 *  videos it'll buffer the whole file — accept that or wire an HTTP proxy. */
import { useEffect, useState } from 'react'
import type { Store } from '../types'

export type MediaKind = 'image' | 'video' | 'audio'

export interface MediaViewerProps {
  store: Store
  path: string
  kind: MediaKind
}

export function MediaViewer({ store, path, kind }: MediaViewerProps) {
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
      const blob = new Blob([r.bytes as BlobPart], r.contentType ? { type: r.contentType } : {})
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

  if (kind === 'image') {
    return (
      <img
        src={src}
        alt={path}
        style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', borderRadius: 4 }}
      />
    )
  }
  if (kind === 'audio') {
    return (
      <audio
        src={src}
        controls
        preload="metadata"
        style={{ display: 'block', width: '100%', maxWidth: 600 }}
      />
    )
  }
  return (
    <video
      src={src}
      controls
      preload="metadata"
      style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', borderRadius: 4 }}
    />
  )
}
