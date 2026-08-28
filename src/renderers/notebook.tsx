/** Jupyter notebook (.ipynb) viewer. Fetches the whole notebook,
 *  parses cells, and renders markdown cells via the bundled markdown
 *  renderer + code cells in a `<pre>` block. Outputs handled:
 *
 *    - `stream` (stdout/stderr): plain `<pre>`
 *    - `execute_result` / `display_data` `text/plain`: plain `<pre>`
 *    - `execute_result` / `display_data` `image/png` / `image/jpeg`: inline base64
 *    - `execute_result` / `display_data` `text/html`: rendered (raw HTML)
 *    - `error`: red traceback
 *
 *  Anything else falls through to a JSON dump of the output.
 *
 *  Pulls in `react-markdown` + `remark-gfm` (the markdown renderer's
 *  optional peers) transitively. Notebooks are inherently markdown+code,
 *  so a notebook viewer that can't render markdown isn't useful. */
import { useEffect, useState } from 'react'
import type { Store } from '../types'
import { renderMarkdown } from './markdown'

type CellSource = string | string[]

interface OutputBase { output_type: string }
interface StreamOutput extends OutputBase { output_type: 'stream'; name: 'stdout' | 'stderr'; text: CellSource }
interface DataOutput extends OutputBase {
  output_type: 'execute_result' | 'display_data'
  data: Record<string, CellSource>
  execution_count?: number
}
interface ErrorOutput extends OutputBase { output_type: 'error'; ename: string; evalue: string; traceback: string[] }
type CellOutput = StreamOutput | DataOutput | ErrorOutput | OutputBase

interface BaseCell { cell_type: string; source: CellSource; metadata?: Record<string, unknown> }
interface MarkdownCell extends BaseCell { cell_type: 'markdown' }
interface CodeCell extends BaseCell { cell_type: 'code'; outputs: CellOutput[]; execution_count?: number | null }
interface RawCell extends BaseCell { cell_type: 'raw' }
type Cell = MarkdownCell | CodeCell | RawCell | BaseCell

interface Notebook {
  cells: Cell[]
  metadata?: { kernelspec?: { display_name?: string; name?: string } }
  nbformat?: number
}

function asString(src: CellSource): string {
  return Array.isArray(src) ? src.join('') : src
}

export function NotebookViewer({ store, path }: { store: Store; path: string }) {
  const [nb, setNb] = useState<Notebook | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setNb(null); setError(null)
    store.get(path).then(r => {
      if (cancelled) return
      const text = new TextDecoder().decode(r.bytes)
      try {
        setNb(JSON.parse(text) as Notebook)
      } catch (e) {
        setError(String(e))
      }
    }).catch(e => {
      if (!cancelled) setError(String(e))
    })
    return () => { cancelled = true }
  }, [store, path])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!nb) return <div style={{ opacity: 0.6 }}>loading notebook…</div>

  return (
    <div className="rdub-file-tree-notebook">
      {nb.metadata?.kernelspec?.display_name && (
        <p style={{ fontSize: '0.85em', opacity: 0.65, margin: '0 0 0.8em' }}>
          kernel: <code>{nb.metadata.kernelspec.display_name}</code>
        </p>
      )}
      {nb.cells.map((cell, i) => <CellView key={i} cell={cell} />)}
    </div>
  )
}

function CellView({ cell }: { cell: Cell }) {
  if (cell.cell_type === 'markdown') {
    return (
      <div style={{ margin: '0.8em 0' }}>
        {renderMarkdown(asString(cell.source))}
      </div>
    )
  }
  if (cell.cell_type === 'code') {
    const code = cell as CodeCell
    return (
      <div style={{ margin: '0.8em 0' }}>
        <div style={{ display: 'flex', gap: '0.5em', alignItems: 'flex-start' }}>
          <code style={{ flexShrink: 0, opacity: 0.5, fontSize: '0.8em', paddingTop: '0.7em', minWidth: '3em', textAlign: 'right' }}>
            [{code.execution_count ?? ' '}]:
          </code>
          <pre style={{
            flex: 1,
            background: 'rgba(64, 96, 160, 0.08)',
            padding: '0.6em 0.8em',
            borderRadius: 4,
            overflow: 'auto',
            fontSize: '0.85em',
            fontFamily: 'ui-monospace, monospace',
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}>{asString(code.source)}</pre>
        </div>
        {code.outputs?.map((o, i) => <OutputView key={i} output={o} />)}
      </div>
    )
  }
  if (cell.cell_type === 'raw') {
    return (
      <pre style={{ margin: '0.8em 0', fontSize: '0.85em', opacity: 0.7 }}>{asString(cell.source)}</pre>
    )
  }
  return null
}

function OutputView({ output }: { output: CellOutput }) {
  const baseStyle: React.CSSProperties = {
    background: 'rgba(127,127,127,0.05)',
    padding: '0.4em 0.8em',
    margin: '0.2em 0 0.2em 3.5em',
    borderRadius: 4,
    fontSize: '0.82em',
    fontFamily: 'ui-monospace, monospace',
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
  }
  if (output.output_type === 'stream') {
    const s = output as StreamOutput
    return (
      <pre style={{ ...baseStyle, color: s.name === 'stderr' ? 'salmon' : undefined }}>{asString(s.text)}</pre>
    )
  }
  if (output.output_type === 'error') {
    const e = output as ErrorOutput
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
    return (
      <pre style={{ ...baseStyle, color: 'salmon' }}>{e.traceback.map(stripAnsi).join('\n')}</pre>
    )
  }
  if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
    const d = output as DataOutput
    if (d.data['image/png']) {
      return <img src={`data:image/png;base64,${asString(d.data['image/png']).trim()}`} alt="output" style={{ display: 'block', margin: '0.4em 0 0.4em 3.5em', maxWidth: '100%' }} />
    }
    if (d.data['image/jpeg']) {
      return <img src={`data:image/jpeg;base64,${asString(d.data['image/jpeg']).trim()}`} alt="output" style={{ display: 'block', margin: '0.4em 0 0.4em 3.5em', maxWidth: '100%' }} />
    }
    if (d.data['image/svg+xml']) {
      return (
        <div
          style={{ margin: '0.4em 0 0.4em 3.5em' }}
          dangerouslySetInnerHTML={{ __html: asString(d.data['image/svg+xml']) }}
        />
      )
    }
    if (d.data['text/html']) {
      return (
        <div
          style={{ margin: '0.4em 0 0.4em 3.5em', fontSize: '0.9em' }}
          dangerouslySetInnerHTML={{ __html: asString(d.data['text/html']) }}
        />
      )
    }
    if (d.data['text/plain']) {
      return <pre style={baseStyle}>{asString(d.data['text/plain'])}</pre>
    }
  }
  return null
}

/** Default export so the viewer registry can `load: () => import(…)`
 *  without an unwrapping step. The named export stays for consumers
 *  wiring it through the `*Renderer` props. */
export default NotebookViewer
