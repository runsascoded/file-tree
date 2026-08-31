/** Reusable behavioral conformance harness for `TreeSource` impls,
 *  beside the `Store` one. Any implementation seeded from the canonical
 *  `CONFORMANCE_FIXTURE` opts in with a one-line vitest file:
 *
 *    describe('walkTreeSource', () =>
 *      runTreeSourceConformance(() => walkTreeSource(MockStore(CONFORMANCE_FIXTURE))))
 *
 *  Ground truth is computed from the fixture by *prefix-sum* — a flat,
 *  independent method that can't share a bug with a recursive walk — so
 *  the assertions genuinely pin the rollups rather than restate the
 *  implementation.
 */
import { describe, expect, it } from 'vitest'
import { CONFORMANCE_FIXTURE } from './conformance'
import type { TreeNode, TreeSource } from '../renderers/treeSource'

const TEXT = new TextEncoder()

function byteLen(v: string | Uint8Array): number {
  return typeof v === 'string' ? TEXT.encode(v).byteLength : v.byteLength
}

const KEYS = Object.keys(CONFORMANCE_FIXTURE)

/** Every fixture file key strictly under directory `path` (`''` = root). */
function filesUnder(path: string): string[] {
  const p = path ? `${path}/` : ''
  return KEYS.filter(k => k.startsWith(p) && k.length > p.length)
}

/** Recursive byte total under `path`, summed flatly over the fixture. */
function sizeUnder(path: string): number {
  return filesUnder(path).reduce((s, k) => s + byteLen(CONFORMANCE_FIXTURE[k]), 0)
}

/** Immediate child names under `path`, each tagged file|dir — derived
 *  from the keys' next path segment, the way a delimiter listing would. */
function immediateChildren(path: string): { name: string; kind: 'file' | 'dir' }[] {
  const p = path ? `${path}/` : ''
  const seen = new Map<string, 'file' | 'dir'>()
  for (const k of KEYS) {
    if (!k.startsWith(p) || k.length <= p.length) continue
    const rest = k.slice(p.length)
    const slash = rest.indexOf('/')
    if (slash >= 0) seen.set(rest.slice(0, slash), 'dir')
    else seen.set(rest, 'file')
  }
  return [...seen].map(([name, kind]) => ({ name, kind }))
}

/** `{ path, name, kind, size }` — the load-bearing fields, order-stable. */
function tuple(n: TreeNode) {
  return { path: n.path, name: n.name, kind: n.kind, size: n.size }
}

const byPath = <T extends { path: string }>(xs: readonly T[]) =>
  [...xs].sort((a, b) => a.path.localeCompare(b.path))

export interface TreeConformanceOptions {
  /** Label the source gives the root node. Default `'root'`. */
  rootLabel?: string
}

export function runTreeSourceConformance(
  makeSource: () => TreeSource | Promise<TreeSource>,
  opts: TreeConformanceOptions = {},
): void {
  const rootLabel = opts.rootLabel ?? 'root'

  describe('TreeSource conformance', () => {
    it('root size is the sum of every file in the tree', async () => {
      const src = await makeSource()
      const { node } = await src.children()
      expect(tuple(node)).toEqual({
        path: '', name: rootLabel, kind: 'dir', size: sizeUnder(''),
      })
    })

    it('lists exactly the immediate children, each with its rollup', async () => {
      const src = await makeSource()
      const { children } = await src.children()
      const expected = immediateChildren('').map(({ name, kind }) => ({
        path: name, name, kind,
        size: kind === 'dir' ? sizeUnder(name) : byteLen(CONFORMANCE_FIXTURE[name]),
      }))
      expect(byPath(children.map(tuple))).toEqual(byPath(expected))
    })

    it('every interior directory rolls up its own subtree', async () => {
      const src = await makeSource()
      for (const path of ['docs', 'docs/guide', 'data', 'data/2024']) {
        const { node, children } = await src.children({ path })
        expect(tuple(node)).toEqual({
          path, name: path.split('/').pop(), kind: 'dir', size: sizeUnder(path),
        })
        // Additivity: a directory's size is its children's sizes summed.
        const childSum = children.reduce((s, c) => s + (c.size ?? 0), 0)
        expect(childSum).toBe(sizeUnder(path))
      }
    })

    it('reports the immediate-child count on each directory', async () => {
      const src = await makeSource()
      for (const path of ['', 'docs', 'data', 'data/2024']) {
        const { node } = await src.children({ path })
        expect(node.nChildren).toBe(immediateChildren(path).length)
      }
    })

    it('files carry their own byte size and are childless', async () => {
      const src = await makeSource()
      const { children } = await src.children({ path: 'docs/guide' })
      const files = children.filter(c => c.kind === 'file')
      expect(byPath(files.map(c => ({ path: c.path, size: c.size })))).toEqual(
        byPath(filesUnder('docs/guide').map(k => ({ path: k, size: byteLen(CONFORMANCE_FIXTURE[k]) }))),
      )
    })

    it('is stable across repeated and re-drilled reads', async () => {
      const src = await makeSource()
      const a = await src.children({ path: 'docs' })
      const b = await src.children({ path: 'docs' })
      expect(a.node).toEqual(b.node)
      // Drilling root first, then a child, must agree with the direct read.
      const src2 = await makeSource()
      await src2.children()
      const viaRoot = await src2.children({ path: 'docs' })
      expect(tuple(viaRoot.node)).toEqual(tuple(a.node))
    })
  })
}
