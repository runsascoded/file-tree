/** Runs (`ditto` modes) and path elision (`paths`): the pure layout in
 *  `tableRuns.ts`, and the `<tbody>` `TableRows` draws from it. */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  computeRuns, groupHash, isSortedBy, parseFolds, pathGroups, pathModes, runGroups, sharedPathPrefix, splitParent,
  tableLayout, TREE_FALLBACK_NOTE,
  type BodyItem, type DittoOption, type GroupRows, type PathsOption, type RowGroup, type TableRun,
} from '../src/renderers/tableRuns'
import { TableRows } from '../src/renderers/tableBody'
import { ELIDE_DEFAULTS, resolveColStyles } from '../src/renderers/table'
import { inferColumns, memoryTableSource } from '../src/renderers/memoryTableSource'

beforeAll(() => {
  const error = console.error
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return
    error(...args)
  })
})

/** Runs as `[index, length]` (or `null`), compact enough to read as a spec. */
const brief = (runs: (TableRun | undefined)[]) => runs.map(r => (r ? [r.index, r.length] : null))

describe('computeRuns', () => {
  const rows = ['a', 'a', 'a', '', '', 'b', 'b', 'c', null, 'c', 'c'].map(owner => ({ owner }))

  it('marks each run of equal values, skipping empties and singletons', () => {
    expect(brief(computeRuns(rows, 'owner', {}))).toEqual([
      [0, 3], [1, 3], [2, 3], null, null, [0, 2], [1, 2], null, null, [0, 2], [1, 2],
    ])
  })

  it('flags each run\'s first and last cells', () => {
    expect(computeRuns(rows, 'owner', {}).slice(0, 3)).toEqual([
      { start: true, end: false, length: 3, index: 0 },
      { start: false, end: false, length: 3, index: 1 },
      { start: false, end: true, length: 3, index: 2 },
    ])
  })

  it('`min` drops shorter runs', () => {
    expect(brief(computeRuns(rows, 'owner', { min: 3 }))).toEqual([
      [0, 3], [1, 3], [2, 3], null, null, null, null, null, null, null, null,
    ])
  })

  it('`key` runs on a derived value; a null key joins nothing', () => {
    const t = [{ t: 100 }, { t: 160 }, { t: 3700 }, { t: 3800 }, { t: -1 }, { t: -2 }]
    const hour = (v: unknown) => ((v as number) < 0 ? null : Math.floor((v as number) / 3600))
    expect(brief(computeRuns(t, 't', { key: hour }))).toEqual([[0, 2], [1, 2], [0, 2], [1, 2], null, null])
  })
})

describe('path segments', () => {
  /** Each row of a page as `[shared, tail]` against the row above. */
  const dim = (paths: string[]) => paths.map((p, i) => {
    const n = i ? sharedPathPrefix(p, paths[i - 1]) : 0
    return [p.slice(0, n), p.slice(n)]
  })

  it('shares whole segments only, past a scheme', () => {
    expect(dim([
      'gs://marin-us-east5/checkpoints/run-i20-a/step-1',
      'gs://marin-us-east5/checkpoints/run-i21-a/step-1',
      'gs://marin-us-east5/checkpoints/run-i21-a/step-2',
      'gs://marin-eu-west4/raw',
      'gs://marin-eu-west4/raw/',
      's3://other/raw',
    ])).toEqual([
      ['', 'gs://marin-us-east5/checkpoints/run-i20-a/step-1'],
      ['gs://marin-us-east5/checkpoints/', 'run-i21-a/step-1'],
      ['gs://marin-us-east5/checkpoints/run-i21-a/', 'step-2'],
      ['', 'gs://marin-eu-west4/raw'],
      ['gs://marin-eu-west4/', 'raw/'],
      ['', 's3://other/raw'],
    ])
  })

  it('unsorted: shares with whatever is above', () => {
    expect(dim(['b/x/1', 'a/y/2', 'a/z/3', 'b/x/4'])).toEqual([
      ['', 'b/x/1'], ['', 'a/y/2'], ['a/', 'z/3'], ['', 'b/x/4'],
    ])
  })

  it('splitParent keeps a directory\'s trailing slash on its tail', () => {
    expect(['a/b/c', 'a/b/', 'gs://bkt/x', 'gs://bkt', 'top'].map(splitParent)).toEqual([
      ['a/b/', 'c'], ['a/', 'b/'], ['gs://bkt/', 'x'], ['', 'gs://bkt'], ['', 'top'],
    ])
  })

  it('isSortedBy accepts either direction', () => {
    const page = (ps: string[]) => ps.map(p => ({ p }))
    expect([
      isSortedBy(page(['a', 'b', 'b', 'c']), 'p'),
      isSortedBy(page(['c', 'b', 'a']), 'p'),
      isSortedBy(page(['a', 'c', 'b']), 'p'),
    ]).toEqual([true, true, false])
  })
})

describe('pathGroups', () => {
  /** Groups as `[label, start, end, children]`, compact enough to read as a spec. */
  type G = [string, number, number, G[]]
  const brief = (gs: RowGroup[]): G[] => gs.map(g => [String(g.label), g.start, g.end, brief(g.children ?? [])])
  const page = (ps: string[]) => ps.map(path => ({ path }))

  it('nests per segment, compacting single-child chains', () => {
    const rows = page([
      'gs://b/ck/exp-a/step-1/shard-0',
      'gs://b/ck/exp-a/step-1/shard-1',
      'gs://b/ck/exp-a/step-2/shard-0',
      'gs://b/ck/exp-a/step-2/shard-1',
      'gs://b/ck/exp-b/step-1/shard-0',
      'gs://b/ck/exp-b/step-1/shard-1',
      'gs://b/tok/x',
      'gs://c/y',
    ])
    expect(brief(pathGroups('path')(rows))).toEqual([
      ['gs://b/', 0, 7, [
        ['ck/', 0, 6, [
          ['exp-a/', 0, 4, [['step-1/', 0, 2, []], ['step-2/', 2, 4, []]]],
          ['exp-b/step-1/', 4, 6, []],
        ]],
      ]],
    ])
  })

  it('`min` raises the smallest group; an unsorted page has none', () => {
    const rows = page(['a/x/1', 'a/x/2', 'a/y/1', 'a/y/2', 'a/y/3'])
    expect(brief(pathGroups('path', { min: 3 })(rows))).toEqual([['a/', 0, 5, [['y/', 2, 5, []]]]])
    expect(pathGroups('path')([rows[1], rows[0], rows[2]])).toEqual([])
  })
})

describe('runGroups', () => {
  it('groups each run, labelled by its value (or key)', () => {
    const rows = ['ann', 'ann', 'bo', 'ann', 'ann', 'ann'].map(who => ({ who }))
    expect(runGroups('who')(rows).map(g => [g.key, g.label, g.start, g.end])).toEqual([
      ['who=ann#1', 'ann', 0, 2],
      ['who=ann#2', 'ann', 3, 6],
    ])
  })
})

describe('groupHash / parseFolds', () => {
  it('hashes to 4 base-36 chars; a fold list is their concatenation', () => {
    const hs = ['who=ann#1', 'path:gs://b/'].map(groupHash)
    expect(hs.map(h => /^[0-9a-z]{4}$/.test(h))).toEqual([true, true])
    expect(parseFolds(hs.join(''))).toEqual(new Set(hs))
  })
})

describe('tableLayout', () => {
  const cols = [{ name: 'path' }, { name: 'who' }]
  const sorted = ['d/a', 'd/b', 'd/c', 'e', 'f/x', 'g/y', 'g/z'].map(path => ({ path, who: 'r' }))

  /** Items as compact strings: `row i@depth` / `group label@depth`. */
  const brief = (items: BodyItem[]) => items.map(it => (it.kind === 'row'
    ? `row ${it.i}@${it.depth}`
    : `group ${String(it.group.label)}@${it.depth}${it.collapsed ? ` (${it.size} folded)` : ''}`))

  it('`tree` groups sorted rows under their shared parent; groups of one stay plain', () => {
    const { items, tree, notes } = tableLayout(sorted, cols, { paths: { path: 'tree' } })
    expect(tree).toBe('path')
    expect(notes).toEqual(new Map())
    expect(brief(items)).toEqual([
      'group d/@0', 'row 0@1', 'row 1@1', 'row 2@1', 'row 3@0', 'row 4@0', 'group g/@0', 'row 5@1', 'row 6@1',
    ])
  })

  it('a folded group drops its rows, and runs are computed over the rest', () => {
    const rows = sorted.map((r, i) => ({ ...r, who: i === 3 ? 'x' : 'r' }))
    const folded = new Set([groupHash('path:d/')])
    const l = tableLayout(rows, cols, { paths: { path: 'tree' }, ditto: { who: 'sticky' }, folded })
    expect(brief(l.items)).toEqual(['group d/@0 (3 folded)', 'row 3@0', 'row 4@0', 'group g/@0', 'row 5@1', 'row 6@1'])
    expect(l.runs.get('who')!.map(r => (r ? [r.index, r.length] : null))).toEqual([null, null, null, null, [0, 3], [1, 3], [2, 3]])
  })

  it('`tree` on an unsorted page falls back to `dim`, with a header note', () => {
    const unsorted = [sorted[2], sorted[0], sorted[1]]
    const { items, paths, notes } = tableLayout(unsorted, cols, { paths: { path: 'tree' } })
    expect(brief(items)).toEqual(['row 0@0', 'row 1@0', 'row 2@0'])
    expect(paths).toEqual(new Map([['path', 'dim']]))
    expect(notes).toEqual(new Map([['path', TREE_FALLBACK_NOTE]]))
  })

  it('ignores hidden columns, and lists mean `mark` / `dim`', () => {
    const l = tableLayout(sorted, [{ name: 'path' }], { ditto: ['who', 'path'], paths: ['path', 'who'] })
    expect([...l.specs]).toEqual([['path', { mode: 'mark', min: 2, float: true, every: 5 }]])
    expect(l.paths).toEqual(new Map([['path', 'dim']]))
    expect(pathModes(sorted, cols, ['path', 'who']).paths).toEqual(new Map([['path', 'dim'], ['who', 'dim']]))
  })
})

/** Body cell as rendered: its text (tags stripped), plus its `rowspan` and
 *  `aria-label`s where present. */
interface Cell { text: string; rowSpan?: number; aria?: string[] }

function body(rows: Record<string, unknown>[], opts: { ditto?: DittoOption; paths?: PathsOption; groups?: GroupRows }): Cell[][] {
  const columns = inferColumns(rows)
  const html = renderToStaticMarkup(h('table', null, h(TableRows, {
    rows, columns, path: 'log', colStyles: resolveColStyles(columns, 'log', {}, () => false), el: ELIDE_DEFAULTS,
    defaultNode: (v: unknown) => (v == null ? '' : String(v)), rowIndex: (i: number) => i, ...opts,
  })))
  return [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(([, tr]) =>
    [...tr.matchAll(/<td([^>]*)>(.*?)<\/td>/g)].map(([, attrs, inner]) => {
      const rowSpan = /rowSpan="(\d+)"/i.exec(attrs)?.[1]
      const aria = [...inner.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1])
      return {
        text: inner.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').trim(),
        ...(rowSpan ? { rowSpan: +rowSpan } : {}),
        ...(aria.length ? { aria } : {}),
      }
    }))
}

describe('TableRows', () => {
  const log = [
    { who: 'ann', note: 'batch 1', path: 'gs://b/ck/run-1' },
    { who: 'ann', note: 'batch 1', path: 'gs://b/ck/run-2' },
    { who: 'ann', note: 'batch 1', path: 'gs://b/ck/run-3' },
    { who: 'bo', note: 'one-off', path: 'gs://b/raw/x' },
  ]

  it('every run is one merged cell; the mode draws below its value', () => {
    expect(body(log, { ditto: { who: 'sticky', note: 'line' } })).toEqual([
      [{ text: 'ann', rowSpan: 3 }, { text: 'batch 1', rowSpan: 3, aria: ['run line'] }, { text: 'gs://b/ck/run-1' }],
      [{ text: 'gs://b/ck/run-2' }],
      [{ text: 'gs://b/ck/run-3' }],
      [{ text: 'bo' }, { text: 'one-off' }, { text: 'gs://b/raw/x' }],
    ])
    expect(body(log, { ditto: ['who'] })[0][0]).toEqual({ text: '〃〃ann', rowSpan: 3, aria: ['ditto', 'ditto'] })
    expect(body(log, { ditto: { note: { mode: 'arrow', every: 1 } } })[0][1].aria).toEqual(['run arrow'])
  })

  it('`tree` adds nested group rows; a run starts at its first data row', () => {
    expect(body(log, { ditto: { who: 'sticky' }, paths: { path: 'tree' } })).toEqual([
      [{ text: '' }, { text: '' }, { text: '▾gs://b/', aria: ['collapse'] }],
      [{ text: '' }, { text: '' }, { text: '▾gs://b/ck/', aria: ['collapse'] }],
      [{ text: 'ann', rowSpan: 3 }, { text: 'batch 1' }, { text: '├ gs://b/ck/run-1' }],
      [{ text: 'batch 1' }, { text: '├ gs://b/ck/run-2' }],
      [{ text: 'batch 1' }, { text: '└ gs://b/ck/run-3' }],
      [{ text: 'bo' }, { text: 'one-off' }, { text: '└ gs://b/raw/x' }],
    ])
  })

  it('a run crossing a group header spans it', () => {
    const rows = ['a/x/1', 'a/x/2', 'a/y/1', 'a/y/2'].map(path => ({ who: 'ann', path }))
    expect(body(rows, { ditto: { who: 'sticky' }, paths: { path: 'tree' } }).map(r => r.map(c => c.rowSpan ? `${c.text}×${c.rowSpan}` : c.text))).toEqual([
      ['', '▾a/'],
      // Headers keep the parent's part of the prefix as (invisible) text.
      ['', '▾a/x/'],
      ['ann×5', '├ a/x/1'],
      ['└ a/x/2'],
      ['▾a/y/'],
      ['├ a/y/1'],
      ['└ a/y/2'],
    ])
  })

  it('`runGroups` heads each run with its value', () => {
    expect(body(log, { groups: runGroups('who') }).map(r => r.map(c => c.text))).toEqual([
      ['▾ann', '', ''],
      ['ann', 'batch 1', 'gs://b/ck/run-1'],
      ['ann', 'batch 1', 'gs://b/ck/run-2'],
      ['ann', 'batch 1', 'gs://b/ck/run-3'],
      ['bo', 'one-off', 'gs://b/raw/x'],
    ])
  })

  it('`dim` keeps the full path in the text and on the title', () => {
    const html = renderToStaticMarkup(h('table', null, h(TableRows, {
      rows: log.slice(0, 2), columns: [{ name: 'path' }], path: 'log',
      colStyles: resolveColStyles([{ name: 'path' }], 'log', {}, () => false), el: ELIDE_DEFAULTS,
      defaultNode: (v: unknown) => String(v), rowIndex: (i: number) => i, paths: ['path'],
    })))
    expect([...html.matchAll(/<td[^>]*title="([^"]+)"[^>]*>(.*?)<\/td>/g)].map(([, title, inner]) => [title, inner.replace(/ style="[^"]*"/g, '')])).toEqual([
      ['gs://b/ck/run-1', 'gs://b/ck/run-1'],
      ['gs://b/ck/run-2', '<span>gs://b/ck/</span>run-2'],
    ])
  })
})

describe('memoryTableSource', () => {
  const rows = [{ n: 2, s: 'b' }, { n: 10, s: 'a' }, { n: 1, s: null }]

  it('infers columns, sorts, filters and pages', async () => {
    const src = memoryTableSource(rows)
    expect(await src.columns()).toEqual([{ name: 'n', kind: 'number' }, { name: 's', kind: 'string' }])
    expect((await src.page({ offset: 0, limit: 10, sort: { column: 'n', dir: 'desc' } })).rows.map(r => r.n)).toEqual([10, 2, 1])
    expect((await src.page({ offset: 1, limit: 1, sort: { column: 's', dir: 'asc' } }))).toEqual({
      rows: [{ n: 2, s: 'b' }], columns: [{ name: 'n', kind: 'number' }, { name: 's', kind: 'string' }], total: 3, offset: 1,
    })
    expect((await src.page({ offset: 0, limit: 10, filter: 'A' })).rows).toEqual([{ n: 10, s: 'a' }])
  })
})
