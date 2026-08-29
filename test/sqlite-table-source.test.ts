/** `SqliteDb` and the `TableSource` over it, against the real fixture. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createSqliteModule, quoteIdent, SqliteDb, type SqliteRuntime } from '../src/sqlite/db'
import { sqliteTableSource } from '../src/sqlite/tableSource'
import { kindOfDeclaredType } from '../src/renderers/tableSource'
import type { RangeReader } from '../src/sqlite/vfs'

const here = dirname(fileURLToPath(import.meta.url))
const DB = readFileSync(join(here, 'fixtures/sample.sqlite'))

const reader = (): RangeReader => ({
  size: DB.byteLength,
  async read(offset, length) { return DB.subarray(offset, offset + length) },
})

let runtime: SqliteRuntime
let db: SqliteDb

beforeAll(async () => {
  runtime = await createSqliteModule({
    wasmBinary: readFileSync(join(here, '../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm')),
  })
  db = await SqliteDb.open(reader(), {}, { runtime })
})

afterAll(async () => { await db.close() })

describe('quoteIdent', () => {
  test('quotes, and doubles embedded quotes', () => {
    expect(quoteIdent('events')).toBe('"events"')
    expect(quoteIdent('odd name')).toBe('"odd name"')
    expect(quoteIdent('he said "hi"')).toBe('"he said ""hi"""')
    // The reason it exists: an identifier can't be a bound parameter.
    expect(quoteIdent('x"; drop table events; --')).toBe('"x""; drop table events; --"')
  })
})

describe('kindOfDeclaredType', () => {
  test('follows SQLite affinity, including the substring rules', () => {
    const kinds = [
      'INTEGER', 'BIGINT', 'INT', 'TEXT', 'VARCHAR(20)', 'CLOB',
      'BLOB', '', 'REAL', 'DOUBLE PRECISION', 'FLOAT',
      'DATE', 'DATETIME', 'BOOLEAN', 'DECIMAL(10,5)', 'NUMERIC',
    ].map(kindOfDeclaredType)
    expect(kinds).toEqual([
      'number', 'number', 'number', 'string', 'string', 'string',
      'binary', 'binary', 'number', 'number', 'number',
      'temporal', 'temporal', 'boolean', 'number', 'number',
    ])
  })

  test('INT beats CHAR, as SQLite orders the rules', () => {
    // `INT` is tested first, so a hypothetical `INTCHAR` is numeric.
    expect(kindOfDeclaredType('INTCHAR')).toBe('number')
  })
})

describe('SqliteDb', () => {
  test('lists tables and views but not SQLite bookkeeping', async () => {
    const objects = await db.objects()
    expect(objects).toEqual([
      { name: 'events', type: 'table', sql: expect.stringContaining('CREATE TABLE events') },
      { name: 'regions', type: 'table', sql: expect.stringContaining('CREATE TABLE regions') },
      { name: 'recent', type: 'view', sql: expect.stringContaining('CREATE VIEW recent') },
    ])
  })

  test('reads a table\'s columns', async () => {
    expect(await db.columns('events')).toEqual([
      { name: 'id', declaredType: 'INTEGER', notNull: false, primaryKey: true },
      { name: 'region', declaredType: 'TEXT', notNull: true, primaryKey: false },
      { name: 'ts', declaredType: 'INTEGER', notNull: true, primaryKey: false },
      { name: 'value', declaredType: 'REAL', notNull: false, primaryKey: false },
      { name: 'note', declaredType: 'TEXT', notNull: false, primaryKey: false },
    ])
  })

  test('binds parameters rather than interpolating them', async () => {
    const { rows } = await db.select(
      'select id, region from events where region = ? and id < ? order by id', ['sf', 8])
    expect(rows).toEqual([
      { id: 1, region: 'sf' },
      { id: 4, region: 'sf' },
      { id: 7, region: 'sf' },
    ])
  })

  test('counts, with and without a predicate', async () => {
    expect(await db.count('events')).toBe(3000)
    expect(await db.count('events', { sql: 'region = ?', params: ['sf'] })).toBe(1000)
  })

  test('a connection keeps its page cache, so the second query is cheaper', async () => {
    const fresh = await SqliteDb.open(reader(), {}, { runtime })
    try {
      await fresh.select("select count(*) as n from events where note like 'note-1%'")
      const cold = fresh.stats.reads
      await fresh.select("select count(*) as n from events where note like 'note-2%'")
      const warm = fresh.stats.reads - cold
      // A different scan of the same table, second time around, touches
      // the store not at all — which is the argument for holding a
      // connection open rather than opening one per request.
      expect([cold, warm]).toEqual([5, 0])
    } finally {
      await fresh.close()
    }
  })
})

describe('sqliteTableSource', () => {
  test('reports columns with coarse kinds', async () => {
    const src = sqliteTableSource(db, 'events')
    expect(await src.columns()).toEqual([
      { name: 'id', kind: 'number' },
      { name: 'region', kind: 'string' },
      { name: 'ts', kind: 'number' },
      { name: 'value', kind: 'number' },
      { name: 'note', kind: 'string' },
    ])
  })

  test('pages, and reports the total', async () => {
    const src = sqliteTableSource(db, 'regions')
    const page = await src.page({ offset: 1, limit: 2 })
    expect(page.rows).toEqual([
      { code: 'sf', name: 'San Francisco' },
      { code: 'chi', name: 'Chicago' },
    ])
    expect([page.total, page.offset]).toEqual([3, 1])
  })

  test('pushes the sort down, both directions', async () => {
    const src = sqliteTableSource(db, 'events')
    const asc = await src.page({ offset: 0, limit: 2, sort: { column: 'value', dir: 'asc' } })
    const desc = await src.page({ offset: 0, limit: 2, sort: { column: 'value', dir: 'desc' } })
    expect(asc.rows.map(r => r.value)).toEqual([0.5, 0.5])
    expect(desc.rows.map(r => r.value)).toEqual([99.5, 99.5])
  })

  test('ignores a sort on a column that does not exist', async () => {
    // Not an error: sort state outlives the table it was set on, and a
    // stale `?sort=` in a URL should show the table, not a SQL error.
    const src = sqliteTableSource(db, 'regions')
    const page = await src.page({ offset: 0, limit: 1, sort: { column: 'nope', dir: 'asc' } })
    expect(page.rows).toEqual([{ code: 'nyc', name: 'New York' }])
  })

  test('a column name is never interpolated unchecked', async () => {
    const src = sqliteTableSource(db, 'regions')
    const page = await src.page({
      offset: 0, limit: 1,
      sort: { column: 'code"; drop table regions; --', dir: 'asc' },
    })
    expect(page.rows).toEqual([{ code: 'nyc', name: 'New York' }])
    expect(await db.count('regions')).toBe(3)
  })

  test('filters across every column, case-insensitively', async () => {
    const src = sqliteTableSource(db, 'regions')
    // Matches `name`, not `code`.
    expect((await src.page({ offset: 0, limit: 10, filter: 'FRANCISCO' })).rows)
      .toEqual([{ code: 'sf', name: 'San Francisco' }])
    // Matches `code`.
    expect((await src.page({ offset: 0, limit: 10, filter: 'nyc' })).rows)
      .toEqual([{ code: 'nyc', name: 'New York' }])
  })

  test('filters numeric columns by the digits shown', async () => {
    const src = sqliteTableSource(db, 'events')
    const page = await src.page({ offset: 0, limit: 3, filter: '2999' })
    expect(page.rows.map(r => r.id)).toEqual([2999])
    expect(page.total).toBe(1)
  })

  test('the total reflects the filter, not the table', async () => {
    const src = sqliteTableSource(db, 'events')
    expect((await src.page({ offset: 0, limit: 1 })).total).toBe(3000)
    expect((await src.page({ offset: 0, limit: 1, filter: 'note-29' })).total).toBe(111)
  })

  test('LIKE wildcards in the filter match literally', async () => {
    const src = sqliteTableSource(db, 'regions')
    // Unescaped, `%` would match every row.
    expect((await src.page({ offset: 0, limit: 10, filter: '%' })).rows).toEqual([])
    expect((await src.page({ offset: 0, limit: 10, filter: '_' })).rows).toEqual([])
  })

  test('countRows: false trades the total for the scan it costs', async () => {
    const src = sqliteTableSource(db, 'events', { countRows: false })
    const page = await src.page({ offset: 0, limit: 1 })
    expect(page.total).toBeNull()
    expect(src.capabilities).toEqual({
      sort: true, filter: true, total: false, randomAccess: true,
    })
  })
})
