/** `TableSource` over one SQLite table or view.
 *
 *  Everything is pushed down — `LIMIT`, `OFFSET`, `ORDER BY`, `WHERE` —
 *  which is the reason the seam exists. Nothing here materialises rows
 *  to sort them.
 *
 *  Lives under `src/sqlite/` rather than `src/renderers/` so a Worker
 *  can build one without React anywhere in the graph.
 */
import type { TableColumn } from '../renderers/table'
import {
  kindOfDeclaredType,
  type PageRequest, type PageResult, type TableCatalog, type TableSource, type TableSourceCapabilities,
} from '../renderers/tableSource'
import { quoteIdent, type SqliteDb } from './db'

export interface SqliteTableSourceOptions {
  /** Skip `count(*)` and report `total: null`.
   *
   *  SQLite answers `count(*)` from the smallest covering index rather
   *  than the table, which is cheap on a small database and a full
   *  index scan on a large one. A caller paging a huge table who only
   *  needs next/prev can turn it off. */
  countRows?: boolean
}

const CAPABILITIES: TableSourceCapabilities = {
  sort: true, filter: true, total: true, randomAccess: true,
}

export function sqliteTableSource(
  db: SqliteDb,
  table: string,
  opts: SqliteTableSourceOptions = {},
): TableSource {
  const countRows = opts.countRows ?? true
  const quoted = quoteIdent(table)

  let columnsPromise: Promise<readonly TableColumn[]> | null = null
  /** `count(*)` per distinct filter. The pager asks for a total on every
   *  page of the same filtered view, and the answer doesn't change. */
  const totals = new Map<string, number>()

  async function columns(): Promise<readonly TableColumn[]> {
    columnsPromise ??= db.columns(table).then(cols => cols.map(c => ({
      name: c.name,
      kind: kindOfDeclaredType(c.declaredType),
    })))
    return columnsPromise
  }

  /** `WHERE` matching `filter` anywhere in any column.
   *
   *  Every column is cast to text so a numeric column is searchable by
   *  the digits a reader can see, and `LIKE` is used rather than
   *  `INSTR` because SQLite's `LIKE` is already case-insensitive for
   *  ASCII — which is the case-insensitivity the other filters in this
   *  library offer. */
  async function whereFor(filter: string | undefined) {
    const needle = filter?.trim() ?? ''
    if (!needle) return null
    const cols = await columns()
    if (!cols.length) return null
    const escaped = needle.replace(/[\\%_]/g, m => `\\${m}`)
    return {
      sql: cols
        .map(c => `cast(${quoteIdent(c.name)} as text) like ? escape '\\'`)
        .join(' or '),
      params: cols.map(() => `%${escaped}%`),
    }
  }

  async function page(req: PageRequest): Promise<PageResult> {
    const cols = await columns()
    const where = await whereFor(req.filter)

    // Only a real column may be interpolated into `ORDER BY` — it can't
    // be bound as a parameter, so the allow-list *is* the safety.
    const sortCol = req.sort && cols.some(c => c.name === req.sort!.column)
      ? req.sort
      : undefined

    const sql = [
      `select * from ${quoted}`,
      where ? `where ${where.sql}` : '',
      sortCol ? `order by ${quoteIdent(sortCol.column)} ${sortCol.dir === 'desc' ? 'desc' : 'asc'}` : '',
      'limit ? offset ?',
    ].filter(Boolean).join(' ')

    const { rows } = await db.select(sql, [...(where?.params ?? []), req.limit, req.offset])

    let total: number | null = null
    if (countRows) {
      const key = where?.sql ? JSON.stringify(where.params) : ''
      total = totals.get(key)
        ?? await db.count(table, where ?? undefined).then(n => { totals.set(key, n); return n })
    }

    return { rows, columns: cols, total, offset: req.offset }
  }

  return {
    columns,
    page,
    capabilities: countRows ? CAPABILITIES : { ...CAPABILITIES, total: false },
  }
}

/** Every table and view in a database, as a `TableCatalog`.
 *
 *  Sources are memoised per table so switching back and forth doesn't
 *  discard the column list and row count each already fetched. */
export function sqliteCatalog(db: SqliteDb, opts: SqliteTableSourceOptions = {}): TableCatalog {
  const sources = new Map<string, TableSource>()
  return {
    objects: () => db.objects(),
    source(name: string) {
      let source = sources.get(name)
      if (!source) {
        source = sqliteTableSource(db, name, opts)
        sources.set(name, source)
      }
      return source
    },
  }
}
