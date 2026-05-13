/** Collapsible JSON tree. Parses the input; on parse failure falls back
 *  to a plain `<pre>` of the raw text so the user always sees something.
 *  Wired as `<FileTree jsonRenderer={renderJsonTree}>`. */
import { useState } from 'react'

const COLORS = {
  key: 'rgb(180, 200, 240)',
  string: 'rgb(220, 180, 130)',
  number: 'rgb(150, 220, 180)',
  bool: 'rgb(220, 150, 200)',
  null: 'rgb(200, 200, 200)',
  punct: 'rgba(180, 180, 180, 0.8)',
  caret: 'rgba(200, 200, 200, 0.8)',
}

const FONT = 'ui-monospace, monospace'
const INDENT = '1.4em'

export function renderJsonTree(source: string) {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (e) {
    return (
      <>
        <div style={{ color: 'salmon', fontSize: '0.85em', marginBottom: '0.4em' }}>
          {String(e)} — showing raw text:
        </div>
        <pre style={{
          background: 'rgba(127,127,127,0.08)',
          padding: '0.6em 0.8em',
          borderRadius: 4,
          overflow: 'auto',
          maxHeight: '80vh',
          fontSize: '0.85em',
          fontFamily: FONT,
          whiteSpace: 'pre-wrap',
        }}>{source}</pre>
      </>
    )
  }
  return (
    <div style={{ fontFamily: FONT, fontSize: '0.85em', overflowX: 'auto', maxHeight: '80vh' }}>
      <Node value={value} initialOpen />
    </div>
  )
}

function Node({ value, initialOpen = false }: { value: unknown; initialOpen?: boolean }) {
  if (value === null) return <span style={{ color: COLORS.null }}>null</span>
  if (typeof value === 'string') return <span style={{ color: COLORS.string }}>"{value}"</span>
  if (typeof value === 'number') return <span style={{ color: COLORS.number }}>{value}</span>
  if (typeof value === 'boolean') return <span style={{ color: COLORS.bool }}>{String(value)}</span>
  if (Array.isArray(value)) return <ArrayNode value={value} initialOpen={initialOpen} />
  if (typeof value === 'object') return <ObjectNode value={value as Record<string, unknown>} initialOpen={initialOpen} />
  return <span>{String(value)}</span>
}

function ArrayNode({ value, initialOpen }: { value: unknown[]; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  if (value.length === 0) return <span style={{ color: COLORS.punct }}>[]</span>
  return (
    <span>
      <Toggle open={open} onClick={() => setOpen(o => !o)} />
      <span style={{ color: COLORS.punct }}>[</span>
      {open ? (
        <div style={{ marginLeft: INDENT }}>
          {value.map((v, i) => (
            <div key={i}>
              <Node value={v} />
              {i < value.length - 1 && <span style={{ color: COLORS.punct }}>,</span>}
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: COLORS.punct, opacity: 0.7 }}> {value.length} items </span>
      )}
      <span style={{ color: COLORS.punct }}>]</span>
    </span>
  )
}

function ObjectNode({ value, initialOpen }: { value: Record<string, unknown>; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  const keys = Object.keys(value)
  if (keys.length === 0) return <span style={{ color: COLORS.punct }}>{'{}'}</span>
  return (
    <span>
      <Toggle open={open} onClick={() => setOpen(o => !o)} />
      <span style={{ color: COLORS.punct }}>{'{'}</span>
      {open ? (
        <div style={{ marginLeft: INDENT }}>
          {keys.map((k, i) => (
            <div key={k}>
              <span style={{ color: COLORS.key }}>"{k}"</span>
              <span style={{ color: COLORS.punct }}>: </span>
              <Node value={value[k]} />
              {i < keys.length - 1 && <span style={{ color: COLORS.punct }}>,</span>}
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: COLORS.punct, opacity: 0.7 }}> {keys.length} keys </span>
      )}
      <span style={{ color: COLORS.punct }}>{'}'}</span>
    </span>
  )
}

function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: COLORS.caret,
        cursor: 'pointer',
        padding: 0,
        marginRight: '0.2em',
        fontFamily: FONT,
        fontSize: 'inherit',
      }}
      aria-label={open ? 'Collapse' : 'Expand'}
    >
      {open ? '▾' : '▸'}
    </button>
  )
}
