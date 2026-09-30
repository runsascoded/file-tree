/** `httpTreeSource` ⇄ `createTreeHandlers`, with the client's `fetch`
 *  wired straight into the handler: conformance over both a served walk
 *  and a served snapshot library, then history/diff round-trips, typed
 *  errors surviving the hop, capability gating, and scan dispatch. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { CONFORMANCE_FIXTURE } from '../src/test/conformance'
import { runTreeSourceConformance } from '../src/test/treeConformance'
import { createTreeHandlers, type CreateTreeHandlersOptions } from '../src/server/tree'
import { httpTreeSource, type HttpTreeSourceOptions } from '../src/renderers/httpTreeSource'
import { snapshotTreeSource } from '../src/renderers/snapshotTreeSource'
import { walkTreeSource } from '../src/renderers/walkTreeSource'
import type { TreeSource } from '../src/renderers/treeSource'

const FIXTURES = fileURLToPath(new URL('./fixtures/snapshots/', import.meta.url))
function library(): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out[relative(FIXTURES, p)] = new Uint8Array(readFileSync(p))
    }
  }
  walk(FIXTURES)
  return out
}
const LIB = library()

/** A client whose requests land in `createTreeHandlers(server)`; `log`
 *  records each `METHOD path?query`. */
function wire(
  server: TreeSource,
  client: Omit<HttpTreeSourceOptions, 'baseUrl' | 'fetch'> = {},
  handlerOpts: CreateTreeHandlersOptions = {},
) {
  const handlers = createTreeHandlers(server, { basePath: '/tree', ...handlerOpts })
  const log: string[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const u = new URL(req.url)
    log.push(`${req.method} ${u.pathname}${u.search}`)
    return (await handlers.handle(req)) ?? new Response('no route', { status: 404 })
  }) as typeof globalThis.fetch
  return { src: httpTreeSource({ baseUrl: 'http://api.test/tree/', fetch, ...client }), handlers, log }
}

const HISTORY = { history: true, diff: true }

describe('httpTreeSource ⇄ createTreeHandlers', () => {
  describe('over a walk', () => {
    runTreeSourceConformance(() => wire(walkTreeSource(MockStore(CONFORMANCE_FIXTURE))).src)
  })

  describe('over a snapshot library', () => {
    runTreeSourceConformance(
      () => wire(snapshotTreeSource({ store: MockStore(LIB) }), { capabilities: HISTORY }).src,
      { rootLabel: 'fixture' },
    )
  })

  it('forwards children params and returns the level verbatim', async () => {
    const server = snapshotTreeSource({ store: MockStore(LIB) })
    const { src, log } = wire(server, { capabilities: HISTORY })
    const level = await src.children({ path: 'docs', depth: 2, snapshot: '1' })
    expect(log).toEqual(['GET /tree/children?path=docs&depth=2&snapshot=1'])
    expect(level).toEqual(await server.children({ path: 'docs', snapshot: '1' }))
  })

  it('round-trips snapshots and diff', async () => {
    const server = snapshotTreeSource({ store: MockStore(LIB) })
    const { src } = wire(server, { capabilities: HISTORY })
    expect(await src.snapshots!()).toEqual(await server.snapshots!())
    expect(await src.diff!({ a: '1', b: '2', path: 'data' })).toEqual(await server.diff!({ a: '1', b: '2', path: 'data' }))
  })

  it('declares only the capabilities it is told, omitting the rest', () => {
    const { src } = wire(walkTreeSource(MockStore(CONFORMANCE_FIXTURE)))
    expect(src.capabilities).toEqual({ history: false, diff: false, scan: false, lazy: true })
    expect([src.snapshots, src.diff, src.scan, src.scanStatus]).toEqual([undefined, undefined, undefined, undefined])
  })

  it('re-throws typed errors by name across the wire', async () => {
    const { src } = wire(snapshotTreeSource({ store: MockStore(LIB) }), { capabilities: HISTORY })
    await expect(src.children({ path: 'nope' })).rejects.toMatchObject({ name: 'NotFoundError', message: 'not found: nope' })
    await expect(src.children({ snapshot: '9' })).rejects.toMatchObject({
      name: 'SnapshotNotFoundError', snapshot: '9', message: 'no such snapshot: 9',
    })
    const many: Record<string, string> = {}
    for (let i = 0; i < 20; i++) many[`d/f${i}.txt`] = 'x'
    const { src: big } = wire(walkTreeSource(MockStore(many), { maxNodes: 5 }))
    await expect(big.children()).rejects.toMatchObject({ name: 'TreeTooLargeError', nodesWalked: 6 })
  })

  it('answers 404 for a method the source lacks, even if the client claims it', async () => {
    const { src } = wire(walkTreeSource(MockStore(CONFORMANCE_FIXTURE)), { capabilities: { history: true } })
    await expect(src.snapshots!()).rejects.toThrow('snapshots not supported by this tree source')
  })

  it('dispatches scans through a `scanner`, POST only', async () => {
    const jobs: string[] = []
    const { src, handlers, log } = wire(
      walkTreeSource(MockStore(CONFORMANCE_FIXTURE)),
      { capabilities: { scan: true } },
      {
        scanner: {
          scan: async ({ path }) => { jobs.push(path ?? ''); return { id: 'j1', status: 'pending' } },
          status: async id => ({ id, status: 'completed', itemsFound: 8 }),
        },
      },
    )
    expect(await src.scan!({ path: 'data' })).toEqual({ id: 'j1', status: 'pending' })
    expect(await src.scanStatus!('j1')).toEqual({ id: 'j1', status: 'completed', itemsFound: 8 })
    expect(jobs).toEqual(['data'])
    expect(log).toEqual(['POST /tree/scan?path=data', 'GET /tree/scan/status?id=j1'])
    const get = await handlers.handle(new Request('http://api.test/tree/scan?path=x'))
    expect(get!.status).toBe(405)
    const pre = await handlers.handle(new Request('http://api.test/tree/scan', { method: 'OPTIONS' }))
    expect([pre!.status, pre!.headers.get('Access-Control-Allow-Methods')]).toEqual([204, 'GET, POST, OPTIONS'])
  })

  it('passes unrelated routes through', async () => {
    const { handlers } = wire(walkTreeSource(MockStore(CONFORMANCE_FIXTURE)))
    expect(await handlers.handle(new Request('http://api.test/tree/list'))).toBeNull()
    expect(await handlers.handle(new Request('http://api.test/other/children'))).toBeNull()
  })
})
