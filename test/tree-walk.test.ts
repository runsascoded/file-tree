/** `walkTreeSource` — the conformance harness, then the walk-specific
 *  behaviours the harness can't state generically: the node cap, the
 *  drill cache, mtime rollup, and a scoped root. */
import { describe, expect, it, vi } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { CONFORMANCE_FIXTURE } from '../src/test/conformance'
import { runTreeSourceConformance } from '../src/test/treeConformance'
import { walkTreeSource } from '../src/renderers/walkTreeSource'
import type { Store } from '../src/types'

describe('walkTreeSource', () => {
  runTreeSourceConformance(() => walkTreeSource(MockStore(CONFORMANCE_FIXTURE)))

  it('declares Layer-0 capabilities: a walk, nothing more', async () => {
    const src = walkTreeSource(MockStore(CONFORMANCE_FIXTURE))
    expect(src.capabilities).toEqual({ history: false, diff: false, scan: false, lazy: true })
    expect(src.snapshots).toBeUndefined()
    expect(src.diff).toBeUndefined()
    expect(src.scan).toBeUndefined()
  })

  it('labels the root, and can scope to a sub-prefix', async () => {
    const scoped = walkTreeSource(MockStore(CONFORMANCE_FIXTURE), { root: 'docs/', rootLabel: 'docs' })
    const { node, children } = await scoped.children()
    // The scoped root's size is the `docs/` subtree only, and its
    // children are `docs`'s, addressed relative to the new root.
    expect({ path: node.path, name: node.name, size: node.size }).toEqual({
      path: '', name: 'docs', size: 12 + 11 + 11, // intro.md + setup.md + usage.md
    })
    expect([...children].map(c => c.path).sort()).toEqual(['guide', 'intro.md'])
  })

  it('rolls the newest descendant mtime up to the root', async () => {
    const store = MockStore({
      'a/old.txt': { bytes: new Uint8Array(3), lastModified: '2024-01-01T00:00:00.000Z' },
      'a/new.txt': { bytes: new Uint8Array(3), lastModified: '2026-06-15T00:00:00.000Z' },
      'b.txt': { bytes: new Uint8Array(3), lastModified: '2025-03-03T00:00:00.000Z' },
    })
    const { node, children } = await walkTreeSource(store).children()
    expect(node.mtime).toBe(Math.floor(Date.parse('2026-06-15T00:00:00.000Z') / 1000))
    const a = children.find(c => c.path === 'a')!
    expect(a.mtime).toBe(Math.floor(Date.parse('2026-06-15T00:00:00.000Z') / 1000))
  })

  it('walks each subtree once, then serves drills from cache', async () => {
    const inner = MockStore(CONFORMANCE_FIXTURE)
    const calls: string[] = []
    const store: Store = { ...inner, list: (p, o) => { calls.push(p); return inner.list(p, o) } }
    const src = walkTreeSource(store)

    await src.children()          // walks the whole tree from root
    const afterRoot = calls.length
    calls.length = 0
    await src.children({ path: 'docs' })       // already cached under root
    await src.children({ path: 'docs/guide' })
    expect(calls).toEqual([])
    expect(afterRoot).toBeGreaterThan(0)
  })

  it('throws TreeTooLargeError past the node cap, and does not cache a partial walk', async () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < 50; i++) many[`d/f${i}.txt`] = 'x'
    const src = walkTreeSource(MockStore(many), { maxNodes: 10 })
    await expect(src.children()).rejects.toMatchObject({
      name: 'TreeTooLargeError', nodesWalked: 11,
    })
    // A second call re-attempts (and re-throws) rather than returning a
    // half-built cache entry.
    await expect(src.children()).rejects.toMatchObject({ name: 'TreeTooLargeError' })
  })

  it('coalesces concurrent drills of the same path into one walk', async () => {
    const inner = MockStore(CONFORMANCE_FIXTURE)
    const list = vi.fn(inner.list)
    const store: Store = { ...inner, list }
    const src = walkTreeSource(store)
    const [a, b] = await Promise.all([src.children({ path: 'data' }), src.children({ path: 'data' })])
    expect(a.node).toEqual(b.node)
    // 'data', 'data/2024', 'data/2025' = 3 prefixes, listed once each —
    // not doubled by the concurrent second call.
    expect(list.mock.calls.map(c => c[0]).filter(p => p.startsWith('data')).sort())
      .toEqual(['data/', 'data/2024/', 'data/2025/'])
  })
})
