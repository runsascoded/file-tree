import { describe, expect, test } from 'vitest'
import {
  isSortedBy, parsePredicate, pruneRowGroups, rowGroupMatches,
  type ParquetMeta, type Predicate, type RowGroupInfo,
} from '../src/renderers/parquetData'

/** A row group carrying just the statistics pruning reads. */
function rg(index: number, stats: Record<string, { min?: unknown; max?: unknown }>, sortedIdx?: number): RowGroupInfo {
  return {
    index,
    numRows: 100,
    rowStart: index * 100,
    rowEnd: (index + 1) * 100,
    uncompressedBytes: 1000,
    compressedBytes: 500,
    stats: new Map(Object.entries(stats)),
    sortingColumns: sortedIdx === undefined ? [] : [{ columnIdx: sortedIdx, descending: false, nullsFirst: false }],
  }
}

const indices = (rgs: RowGroupInfo[]) => rgs.map(r => r.index)

describe('parsePredicate', () => {
  test('parses the comparisons stats can answer', () => {
    expect(parsePredicate('dt=5')).toEqual({ column: 'dt', op: '=', value: '5' })
    expect(parsePredicate('dt >= 2026-01-01')).toEqual({ column: 'dt', op: '>=', value: '2026-01-01' })
    expect(parsePredicate('n<10')).toEqual({ column: 'n', op: '<', value: '10' })
    expect(parsePredicate('n <= 10')).toEqual({ column: 'n', op: '<=', value: '10' })
    expect(parsePredicate('n>1')).toEqual({ column: 'n', op: '>', value: '1' })
  })

  test('a bare word is not a predicate — it is a substring search', () => {
    expect(parsePredicate('nyc')).toBe(null)
    expect(parsePredicate('')).toBe(null)
    expect(parsePredicate('   ')).toBe(null)
  })

  test('takes the first operator, so values may contain one', () => {
    expect(parsePredicate('url=a=b')).toEqual({ column: 'url', op: '=', value: 'a=b' })
  })
})

describe('rowGroupMatches', () => {
  const g = rg(0, { n: { min: 10, max: 20 } })
  const p = (op: Predicate['op'], value: string): Predicate => ({ column: 'n', op, value })

  test('equality keeps only groups whose range spans the value', () => {
    expect(rowGroupMatches(g, p('=', '15'))).toBe(true)
    expect(rowGroupMatches(g, p('=', '10'))).toBe(true)   // inclusive at both ends
    expect(rowGroupMatches(g, p('=', '20'))).toBe(true)
    expect(rowGroupMatches(g, p('=', '9'))).toBe(false)
    expect(rowGroupMatches(g, p('=', '21'))).toBe(false)
  })

  test('ranges compare against the relevant bound only', () => {
    expect(rowGroupMatches(g, p('>', '20'))).toBe(false)
    expect(rowGroupMatches(g, p('>=', '20'))).toBe(true)
    expect(rowGroupMatches(g, p('<', '10'))).toBe(false)
    expect(rowGroupMatches(g, p('<=', '10'))).toBe(true)
  })

  test('compares numerically, not lexically', () => {
    // The bug this guards: `'9' > '20'` as strings, so a lexical
    // comparison would keep a group that cannot match.
    expect(rowGroupMatches(rg(0, { n: { min: 100, max: 200 } }), p('=', '9'))).toBe(false)
  })

  test('keeps groups it cannot rule out', () => {
    // No stats for the column at all — the writer omitted them.
    expect(rowGroupMatches(rg(0, {}), p('=', '15'))).toBe(true)
    // Stats present but one-sided.
    expect(rowGroupMatches(rg(0, { n: { min: 10 } }), p('=', '99'))).toBe(true)
    expect(rowGroupMatches(rg(0, { n: { max: 20 } }), p('=', '1'))).toBe(true)
    // Undecodable bytes are unknown, not a guess.
    expect(rowGroupMatches(rg(0, { n: { min: new Uint8Array([0xff, 0xfe]), max: new Uint8Array([0xff]) } }), p('=', 'x')))
      .toBe(true)
  })

  test('decodes UTF-8 byte-array bounds', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    const g2 = rg(0, { name: { min: enc('lax'), max: enc('nyc') } })
    expect(rowGroupMatches(g2, { column: 'name', op: '=', value: 'nyc' })).toBe(true)
    expect(rowGroupMatches(g2, { column: 'name', op: '=', value: 'sfo' })).toBe(false)
  })
})

describe('pruneRowGroups', () => {
  // A file sorted on `n`: disjoint, ordered ranges — the case where
  // pruning is most worth doing.
  const sorted = [
    rg(0, { n: { min: 0, max: 99 } }, 0),
    rg(1, { n: { min: 100, max: 199 } }, 0),
    rg(2, { n: { min: 200, max: 299 } }, 0),
  ]

  test('a point lookup on a sorted column reaches one group', () => {
    expect(indices(pruneRowGroups(sorted, { column: 'n', op: '=', value: '150' }))).toEqual([1])
  })

  test('a range keeps exactly the groups that overlap it', () => {
    expect(indices(pruneRowGroups(sorted, { column: 'n', op: '>=', value: '150' }))).toEqual([1, 2])
    expect(indices(pruneRowGroups(sorted, { column: 'n', op: '<', value: '150' }))).toEqual([0, 1])
  })

  test('an unknown column prunes nothing', () => {
    expect(indices(pruneRowGroups(sorted, { column: 'other', op: '=', value: '1' }))).toEqual([0, 1, 2])
  })

  test('a value outside every range prunes everything', () => {
    expect(pruneRowGroups(sorted, { column: 'n', op: '=', value: '500' })).toEqual([])
  })
})

describe('isSortedBy', () => {
  const meta = (rgs: RowGroupInfo[]): ParquetMeta => ({
    schema: [{ name: 'a' }, { name: 'b' }],
    totalRows: 300,
    byteSize: 1000,
    rowGroups: rgs,
  })

  test('true only when every row group declares the column', () => {
    expect(isSortedBy(meta([rg(0, {}, 0), rg(1, {}, 0)]), 'a')).toBe(true)
    // One group unsorted means the file isn't ordered end to end.
    expect(isSortedBy(meta([rg(0, {}, 0), rg(1, {})]), 'a')).toBe(false)
    // Sorted by column 0 (`a`) says nothing about `b`.
    expect(isSortedBy(meta([rg(0, {}, 0)]), 'b')).toBe(false)
    expect(isSortedBy(meta([]), 'a')).toBe(false)
  })
})
