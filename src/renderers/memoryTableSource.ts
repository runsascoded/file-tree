/** A `TableSource` over rows already in memory — a consumer's own
 *  `Record<string, unknown>[]` — so they get the table viewers' sort, page,
 *  filter, resize, `ditto` and `paths` features instead of a hand-rolled
 *  `<table>`. See `<RowsTable>` for the component. */
import { compareValues, type SortComparators } from './tableSort'
import { filterRows } from './tableControls'
import type { TableColumn } from './table'
import type { PageRequest, PageResult, TableCatalog, TableSource, TableSourceCapabilities } from './tableSource'

const CAPABILITIES: TableSourceCapabilities = { sort: true, filter: true, total: true, randomAccess: true }

/** A column's coarse `kind`, read off its first non-empty value. */
export function inferKind(value: unknown): TableColumn['kind'] {
  switch (typeof value) {
    case 'number':
    case 'bigint': return 'number'
    case 'boolean': return 'boolean'
    case 'object':
      if (value instanceof Date) return 'temporal'
      if (value instanceof Uint8Array) return 'binary'
      return undefined
    default: return 'string'
  }
}

/** Columns of `rows`: every key, in first-seen order, each with the
 *  {@link inferKind} of its first non-empty value. */
export function inferColumns(rows: readonly Record<string, unknown>[]): TableColumn[] {
  const kinds = new Map<string, TableColumn['kind']>()
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (kinds.get(k) !== undefined) continue
      kinds.set(k, v === null || v === undefined || v === '' ? undefined : inferKind(v))
    }
  }
  return [...kinds].map(([name, kind]) => (kind ? { name, kind } : { name }))
}

export interface MemoryTableOptions<C extends TableColumn = TableColumn> {
  /** Columns, in order. Default {@link inferColumns}. */
  columns?: readonly C[]
  /** Per-column comparator override (default `compareValues`). */
  sortComparators?: SortComparators
}

/** Sort, filter and page `rows` in memory. Everything is pushed "down"
 *  because there's nowhere further to push it. */
export function memoryTableSource<C extends TableColumn = TableColumn>(
  rows: readonly Record<string, unknown>[],
  opts: MemoryTableOptions<C> = {},
): TableSource<C> {
  const columns = (opts.columns ?? inferColumns(rows)) as readonly C[]
  const names = columns.map(c => c.name)
  return {
    capabilities: CAPABILITIES,
    columns: async () => columns,
    async page(req: PageRequest): Promise<PageResult<C>> {
      let out = filterRows([...rows], req.filter ?? '', names) ?? []
      if (req.sort) {
        const { column, dir } = req.sort
        const col = columns.find(c => c.name === column)
        const cmp = (col && opts.sortComparators?.(col)) ?? compareValues
        const sign = dir === 'desc' ? -1 : 1
        out = out.sort((x, y) => sign * cmp(x[column], y[column]))
      }
      return { rows: out.slice(req.offset, req.offset + req.limit), columns, total: out.length, offset: req.offset }
    },
  }
}

/** A one-table catalog, for `<TableBrowser>`. */
export function singleTableCatalog<C extends TableColumn = TableColumn>(name: string, source: TableSource<C>): TableCatalog<C> {
  return {
    objects: async () => [{ name, type: 'table' }],
    source: () => source,
  }
}
