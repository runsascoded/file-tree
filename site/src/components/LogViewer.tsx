/** A format the library has never heard of, registered by the consumer.
 *
 *  `.log` isn't in `parsePath`'s extension table and there's no
 *  `logRenderer` prop — this reaches the page purely through
 *  `<FileTree viewers>`, and lands in its own chunk because the entry's
 *  `load` is a dynamic import. Open a `.log` in the demo and watch the
 *  network tab: the chunk arrives then, not on first paint.
 *
 *  Deliberately trivial. The point is the wiring, not the viewer. */
import { useEffect, useState } from 'react'
import type { Store } from '@rdub/file-tree'

const LEVEL = /^\[(\w+)\]\s*(.*)$/
const COLORS: Record<string, string> = {
  ERROR: '#e53935', WARN: '#fb8c00', INFO: '#43a047', DEBUG: '#8e9aa6',
}

export default function LogViewer({ store, path }: { store: Store; path: string }) {
  const [lines, setLines] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLines(null); setError(null)
    store.get(path).then(r => {
      if (cancelled) return
      setLines(new TextDecoder().decode(r.bytes).split('\n').filter(Boolean))
    }).catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!lines) return <div style={{ opacity: 0.6 }}>reading log…</div>

  return (
    <pre style={{ fontSize: '0.85em', lineHeight: 1.6, margin: 0 }}>
      {lines.map((line, i) => {
        const m = LEVEL.exec(line)
        if (!m) return <div key={i}>{line}</div>
        const [, level, rest] = m
        return (
          <div key={i}>
            <span style={{ color: COLORS[level!] ?? 'inherit', fontWeight: 600 }}>{level}</span>
            {' '}{rest}
          </div>
        )
      })}
    </pre>
  )
}
