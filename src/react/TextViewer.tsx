import { useEffect, useState, type ReactNode } from 'react'
import type { Store } from '../types'
import { fmtSize } from './fmt'
import type { PersistedState } from './persistedState'

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
   *  qualify (typically `.json`). The second arg is the resolved
   *  `usePersistedState` hook — forward it to enable URL-state for
   *  the JSON viewer's search / jq inputs. */
  jsonRenderer?: (source: string, usePersistedState?: PersistedState) => ReactNode
  /** When provided, render the bytes as syntax-highlighted code via
   *  this fn (`(source, lang) => ReactNode`). Caller decides which
   *  extensions qualify + supplies the `lang` hint. */
  codeRenderer?: (source: string, lang: string) => ReactNode
  /** Language hint passed to `codeRenderer`. */
  codeLang?: string
  /** Persisted-state hook threaded down from `<FileTree>` (forwarded
   *  to `jsonRenderer` for URL-state binding). */
  usePersistedState?: PersistedState
}

export function TextViewer({ store, path, markdownRenderer, jsonRenderer, codeRenderer, codeLang, usePersistedState }: TextViewerProps) {
  const [text, setText] = useState<string | null>(null)
  const [totalSize, setTotalSize] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Custom renderers (markdown / json / code) want the whole document;
  // partial input breaks parsers + highlighters. Plain `<pre>` is fine
  // with a head-only fetch + "load all" button.
  const fetchFull = !!markdownRenderer || !!jsonRenderer || !!codeRenderer

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
          {jsonRenderer(text, usePersistedState)}
        </div>
      ) : codeRenderer ? (
        <div className="rdub-file-tree-code" data-path={path} data-lang={codeLang}>
          {codeRenderer(text, codeLang ?? '')}
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
