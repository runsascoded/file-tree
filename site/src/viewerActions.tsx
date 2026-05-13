/** Demo `viewerActions` factory. Shows the slot's shape: render
 *  consumer-specific links next to the download icon, scoped by file
 *  kind. Here we surface an "↗ open in SQL" link for any tabular
 *  format (parquet/csv) — wire your own DuckDB-WASM REPL behind the
 *  `/sql` route to make it functional. */
import { Link } from 'react-router-dom'
import type { ViewerActionCtx } from '@rdub/file-tree/react'

const linkStyle = { fontSize: '0.85em', textDecoration: 'none', opacity: 0.85 }

export function renderViewerActions({ store, path, kind }: ViewerActionCtx) {
  if (kind !== 'parquet' && kind !== 'text') return null
  // For text we restrict to CSVs / TSVs (parquet is unconditional).
  if (kind === 'text' && !/\.(csv|tsv)$/i.test(path)) return null
  // Prefer the store's direct URL (the SQL page reads it via DuckDB
  // `read_parquet` / `read_csv`); fall back to a relative path that a
  // server-side route can resolve.
  const url = typeof store.getUrl === 'function' ? store.getUrl(path) : path
  return (
    <Link to={`/sql?url=${encodeURIComponent(url)}`} title="Open in SQL REPL" style={linkStyle}>
      ↗ SQL
    </Link>
  )
}
