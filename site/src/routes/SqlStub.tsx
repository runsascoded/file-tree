/** Stub `/sql` route. Echoes the `?url=...` query param so the demo can
 *  prove `viewerActions` wires through end-to-end. A real consumer
 *  would mount a DuckDB-WASM REPL here (see crashes' `SqlPage` for a
 *  reference impl). */
import { useSearchParams } from 'react-router-dom'

export function SqlStub() {
  const [params] = useSearchParams()
  const url = params.get('url') ?? ''
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5em' }}>
      <h1 style={{ fontSize: '1.4em', margin: '0 0 0.3em' }}>SQL (stub)</h1>
      <p style={{ fontSize: '0.95em', opacity: 0.8, margin: '0 0 0.8em' }}>
        Placeholder route for the <code>viewerActions</code> demo. A real consumer would mount a
        DuckDB-WASM REPL here and run e.g.
      </p>
      {url ? (
        <pre style={{
          background: 'rgba(127,127,127,0.08)',
          padding: '0.6em 0.8em',
          borderRadius: 4,
          overflow: 'auto',
          fontSize: '0.85em',
          fontFamily: 'ui-monospace, monospace',
          whiteSpace: 'pre-wrap',
        }}>{`SELECT * FROM ${guessReader(url)}('${url}') LIMIT 100;`}</pre>
      ) : (
        <p style={{ opacity: 0.7 }}>No <code>?url=...</code> provided.</p>
      )}
      <p style={{ fontSize: '0.85em', opacity: 0.65, marginTop: '1em' }}>
        Came from a file viewer? <a href={url} target="_blank" rel="noreferrer">open the raw file</a>.
      </p>
    </div>
  )
}

function guessReader(url: string): string {
  if (/\.parquet$|\.pqt$/i.test(url)) return 'read_parquet'
  if (/\.csv$/i.test(url)) return 'read_csv'
  if (/\.tsv$/i.test(url)) return 'read_csv'
  return 'read_csv'
}
