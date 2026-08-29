/** Where a table's rows come from.
 *
 *  The table-shaped viewers each grew their own answer to "give me rows
 *  `[offset, offset+limit)`, sorted and filtered": parquet reads a row
 *  group, CSV reads a byte range, and both sort and filter in memory
 *  once the file is small enough to load whole. That works because
 *  neither format can do better — there is nothing to ask.
 *
 *  SQLite can. Its whole point is that the engine does the paging,
 *  sorting and filtering, and materialising a table in JS to sort it
 *  would be throwing that away. So the difference between formats isn't
 *  *whether* they page, it's **what they can push down** — which is what
 *  this interface names.
 *
 *  Reading `~/c/ire/www` is what made the shape obvious: its abstract
 *  `Table.page()` is why a browser running wasm and a server running
 *  native SQLite could share one UI. This is that seam, minus the
 *  `fp-ts` task machinery, and with capabilities made explicit so the
 *  viewer can hide a control rather than offer one that silently lies.
 *
 *  See `specs/sqlite-and-table-sources.md`.
 */
import type { TableColumn } from './table'

/** What a source can do without the viewer falling back to memory.
 *
 *  A viewer reads these to decide what chrome to render: a source that
 *  can't sort shouldn't show sortable headers, because a header that
 *  looks clickable and isn't is worse than no header affordance. */
export interface TableSourceCapabilities {
  /** `order by` is pushed down. */
  sort: boolean
  /** The free-text filter is pushed down. */
  filter: boolean
  /** `total` is populated. Sources that would have to scan to count say
   *  `false` and return `null` rather than stalling a first paint. */
  total: boolean
  /** Rows can be fetched at an arbitrary offset. False means the source
   *  is forward-only and the pager should offer next/prev, not page
   *  numbers. */
  randomAccess: boolean
}

export interface PageRequest {
  /** First row to return, counting matching rows from zero. */
  offset: number
  limit: number
  /** Absent means the source's natural order. */
  sort?: { column: string; dir: 'asc' | 'desc' }
  /** Free text, matched anywhere in any column, case-insensitively —
   *  the same idiom as the directory listing and the JSON tree, because
   *  it's "the search box on this page" rather than a third thing to
   *  learn. Empty string means no filter. */
  filter?: string
}

export interface PageResult<C extends TableColumn = TableColumn> {
  rows: Record<string, unknown>[]
  /** Columns of the returned rows, in order. */
  columns: readonly C[]
  /** Rows matching the request's filter, or `null` when the source
   *  can't say — see `TableSourceCapabilities['total']`. */
  total: number | null
  /** Index of the first returned row, echoed back so a viewer can label
   *  the page without assuming its request was honoured exactly. */
  offset: number
}

export interface TableSource<C extends TableColumn = TableColumn> {
  columns(): Promise<readonly C[]>
  page(req: PageRequest): Promise<PageResult<C>>
  readonly capabilities: TableSourceCapabilities
}

/** One thing inside a file that renders as a table. */
export interface TableObject {
  name: string
  /** `view` is worth distinguishing because it explains why a thing is
   *  slower, or read-only, or absent from the schema you expected. */
  type: 'table' | 'view'
  /** Its definition, where the format has one. */
  sql?: string | null
}

/** A file that contains several tables.
 *
 *  The layer that lets one component render a database whether the
 *  engine is running in this tab or behind an HTTP endpoint. A
 *  single-table format (a parquet file, a CSV) is the degenerate case:
 *  one object, one source.
 */
export interface TableCatalog<C extends TableColumn = TableColumn> {
  objects(): Promise<readonly TableObject[]>
  source(name: string): TableSource<C>
}

/** SQLite's type-affinity rules, reduced to the coarse `kind` the table
 *  viewers render on.
 *
 *  These are the actual rules from the SQLite documentation's "Determination
 *  of Column Affinity", in order — the substring tests matter, since
 *  `VARCHAR(20)`, `BIGINT` and `DOUBLE PRECISION` all have to land
 *  somewhere and none of them match a type name exactly. The one
 *  addition is picking `temporal` out of the affinities SQLite lumps
 *  under NUMERIC/TEXT, because a `DATE` column reads very differently
 *  from a string. */
export function kindOfDeclaredType(declared: string): TableColumn['kind'] {
  const t = declared.toUpperCase()
  if (t.includes('INT')) return 'number'
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'string'
  if (t.includes('BLOB') || t === '') return 'binary'
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'number'
  if (t.includes('DATE') || t.includes('TIME')) return 'temporal'
  if (t.includes('BOOL')) return 'boolean'
  if (t.includes('DEC') || t.includes('NUM')) return 'number'
  return 'string'
}
