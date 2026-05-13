import { useEffect, useState, type ReactNode } from 'react'
import type { Store } from '../types'
import { fmtSize } from './fmt'

const HEAD_BYTES = 64 * 1024  // 64 KB head fetch — enough for most config / readme files.

export interface TextViewerProps {
  store: Store
  path: string
  /** When provided, render the bytes as rich markdown via this fn
   *  instead of plaintext `<pre>`. Caller decides which extensions
   *  qualify (typically `.md`/`.markdown`). */
  markdownRenderer?: (source: string) => ReactNode
  /** When provided, render the bytes as a JSON tree via this fn
   *  instead of plaintext `<pre>`. Caller decides which extensions
   *  qualify (typically `.json`). */
  jsonRenderer?: (source: string) => ReactNode
}

export function TextViewer({ store, path, markdownRenderer, jsonRenderer }: TextViewerProps) {
  const [text, setText] = useState<string | null>(null)
  const [totalSize, setTotalSize] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Markdown + JSON renderers want the whole document (partial input
  // breaks parsers); plain `<pre>` is fine with a head-only fetch +
  // "load all" button.
  const fetchFull = !!markdownRenderer || !!jsonRenderer

  useEffect(() => {
    let cancelled = false
    setText(null); setError(null); setTotalSize(undefined)
    const range = !fetchFull && store.capabilities?.range ? { offset: 0, length: HEAD_BYTES } : undefined
    store.get(path, range).then(r => {
      if (cancelled) return
      setText(new TextDecoder().decode(r.bytes))
      setTotalSize(r.totalSize)
    }).catch(e => {
      if (cancelled) return
      setError(String(e))
    })
    return () => { cancelled = true }
  }, [store, path, fetchFull])

  async function loadAll() {
    if (totalSize == null) return
    setLoadingMore(true)
    try {
      const r = await store.get(path)
      setText(new TextDecoder().decode(r.bytes))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (text == null) return <div style={{ opacity: 0.6 }}>loading {path}…</div>

  const truncated = totalSize != null && text.length < totalSize
  return (
    <>
      {markdownRenderer ? (
        <div className="rdub-file-tree-markdown" data-path={path}>
          {markdownRenderer(text)}
        </div>
      ) : jsonRenderer ? (
        <div className="rdub-file-tree-json" data-path={path}>
          {jsonRenderer(text)}
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
      {truncated && (
        <div style={{ marginTop: '0.5em', fontSize: '0.85em', opacity: 0.7 }}>
          showing first {fmtSize(text.length)} of {fmtSize(totalSize)}{' '}
          <button onClick={loadAll} disabled={loadingMore}>
            {loadingMore ? 'loading…' : 'load all'}
          </button>
        </div>
      )}
    </>
  )
}
