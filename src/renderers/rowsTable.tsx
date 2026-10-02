/** A table of rows already in memory: `<TableBrowser>` over a
 *  {@link memoryTableSource}, so a consumer's own rows get the same sort,
 *  page, filter, column resize, `ditto` runs and `paths` elision as a
 *  parquet or SQLite file. */
import { useMemo } from 'react'
import type { PersistedState } from '../react/persistedState'
import { TableBrowser, type TableBrowserOptions } from './tableBrowser'
import { memoryTableSource, singleTableCatalog, type MemoryTableOptions } from './memoryTableSource'

export { inferColumns, inferKind, memoryTableSource, singleTableCatalog } from './memoryTableSource'
export type { MemoryTableOptions } from './memoryTableSource'

export interface RowsTableOptions extends TableBrowserOptions, MemoryTableOptions {}

const OBJECTS = [{ name: 'rows', type: 'table' as const }]

export function RowsTable({
  rows, columns, sortComparators, path = 'rows', usePersistedState, ...browser
}: {
  rows: readonly Record<string, unknown>[]
  /** Passed to `renderCell` & co., and keys remembered column widths. */
  path?: string
  usePersistedState?: PersistedState
} & RowsTableOptions) {
  const catalog = useMemo(
    () => singleTableCatalog('rows', memoryTableSource(rows, {
      ...(columns ? { columns } : {}),
      ...(sortComparators ? { sortComparators } : {}),
    })),
    [rows, columns, sortComparators])
  return (
    <TableBrowser
      {...browser}
      catalog={catalog}
      objects={OBJECTS}
      path={path}
      {...(usePersistedState ? { usePersistedState } : {})}
    />
  )
}

export default RowsTable
