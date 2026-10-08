/** JSONL / NDJSON as a table: one record per row, top-level keys as
 *  columns, over `<RowsTable>` — so sort, filter, paging, the column
 *  picker, resizing, `ditto` runs and `paths` elision all apply.
 *
 *  Nested values (objects, arrays) are shown as compact JSON in their
 *  cell, and elided like any long value; a record that isn't an object
 *  lands in a `value` column. A Text toggle shows the source lines.
 *
 *  Reads are bounded (`maxBytes`, `maxRows`): above either, the table
 *  holds the head of the file and says so. Wire as
 *  `<FileTree jsonlRenderer={JsonlViewer}>`. */
import { useEffect, useMemo, useState } from 'react'
import type { Store } from '../types'
import { fmtSize } from '../react/fmt'
import type { PersistedState } from '../react/persistedState'
import { RowsTable, type RowsTableOptions } from './rowsTable'
import { BTN } from './tableBrowser'

/** Bytes read. Above this, the head is read and its last partial line
 *  dropped. */
export const JSONL_MAX_BYTES = 16 * 1024 * 1024
/** Records kept. */
export const JSONL_MAX_ROWS = 10_000
/** Source text shown in Text mode. */
const TEXT_SHOW_BYTES = 1024 * 1024

export interface JsonlParse {
  rows: Record<string, unknown>[]
  /** Lines that weren't valid JSON: 1-based line number + parser message. */
  errors: { line: number; message: string }[]
  /** More records followed than `maxRows` kept. */
  truncated: boolean
}

/** A cell value: primitives as themselves, nested values as compact
 *  JSON (so they sort, filter and elide as text). */
function cell(v: unknown): unknown {
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
}

/** Parse line-delimited JSON. Blank lines are skipped; a final line
 *  without a newline counts. */
export function parseJsonl(text: string, opts: { maxRows?: number } = {}): JsonlParse {
  const maxRows = opts.maxRows ?? JSONL_MAX_ROWS
  const rows: Record<string, unknown>[] = []
  const errors: JsonlParse['errors'] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (rows.length >= maxRows) return { rows, errors, truncated: true }
    let v: unknown
    try {
      v = JSON.parse(line)
    } catch (e) {
      errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) })
      continue
    }
    rows.push(v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cell(x)]))
      : { value: cell(v) })
  }
  return { rows, errors, truncated: false }
}

interface Loaded {
  text: string
  /** Bytes the text was decoded from. */
  bytes: number
  /** Whole-object size, when the read stopped short of it. */
  total?: number
}

async function load(store: Store, path: string, maxBytes: number): Promise<Loaded> {
  const r = await store.get(path, store.capabilities?.range ? { offset: 0, length: maxBytes } : undefined)
  const total = r.totalSize ?? r.bytes.byteLength
  if (total <= maxBytes && r.bytes.byteLength <= maxBytes) return { text: new TextDecoder().decode(r.bytes), bytes: r.bytes.byteLength }
  // Cut at the last newline: the line it would split is a partial record.
  const head = r.bytes.subarray(0, Math.min(r.bytes.byteLength, maxBytes))
  const nl = head.lastIndexOf(0x0a)
  const kept = nl >= 0 ? head.subarray(0, nl + 1) : head
  return { text: new TextDecoder().decode(kept), bytes: kept.byteLength, total }
}

export interface JsonlViewerOptions extends Omit<RowsTableOptions, 'columns'> {
  maxBytes?: number
  maxRows?: number
}

/** Options bound up front, like `makeCsvViewer`. Module scope: this
 *  mints a component type. */
export function makeJsonlViewer(opts: JsonlViewerOptions = {}) {
  return function BoundJsonlViewer(props: { store: Store; path: string; usePersistedState?: PersistedState }) {
    return <JsonlViewer {...props} {...opts} />
  }
}

export function JsonlViewer({ store, path, usePersistedState, maxBytes = JSONL_MAX_BYTES, maxRows = JSONL_MAX_ROWS, elide = true, ...table }: {
  store: Store
  path: string
  usePersistedState?: PersistedState
} & JsonlViewerOptions) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'table' | 'text'>('table')

  useEffect(() => {
    let cancelled = false
    setLoaded(null); setError(null)
    load(store, path, maxBytes)
      .then(l => { if (!cancelled) setLoaded(l) })
      .catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path, maxBytes])

  const parsed = useMemo(() => loaded ? parseJsonl(loaded.text, { maxRows }) : null, [loaded, maxRows])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!loaded || !parsed) return <div style={{ opacity: 0.6 }}>loading {path}…</div>

  const notes: string[] = []
  if (loaded.total != null) notes.push(`read the first ${fmtSize(loaded.bytes)} of ${fmtSize(loaded.total)}`)
  if (parsed.truncated) notes.push(`kept the first ${maxRows.toLocaleString()} records`)
  if (parsed.errors.length) {
    const first = parsed.errors[0]
    notes.push(`${parsed.errors.length.toLocaleString()} line${parsed.errors.length === 1 ? '' : 's'} didn't parse (line ${first.line}: ${first.message})`)
  }
  const shownText = loaded.text.length > TEXT_SHOW_BYTES ? loaded.text.slice(0, TEXT_SHOW_BYTES) : loaded.text

  return (
    <div className="rdub-file-tree-jsonl" data-path={path}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', margin: '0 0 0.5em', flexWrap: 'wrap' }}>
        <span role="group" aria-label="JSONL view" style={{ display: 'inline-flex', gap: '0.25em' }}>
          {(['table', 'text'] as const).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              style={{ ...BTN, ...(mode === m ? { background: 'rgba(74,158,255,0.25)' } : {}) }}
            >
              {m === 'table' ? 'Table' : 'Text'}
            </button>
          ))}
        </span>
        {notes.length > 0 && (
          <span data-testid="jsonl-notes" style={{ fontSize: '0.85em', opacity: 0.75 }}>{notes.join(' · ')}</span>
        )}
      </div>
      {mode === 'table'
        ? <RowsTable rows={parsed.rows} path={path} elide={elide} {...(usePersistedState ? { usePersistedState } : {})} {...table} />
        : (
          <pre style={{
            background: 'rgba(127,127,127,0.08)', padding: '0.6em 0.8em', borderRadius: 4,
            overflow: 'auto', maxHeight: '80vh', fontSize: '0.85em', fontFamily: 'ui-monospace, monospace', margin: 0,
          }}>{shownText}{shownText.length < loaded.text.length ? '\n…' : ''}</pre>
        )}
    </div>
  )
}

export default JsonlViewer
