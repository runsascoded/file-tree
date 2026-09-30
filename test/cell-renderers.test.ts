/** Neighbor-aware cell rendering: `at` (lazy access to adjacent rows),
 *  `repeatsAbove`, `chainCellRenderers`, and ditto built on them. */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { chainCellRenderers, repeatsAbove, tableCellCtx, type TableCellCtx, type TableCellRenderer } from '../src/renderers/table'
import { dittoMark, dittoRenderer } from '../src/renderers/ditto'

const rows: Record<string, unknown>[] = [
  { owner: 'david', n: 1 },
  { owner: 'david', n: 2 },
  { owner: 'kaiyue', n: 2 },
]

/** Cell `column` of page row `i`, with `defaultNode` = the value as a string. */
function cell(i: number, column: string, page = rows): TableCellCtx {
  const value = page[i][column]
  return tableCellCtx({ value, column: { name: column }, row: page[i], at: d => page[i + d], rowIndex: i, path: 'f.csv', defaultNode: String(value) })
}

/** A ditto mark's shape: its glyph and the `title` it carries. */
function mark(node: ReactNode): { text: unknown; title: unknown } {
  if (!isValidElement(node)) throw new Error(`not an element: ${String(node)}`)
  const { children, title } = (node as ReactElement<{ children: unknown; title?: unknown }>).props
  return { text: children, title }
}

describe('tableCellCtx', () => {
  it('`at` reaches neighbors in either direction, undefined past the page edges', () => {
    const ctx = cell(1, 'owner')
    expect([ctx.at(-2), ctx.at(-1), ctx.at(0), ctx.at(1), ctx.at(2)]).toEqual([undefined, rows[0], rows[1], rows[2], undefined])
  })

  it('`prevRow` is a lazy getter over `at(-1)`', () => {
    const calls: number[] = []
    const ctx = tableCellCtx({ value: 'x', column: { name: 'owner' }, row: rows[1], at: d => { calls.push(d); return rows[1 + d] }, rowIndex: 1, path: 'f.csv', defaultNode: 'x' })
    expect(calls).toEqual([])
    expect(ctx.prevRow).toBe(rows[0])
    expect(calls).toEqual([-1])
  })
})

describe('repeatsAbove', () => {
  it('is true only when the row above holds the same value in this column', () => {
    expect([0, 1, 2].map(i => repeatsAbove(cell(i, 'owner')))).toEqual([false, true, false])
    expect([0, 1, 2].map(i => repeatsAbove(cell(i, 'n')))).toEqual([false, false, true])
  })

  it('compares with Object.is, so distinct objects never repeat', () => {
    const page = [{ d: {} }, { d: {} }]
    expect(repeatsAbove(cell(1, 'd', page))).toBe(false)
  })
})

describe('chainCellRenderers', () => {
  const upper: TableCellRenderer = ({ defaultNode }) => String(defaultNode).toUpperCase()
  const bracket: TableCellRenderer = ({ defaultNode }) => `[${String(defaultNode)}]`

  it('feeds each stage the previous output as `defaultNode`, left to right', () => {
    expect(chainCellRenderers(upper, bracket)!(cell(0, 'owner'))).toBe('[DAVID]')
    expect(chainCellRenderers(bracket, upper)!(cell(0, 'owner'))).toBe('[DAVID]')
    expect(chainCellRenderers(bracket, bracket)!(cell(0, 'owner'))).toBe('[[david]]')
  })

  it('skips undefined stages; a lone stage is returned as-is; none is undefined', () => {
    expect(chainCellRenderers(undefined, upper, undefined)).toBe(upper)
    expect(chainCellRenderers(undefined, undefined)).toBe(undefined)
  })

  it('keeps later stages\' ctx intact, including the lazy `prevRow`', () => {
    const seen: unknown[] = []
    const spy: TableCellRenderer = ctx => { seen.push(ctx.value, ctx.rowIndex, ctx.prevRow, ctx.at(1)); return ctx.defaultNode }
    chainCellRenderers(upper, spy)!(cell(1, 'owner'))
    expect(seen).toEqual(['david', 1, rows[0], rows[2]])
  })
})

describe('dittoRenderer', () => {
  const ditto = dittoRenderer(['owner'])

  it('collapses a repeat in an opted-in column to the mark, value on its title', () => {
    expect(mark(ditto(cell(1, 'owner')))).toEqual({ text: '〃', title: 'david' })
  })

  it('passes `defaultNode` through for a run head, a change, and other columns', () => {
    expect(ditto(cell(0, 'owner'))).toBe('david')
    expect(ditto(cell(2, 'owner'))).toBe('kaiyue')
    expect(ditto(cell(2, 'n'))).toBe('2')
  })

  it('never collapses empty values', () => {
    const page = [{ owner: null }, { owner: null }, { owner: '' }, { owner: '' }]
    expect([1, 3].map(i => ditto(cell(i, 'owner', page)))).toEqual(['null', ''])
  })

  it('chains ahead of a consumer renderer, which sees the mark as `defaultNode`', () => {
    const seen: ReactNode[] = []
    const mine: TableCellRenderer = ctx => { seen.push(ctx.defaultNode); return ctx.defaultNode }
    const out = chainCellRenderers(ditto, mine)!(cell(1, 'owner'))
    expect(mark(out)).toEqual({ text: '〃', title: 'david' })
    expect(seen).toEqual([out])
  })

  it('a consumer renderer can override the mark via `repeatsAbove`', () => {
    const mine: TableCellRenderer = ctx => (repeatsAbove(ctx) ? `same: ${String(ctx.value)}` : ctx.defaultNode)
    expect(chainCellRenderers(ditto, mine)!(cell(1, 'owner'))).toBe('same: david')
  })
})

describe('dittoMark', () => {
  it('omits the title for values without a text form', () => {
    expect(mark(dittoMark())).toEqual({ text: '〃', title: undefined })
    expect(mark(dittoMark(12n))).toEqual({ text: '〃', title: '12' })
  })
})
