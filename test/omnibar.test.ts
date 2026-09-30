/** ⌘K path search: `scorePath` ranking, `treePathIndex` enumeration, and the
 *  `treePathEndpoint` a `use-kbd` omnibar registers. */
import { describe, expect, it } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { walkTreeSource } from '../src/renderers/walkTreeSource'
import { scorePath, treePathEndpoint, treePathIndex } from '../src/omnibar'

const FILES = {
  'README.md': 'readme',
  'data/sales.csv': 'a,b\n1,2\n',
  'data/2024/sales.parquet': 'PAR1',
  'data/2024/notes.md': 'notes',
  'src/foo-bar.ts': 'export {}',
  'src/sales/report.ts': 'x',
}
const tree = () => walkTreeSource(MockStore(FILES))

/** Paths matching `query`, best first. */
function rank(query: string, paths: string[]): string[] {
  return paths
    .map(p => ({ p, s: scorePath(query, p) }))
    .filter((x): x is { p: string; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)
    .map(x => x.p)
}

describe('scorePath', () => {
  it('ranks a basename hit above the same text in a parent dir, shorter paths first among equals', () => {
    expect(rank('sales', ['src/sales/report.ts', 'data/2024/sales.parquet', 'data/sales.csv', 'README.md'])).toEqual([
      'data/sales.csv', 'data/2024/sales.parquet', 'src/sales/report.ts',
    ])
  })

  it('prefers a word-boundary hit over a mid-word one', () => {
    expect(rank('bar', ['src/foobar.ts', 'src/foo-bar.ts'])).toEqual(['src/foo-bar.ts', 'src/foobar.ts'])
  })

  it('matches a scattered subsequence, below any contiguous hit', () => {
    expect(rank('fbr', ['src/foo-bar.ts', 'fbr.txt', 'README.md'])).toEqual(['fbr.txt', 'src/foo-bar.ts'])
  })

  it('requires every whitespace-separated token, in any order', () => {
    expect(rank('csv data', ['data/sales.csv', 'data/2024/sales.parquet', 'csv/other.txt'])).toEqual(['data/sales.csv'])
  })

  it('is case-insensitive', () => {
    expect(rank('readme', ['README.md'])).toEqual(['README.md'])
  })
})

describe('treePathIndex', () => {
  it('enumerates every node under the scope, breadth-first (each level in source order: dirs first)', async () => {
    const nodes = await treePathIndex(tree())
    expect(nodes.map(n => `${n.kind}:${n.path}`)).toEqual([
      'dir:data', 'dir:src', 'file:README.md',
      'dir:data/2024', 'file:data/sales.csv', 'dir:src/sales', 'file:src/foo-bar.ts',
      'file:data/2024/notes.md', 'file:data/2024/sales.parquet', 'file:src/sales/report.ts',
    ])
  })

  it('scopes to a subtree, excluding the scope root', async () => {
    const nodes = await treePathIndex(tree(), { path: 'data' })
    expect(nodes.map(n => n.path)).toEqual(['data/2024', 'data/sales.csv', 'data/2024/notes.md', 'data/2024/sales.parquet'])
  })

  it('throws TreeTooLargeError past maxNodes', async () => {
    await expect(treePathIndex(tree(), { maxNodes: 4 })).rejects.toMatchObject({ name: 'TreeTooLargeError', message: 'tree under (root) exceeds 4 entries' })
  })
})

describe('treePathEndpoint', () => {
  const page = { offset: 0, limit: 10 }
  const signal = new AbortController().signal

  it('returns ranked link entries with listing-identical hrefs', async () => {
    const ep = treePathEndpoint(tree(), { routeBase: '/files/' })
    expect({ group: ep.group, priority: ep.priority, sort: (ep as { sort?: string }).sort, minQueryLength: ep.minQueryLength }).toEqual({ group: 'Files', priority: 50, sort: 'none', minQueryLength: 1 })
    expect(await ep.fetch('sales', signal, page)).toEqual({
      entries: [
        { id: 'src/sales', label: 'sales/', description: 'src/sales/ · 1 B', href: '/files/src/sales/' },
        { id: 'data/sales.csv', label: 'sales.csv', description: 'data/sales.csv · 8 B', href: '/files/data/sales.csv' },
        { id: 'data/2024/sales.parquet', label: 'sales.parquet', description: 'data/2024/sales.parquet · 4 B', href: '/files/data/2024/sales.parquet' },
        { id: 'src/sales/report.ts', label: 'report.ts', description: 'src/sales/report.ts · 1 B', href: '/files/src/sales/report.ts' },
      ],
      total: 4,
      hasMore: false,
    })
  })

  it('paginates, and filters by kind', async () => {
    const ep = treePathEndpoint(tree(), { routeBase: '/files', kinds: ['file'] })
    const res = await ep.fetch('sales', signal, { offset: 1, limit: 1 })
    expect({ ids: res.entries.map(e => e.id), total: res.total, hasMore: res.hasMore }).toEqual({ ids: ['data/2024/sales.parquet'], total: 3, hasMore: true })
  })

  it('skips an excluded subtree (a nearer scope\'s hits), but not a name-prefix sibling', async () => {
    const files = { ...FILES, 'data-old/sales.txt': 'x' }
    const ep = treePathEndpoint(walkTreeSource(MockStore(files)), { routeBase: '/files', excludePath: 'data' })
    const res = await ep.fetch('sales', signal, page)
    expect(res.entries.map(e => e.id)).toEqual(['src/sales', 'data-old/sales.txt', 'src/sales/report.ts'])
  })

  it('reports an over-cap tree as one explanatory entry', async () => {
    const ep = treePathEndpoint(tree(), { routeBase: '/files', maxNodes: 4 })
    const res = await ep.fetch('sales', signal, page)
    expect(res.entries.map(({ id, label, description }) => ({ id, label, description }))).toEqual([
      { id: 'Files:too-large', label: 'Tree too large to index', description: 'tree under (root) exceeds 4 entries' },
    ])
  })
})
