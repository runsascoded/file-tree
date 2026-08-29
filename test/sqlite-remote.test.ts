/** The remote path, end to end and in one process: `httpTableCatalog`
 *  fetching from `createTableHandlers`, over a `MockStore`.
 *
 *  Both halves at once on purpose — the protocol is the contract, and a
 *  test of either alone would let them drift apart while both pass. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { createTableHandlers } from '../src/server/sqlite'
import { httpTableCatalog } from '../src/renderers/httpTableSource'
import type { TableCatalog } from '../src/renderers/tableSource'
import type { Handlers } from '../src/server'

const here = dirname(fileURLToPath(import.meta.url))
const DB = readFileSync(join(here, 'fixtures/sample.sqlite'))
const WASM = readFileSync(join(here, '../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm'))

const BASE = 'https://example.test/tables'

/** `fetch` that dispatches straight into the handler — no socket, so
 *  the test exercises the real Request/Response plumbing without a
 *  server to start or a port to pick. */
function handlerFetch(handlers: Handlers): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = await handlers.handle(new Request(url))
    return res ?? new Response('no route', { status: 404 })
  }) as typeof fetch
}

let handlers: Handlers
let requests: string[]
let catalog: TableCatalog

beforeAll(() => {
  const store = MockStore({ 'db/sample.sqlite': DB })
  handlers = createTableHandlers(store, {
    wasm: { wasmBinary: WASM },
    basePath: '/tables',
  })
  requests = []
  const raw = handlerFetch(handlers)
  catalog = httpTableCatalog({
    baseUrl: BASE,
    path: 'db/sample.sqlite',
    fetch: ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requests.push(new URL(url).search)
      return raw(input)
    }) as typeof fetch,
  })
})

describe('createTableHandlers', () => {
  test('ignores URLs that are not its routes, so it can be chained', async () => {
    expect(await handlers.handle(new Request('https://example.test/list?prefix='))).toBeNull()
    expect(await handlers.handle(new Request('https://example.test/tables/nope'))).toBeNull()
  })

  test('requires the parameters it interpolates', async () => {
    const missingPath = await handlers.handle(new Request(`${BASE}/objects`))
    expect([missingPath!.status, await missingPath!.json()])
      .toEqual([400, { error: 'path required' }])

    const missingTable = await handlers.handle(
      new Request(`${BASE}/page?path=db/sample.sqlite`))
    expect([missingTable!.status, await missingTable!.json()])
      .toEqual([400, { error: 'table required' }])
  })

  test('rejects a table that is not in the file', async () => {
    // The table name reaches SQL as an identifier, which cannot be
    // bound — so it is checked against the file's real objects.
    const res = await handlers.handle(new Request(
      `${BASE}/page?path=db/sample.sqlite&table=${encodeURIComponent('x"; drop table events; --')}`))
    expect(res!.status).toBe(404)
    expect(await res!.json()).toEqual({ error: 'no such table: x"; drop table events; --' })
  })

  test('reports a missing file as 404, not 500', async () => {
    const res = await handlers.handle(new Request(`${BASE}/objects?path=db/absent.sqlite`))
    expect(res!.status).toBe(404)
  })

  test('caps `limit` so a client cannot ask for everything', async () => {
    const capped = createTableHandlers(MockStore({ 'db/sample.sqlite': DB }), {
      wasm: { wasmBinary: WASM }, basePath: '/tables', maxLimit: 5,
    })
    const res = await capped.handle(new Request(
      `${BASE}/page?path=db/sample.sqlite&table=events&offset=0&limit=1000`))
    const body = await res!.json() as { rows: unknown[] }
    expect(body.rows.length).toBe(5)
  })
})

describe('httpTableCatalog', () => {
  test('lists the same objects the local catalog would', async () => {
    expect(await catalog.objects()).toEqual([
      { name: 'events', type: 'table', sql: expect.stringContaining('CREATE TABLE events') },
      { name: 'regions', type: 'table', sql: expect.stringContaining('CREATE TABLE regions') },
      { name: 'recent', type: 'view', sql: expect.stringContaining('CREATE VIEW recent') },
    ])
  })

  test('caches the object list — it does not change under a reader', async () => {
    requests.length = 0
    await catalog.objects()
    await catalog.objects()
    expect(requests).toEqual([])
  })

  test('pages, sorts and filters through the wire', async () => {
    const source = catalog.source('regions')
    expect(await source.page({ offset: 0, limit: 2, sort: { column: 'name', dir: 'desc' } }))
      .toEqual({
        rows: [
          { code: 'sf', name: 'San Francisco' },
          { code: 'nyc', name: 'New York' },
        ],
        columns: [
          { name: 'code', kind: 'string' },
          { name: 'name', kind: 'string' },
        ],
        total: 3,
        offset: 0,
      })

    expect((await source.page({ offset: 0, limit: 10, filter: 'Chicago' })).rows)
      .toEqual([{ code: 'chi', name: 'Chicago' }])
  })

  test('sends only the parameters that are set', async () => {
    requests.length = 0
    const source = catalog.source('events')
    await source.page({ offset: 50, limit: 2 })
    await source.page({ offset: 0, limit: 2, filter: 'sf', sort: { column: 'ts', dir: 'desc' } })
    expect(requests).toEqual([
      '?path=db%2Fsample.sqlite&table=events&offset=50&limit=2',
      '?path=db%2Fsample.sqlite&table=events&offset=0&limit=2&filter=sf&sort=ts&dir=desc',
    ])
  })

  test('an empty filter is not sent at all', async () => {
    requests.length = 0
    await catalog.source('events').page({ offset: 0, limit: 1, filter: '   ' })
    expect(requests).toEqual(['?path=db%2Fsample.sqlite&table=events&offset=0&limit=1'])
  })

  test('columns come from a zero-row page, and only once', async () => {
    requests.length = 0
    const source = catalog.source('events')
    expect(await source.columns()).toEqual([
      { name: 'id', kind: 'number' },
      { name: 'region', kind: 'string' },
      { name: 'ts', kind: 'number' },
      { name: 'value', kind: 'number' },
      { name: 'note', kind: 'string' },
    ])
    await source.columns()
    expect(requests).toEqual(['?path=db%2Fsample.sqlite&table=events&offset=0&limit=0'])
  })

  test('surfaces the server\'s message rather than the status line', async () => {
    await expect(catalog.source('nope').page({ offset: 0, limit: 1 }))
      .rejects.toThrow('no such table: nope')
  })

  test('declares full pushdown by default, and takes an override', async () => {
    expect(catalog.source('events').capabilities).toEqual({
      sort: true, filter: true, total: true, randomAccess: true,
    })
    const forwardOnly = httpTableCatalog({
      baseUrl: BASE,
      path: 'db/sample.sqlite',
      capabilities: { sort: false, filter: true, total: false, randomAccess: false },
    })
    expect(forwardOnly.source('events').capabilities.randomAccess).toBe(false)
  })
})
