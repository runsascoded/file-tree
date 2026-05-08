/** Reusable behavioral conformance harness for `Store` impls. Any
 *  implementation can opt in by calling `runStoreConformance(makeStore)`
 *  with a factory that seeds its backing storage from the canonical
 *  fixture below. New impls (S3, GitHub, GitLab, …) get coverage for free
 *  as long as they pass.
 *
 * Usage:
 *   describe('MockStore', () => runStoreConformance(async () => MockStore(FIXTURE)))
 *
 * Real-backend impls do their seeding inside the factory (e.g. write the
 * fixture to a sandbox bucket, return an `R2Store(bucket)`).
 */
import { describe, expect, it } from 'vitest'
import type { Entry, Store } from '../types'

/** Walk all pages of `list(prefix)`, accumulating entries. Useful for
 *  tests that don't care about pagination — and most don't. */
async function listAll(store: Store, prefix: string): Promise<Entry[]> {
  const out: Entry[] = []
  let cursor: string | undefined = undefined
  for (let i = 0; i < 100; i++) {
    const r: { entries: Entry[]; cursor?: string } = await store.list(prefix, cursor ? { cursor } : undefined)
    out.push(...r.entries)
    if (!r.cursor) return out
    cursor = r.cursor
  }
  throw new Error(`listAll: cursor exhaustion failed for ${prefix}`)
}

/** Canonical fixture every Store impl should be able to expose. Keys
 *  chosen to exercise: dir grouping, multi-level nesting, file content
 *  variety (text + bytes), and a CSS-special character in a key (this
 *  bit Plotly recently — relevant cousin). */
export const CONFORMANCE_FIXTURE: Record<string, string | Uint8Array> = {
  'README.md': '# fixture\n\nTop-level readme.\n',
  'docs/intro.md': 'introduction',
  'docs/guide/setup.md': 'setup steps',
  'docs/guide/usage.md': 'usage notes',
  'data/2024/q1.csv': 'a,b\n1,2\n',
  'data/2024/q2.csv': 'a,b\n3,4\n',
  'data/2025/q1.csv': 'a,b\n5,6\n',
  'binary.bin': new Uint8Array(Array.from({ length: 256 }, (_, i) => i)),
}

export interface ConformanceOptions {
  /** Skip range-read tests for stores that don't support them. */
  skipRange?: boolean
  /** Skip cursor tests for stores that page differently than expected. */
  skipPagination?: boolean
}

/** Mount the conformance suite. Inputs:
 *
 *  @param makeStore Factory. Each test call gets a fresh store seeded
 *      from `CONFORMANCE_FIXTURE`. For real-backend impls, the factory
 *      is responsible for seeding (and may want to skip / share setup
 *      across tests for cost).
 *  @param opts Capability skips.
 */
export function runStoreConformance(
  makeStore: () => Promise<Store> | Store,
  opts: ConformanceOptions = {},
): void {
  describe('Store conformance', () => {
    it('lists root with delimiter grouping', async () => {
      const store = await makeStore()
      const all = await listAll(store, '')
      const dirs = all.filter(e => e.isDir).map(e => e.key).sort()
      const files = all.filter(e => !e.isDir).map(e => e.key).sort()
      expect(dirs).toEqual(['data/', 'docs/'])
      expect(files).toEqual(['README.md', 'binary.bin'])
    })

    it('lists nested prefix', async () => {
      const store = await makeStore()
      const all = await listAll(store, 'docs/')
      const dirs = all.filter(e => e.isDir).map(e => e.key).sort()
      const files = all.filter(e => !e.isDir).map(e => e.key).sort()
      expect(dirs).toEqual(['docs/guide/'])
      expect(files).toEqual(['docs/intro.md'])
    })

    it('lists deepest leaf prefix', async () => {
      const store = await makeStore()
      const all = await listAll(store, 'data/2024/')
      const files = all.filter(e => !e.isDir).map(e => e.key).sort()
      expect(files).toEqual(['data/2024/q1.csv', 'data/2024/q2.csv'])
    })

    it('returns size + lastModified for files', async () => {
      const store = await makeStore()
      const all = await listAll(store, '')
      const readme = all.find(e => e.key === 'README.md')
      expect(readme).toBeTruthy()
      expect(readme!.size).toBeGreaterThan(0)
      expect(readme!.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    if (!opts.skipPagination) {
      it('paginates with cursor when there are more entries than fit', async () => {
        const store = await makeStore()
        // Walk all pages, accumulate entries
        const collected: string[] = []
        let cursor: string | undefined = undefined
        for (let i = 0; i < 100; i++) {
          const r: { entries: { key: string }[]; cursor?: string } = await store.list('', cursor ? { cursor } : undefined)
          collected.push(...r.entries.map(e => e.key))
          if (!r.cursor) { cursor = undefined; break }
          cursor = r.cursor
        }
        // Cursor exhausted (loop bailed via break, not iteration limit)
        expect(cursor).toBeUndefined()
        // Expected entries: 2 dirs + 2 files at root level
        expect(new Set(collected)).toEqual(new Set(['data/', 'docs/', 'README.md', 'binary.bin']))
      })
    }

    it('gets text file as bytes', async () => {
      const store = await makeStore()
      const r = await store.get('README.md')
      const text = new TextDecoder().decode(r.bytes)
      expect(text).toBe('# fixture\n\nTop-level readme.\n')
      expect(r.totalSize).toBe(r.bytes.byteLength)
    })

    it('gets binary file with byte-level fidelity', async () => {
      const store = await makeStore()
      const r = await store.get('binary.bin')
      expect(r.bytes.byteLength).toBe(256)
      // Should be 0..255 in order
      for (let i = 0; i < 256; i++) expect(r.bytes[i]).toBe(i)
    })

    if (!opts.skipRange) {
      it('honors range reads', async () => {
        const store = await makeStore()
        if (!store.capabilities?.range) return  // skip if impl can't
        const r = await store.get('binary.bin', { offset: 10, length: 20 })
        expect(r.bytes.byteLength).toBe(20)
        for (let i = 0; i < 20; i++) expect(r.bytes[i]).toBe(10 + i)
      })
    }

    it('throws NotFoundError on missing key (name === "NotFoundError")', async () => {
      const store = await makeStore()
      await expect(store.get('does-not-exist.txt')).rejects.toMatchObject({
        name: 'NotFoundError',
      })
    })
  })
}
