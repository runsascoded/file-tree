/** Tests for `MultiStore`. Two angles:
 *  1. Run the full conformance harness against a single-child `MultiStore`
 *     (proves the splicing is faithful — list/get/range/404 all forward).
 *  2. Direct unit tests of multi-child semantics: virtual root, namespacing,
 *     unknown child names.
 */
import { describe, expect, it } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { MultiStore } from '../src/stores/multi'
import type { Entry, ListResult, Store } from '../src/types'
import { CONFORMANCE_FIXTURE, runStoreConformance } from '../src/test/conformance'

/** Wrap a `MultiStore` so the conformance suite (which uses unprefixed
 *  paths) sees one specific child as if it were the root. */
function childView(multi: Store, name: string): Store {
  const ns = `${name}/`
  return {
    async list(prefix, opts) {
      const r: ListResult = await multi.list(ns + prefix, opts)
      const entries: Entry[] = r.entries.map(e => ({ ...e, key: e.key.slice(ns.length) }))
      const out: ListResult = { entries }
      if (r.cursor) out.cursor = r.cursor
      return out
    },
    async get(path, range) {
      return multi.get(ns + path, range)
    },
    ...(multi.capabilities ? { capabilities: multi.capabilities } : {}),
  }
}

describe('MultiStore (conformance via single-child view)', () => {
  runStoreConformance(() =>
    childView(
      MultiStore({ child: MockStore(CONFORMANCE_FIXTURE, { pageSize: 3 }) }),
      'child',
    ),
  )
})

describe('MultiStore (multi-child semantics)', () => {
  function makeMulti(): Store {
    return MultiStore({
      a: MockStore({ 'one.txt': 'A1', 'sub/two.txt': 'A2' }),
      b: MockStore({ 'three.txt': 'B1' }),
    })
  }

  it('virtual root lists children alphabetically as dirs, no cursor', async () => {
    const multi = makeMulti()
    const r = await multi.list('')
    expect(r.entries).toEqual([
      { key: 'a/', isDir: true },
      { key: 'b/', isDir: true },
    ])
    expect(r.cursor).toBeUndefined()
  })

  it('list("/") behaves like list("")', async () => {
    const multi = makeMulti()
    expect(await multi.list('/')).toEqual(await multi.list(''))
  })

  it('listing a child re-prefixes returned keys with the child name', async () => {
    const multi = makeMulti()
    const r = await multi.list('a/')
    const keys = r.entries.map(e => e.key).sort()
    expect(keys).toEqual(['a/one.txt', 'a/sub/'])
  })

  it('listing nested under a child forwards prefix correctly', async () => {
    const multi = makeMulti()
    const r = await multi.list('a/sub/')
    const keys = r.entries.map(e => e.key)
    expect(keys).toEqual(['a/sub/two.txt'])
  })

  it('listing without trailing slash on a known child still works', async () => {
    const multi = makeMulti()
    const r = await multi.list('b')
    const keys = r.entries.map(e => e.key)
    expect(keys).toEqual(['b/three.txt'])
  })

  it('listing an unknown child returns empty entries', async () => {
    const multi = makeMulti()
    const r = await multi.list('nope/')
    expect(r.entries).toEqual([])
    expect(r.cursor).toBeUndefined()
  })

  it('get forwards to the right child and strips the name prefix', async () => {
    const multi = makeMulti()
    const r = await multi.get('a/one.txt')
    expect(new TextDecoder().decode(r.bytes)).toBe('A1')
  })

  it('get on unknown child throws NotFoundError', async () => {
    const multi = makeMulti()
    await expect(multi.get('nope/anything')).rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('get on missing key within a known child propagates NotFoundError', async () => {
    const multi = makeMulti()
    await expect(multi.get('a/missing.txt')).rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('range capability is AND of children', async () => {
    const noRange: Store = {
      list: async () => ({ entries: [] }),
      get: async () => ({ bytes: new Uint8Array() }),
      capabilities: { range: false },
    }
    expect(MultiStore({ a: MockStore({}), b: noRange }).capabilities?.range).toBe(false)
    expect(MultiStore({ a: MockStore({}), b: MockStore({}) }).capabilities?.range).toBe(true)
  })

  it('rejects child names containing "/" or empty string', () => {
    expect(() => MultiStore({ 'a/b': MockStore({}) })).toThrow(/invalid child name/)
    expect(() => MultiStore({ '': MockStore({}) })).toThrow(/invalid child name/)
  })
})
