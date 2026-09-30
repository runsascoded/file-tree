/** `snapshotTreeSource` over a disk-tree snapshot library published by
 *  disk-tree itself (`test/fixtures/gen-snapshots.py`): the conformance
 *  harness against the newest snapshot (which *is* `CONFORMANCE_FIXTURE`),
 *  then history, derived diffs, typed errors, the snake→camel mapping,
 *  and row-group pruning. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { runTreeSourceConformance } from '../src/test/treeConformance'
import { rowSpans, snapshotTreeSource, type GroupBounds } from '../src/renderers/snapshotTreeSource'
import type { Store } from '../src/types'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Every file under `test/fixtures/<dir>`, keyed `<prefix><relative path>`. */
function library(dir: string, prefix: string): Record<string, Uint8Array> {
  const root = join(FIXTURES, dir)
  const out: Record<string, Uint8Array> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out[`${prefix}${relative(root, p)}`] = new Uint8Array(readFileSync(p))
    }
  }
  walk(root)
  return out
}

const LIB = library('snapshots', 'scans/')
const LIB_RG3 = library('snapshots-rg3', '')

const make = () => snapshotTreeSource({ store: MockStore(LIB), path: 'scans' })

// Epoch seconds of the fixture's two file mtimes.
const MTIME_OLD = Date.parse('2026-06-01T00:00:00Z') / 1000
const MTIME_NEW = Date.parse('2026-07-15T00:00:00Z') / 1000

describe('snapshotTreeSource', () => {
  runTreeSourceConformance(make, { rootLabel: 'fixture' })

  describe('with 3-row groups', () => {
    runTreeSourceConformance(
      () => snapshotTreeSource({ store: MockStore(LIB_RG3) }),
      { rootLabel: 'fixture' },
    )
  })

  it('declares Layer-1 capabilities: history + diff, no scan', () => {
    const src = make()
    expect(src.capabilities).toEqual({ history: true, diff: true, scan: false, lazy: true })
    expect(src.scan).toBeUndefined()
  })

  it('lists snapshots newest first', async () => {
    expect(await make().snapshots!()).toEqual([
      { id: '2', time: '2026-08-01T00:00:00', size: 343 },
      { id: '1', time: '2026-07-01T00:00:00', size: 368 },
    ])
  })

  it('maps disk-tree columns to TreeNode, and tags the answering snapshot', async () => {
    const level = await make().children({ path: 'docs' })
    expect(level.snapshot).toBe('2')
    expect(level.node).toEqual({
      path: 'docs', name: 'docs', kind: 'dir', size: 34,
      nChildren: 2, nDesc: 5, mtime: MTIME_NEW,
      mtimeMean: level.node.mtimeMean,
    })
    // Size-weighted mean over intro.md (12 B, new) + guide/ (22 B, old).
    expect(level.node.mtimeMean).toBeCloseTo((12 * MTIME_NEW + 22 * MTIME_OLD) / 34, 3)
    expect(level.children).toEqual([
      { path: 'docs/guide', name: 'guide', kind: 'dir', size: 22, nChildren: 2, nDesc: 3, mtime: MTIME_OLD, mtimeMean: MTIME_OLD },
      { path: 'docs/intro.md', name: 'intro.md', kind: 'file', size: 12, nChildren: 0, nDesc: 1, mtime: MTIME_NEW, mtimeMean: MTIME_NEW },
    ])
  })

  it('reads an older snapshot by id', async () => {
    const { node, children, snapshot } = await make().children({ snapshot: '1' })
    expect(snapshot).toBe('1')
    expect({ size: node.size, nChildren: node.nChildren }).toEqual({ size: 368, nChildren: 5 })
    expect(children.map(c => [c.path, c.kind, c.size])).toEqual([
      ['README.md', 'file', 29],
      ['binary.bin', 'file', 256],
      ['data', 'dir', 16],
      ['docs', 'dir', 27],
      ['old', 'dir', 40],
    ])
  })

  it('prefetches `depth` levels, serving the deeper drills from cache', async () => {
    const inner = MockStore(LIB)
    const get = vi.fn(inner.get)
    const src = snapshotTreeSource({ store: { ...inner, get }, path: 'scans' })
    await src.children({ depth: 3 })
    const after = get.mock.calls.length
    const guide = await src.children({ path: 'docs/guide' })
    const q2024 = await src.children({ path: 'data/2024' })
    expect(get.mock.calls.length).toBe(after)
    expect(guide.children.map(c => c.path)).toEqual(['docs/guide/setup.md', 'docs/guide/usage.md'])
    expect(q2024.children.map(c => c.path)).toEqual(['data/2024/q1.csv', 'data/2024/q2.csv'])
  })

  it('serves a file path as a childless node', async () => {
    const { node, children } = await make().children({ path: 'docs/intro.md' })
    expect({ path: node.path, kind: node.kind, size: node.size, children }).toEqual({
      path: 'docs/intro.md', kind: 'file', size: 12, children: [],
    })
  })

  it('diffs two snapshots level by level, with every disk-tree status', async () => {
    const src = make()
    expect(await src.diff!({ a: '1', b: '2' })).toEqual({
      node: { path: '', name: 'fixture', kind: 'dir', status: 'changed', sizeA: 368, sizeB: 343, nDescA: 14, nDescB: 14 },
      children: [
        { path: 'README.md', name: 'README.md', kind: 'file', status: 'touched', sizeA: 29, sizeB: 29, nDescA: 1, nDescB: 1 },
        { path: 'binary.bin', name: 'binary.bin', kind: 'file', status: 'unchanged', sizeA: 256, sizeB: 256, nDescA: 1, nDescB: 1 },
        { path: 'data', name: 'data', kind: 'dir', status: 'changed', sizeA: 16, sizeB: 24, nDescA: 4, nDescB: 6 },
        { path: 'docs', name: 'docs', kind: 'dir', status: 'changed', sizeA: 27, sizeB: 34, nDescA: 5, nDescB: 5 },
        { path: 'old', name: 'old', kind: 'dir', status: 'removed', sizeA: 40, sizeB: null, nDescA: 2, nDescB: null },
      ],
    })
    expect(await src.diff!({ a: '1', b: '2', path: 'data' })).toEqual({
      node: { path: 'data', name: 'data', kind: 'dir', status: 'changed', sizeA: 16, sizeB: 24, nDescA: 4, nDescB: 6 },
      children: [
        { path: 'data/2024', name: '2024', kind: 'dir', status: 'unchanged', sizeA: 16, sizeB: 16, nDescA: 3, nDescB: 3 },
        { path: 'data/2025', name: '2025', kind: 'dir', status: 'added', sizeA: null, sizeB: 8, nDescA: null, nDescB: 2 },
      ],
    })
  })

  it('diffs under a node present on one side only as wholly added/removed', async () => {
    expect(await make().diff!({ a: '1', b: '2', path: 'old' })).toEqual({
      node: { path: 'old', name: 'old', kind: 'dir', status: 'removed', sizeA: 40, sizeB: null, nDescA: 2, nDescB: null },
      children: [
        { path: 'old/gone.txt', name: 'gone.txt', kind: 'file', status: 'removed', sizeA: 40, sizeB: null, nDescA: 1, nDescB: null },
      ],
    })
  })

  it('throws name-tagged errors for an unknown snapshot or path', async () => {
    const src = make()
    await expect(src.children({ snapshot: '99' })).rejects.toMatchObject({
      name: 'SnapshotNotFoundError', snapshot: '99',
    })
    await expect(src.children({ path: 'nope' })).rejects.toMatchObject({ name: 'NotFoundError' })
    await expect(src.diff!({ a: '1', b: '2', path: 'nope' })).rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('refuses an ambiguous multi-root index unless `root` picks one', async () => {
    const manifest = JSON.parse(new TextDecoder().decode(LIB['scans/snapshots.json']))
    manifest.snapshots.push({ ...manifest.snapshots[0], id: 3, path: 's3://other' })
    const store: Store = MockStore({ ...LIB, 'scans/snapshots.json': JSON.stringify(manifest) })
    await expect(snapshotTreeSource({ store, path: 'scans' }).snapshots!()).rejects.toThrow(
      'snapshots.json holds 2 roots (gcs://fixture, s3://other); pass `root` to pick one',
    )
    const picked = snapshotTreeSource({ store, path: 'scans', root: 's3://other' })
    expect((await picked.snapshots!()).map(s => s.id)).toEqual(['3'])
    expect((await picked.children()).node.name).toBe('other')
  })
})

describe('rowSpans', () => {
  // Five 3-row groups of a `(depth, path)`-sorted tree.
  const groups: GroupBounds[] = [
    { rowStart: 0, rowEnd: 3, depth: [0, 1], path: ['.', 'binary.bin'] },
    { rowStart: 3, rowEnd: 6, depth: [1, 2], path: ['data', 'data/2025'] },
    { rowStart: 6, rowEnd: 9, depth: [2, 2], path: ['docs/guide', 'old/x'] },
    { rowStart: 9, rowEnd: 12, depth: [3, 3], path: ['data/2024/q1.csv', 'data/2025/q1.csv'] },
    { rowStart: 12, rowEnd: 14, depth: [3, 3], path: ['docs/guide/setup.md', 'docs/guide/usage.md'] },
  ]

  it('keeps only groups whose depth and path stats allow a match, merging neighbours', () => {
    // `docs/guide`'s level: itself at depth 2, children at depth 3.
    expect(rowSpans(groups, [
      { depth: 2, lo: 'docs/guide', hi: 'docs/guide', hiInclusive: true },
      { depth: 3, lo: 'docs/guide/', hi: 'docs/guide0' },
    ])).toEqual([[3, 9], [12, 14]])
    // `data/2024`'s children only: the single-depth group 9–12 by path.
    expect(rowSpans(groups, [{ depth: 3, lo: 'data/2024/', hi: 'data/20240' }])).toEqual([[9, 12]])
  })

  it('never prunes a group without stats', () => {
    expect(rowSpans([{ rowStart: 0, rowEnd: 5, depth: null, path: null }], [{ depth: 7 }])).toEqual([[0, 5]])
  })
})
