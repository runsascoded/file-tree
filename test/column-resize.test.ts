import { describe, expect, it } from 'vitest'
import { columnFingerprint, parseWidths, scopeKey, serializeWidths } from '../src/renderers/columnResize'

/** The persisted column-width string (`?cw=name:220,dir:480`) round-trips
 *  through these pure helpers; `parseWidths` also has to survive a
 *  hand-edited URL without throwing. */
describe('parseWidths', () => {
  it('parses name:px pairs in order', () => {
    expect([...parseWidths('')]).toEqual([])
    expect([...parseWidths('name:220')]).toEqual([['name', 220]])
    expect([...parseWidths('name:220,dir:480')]).toEqual([['name', 220], ['dir', 480]])
  })

  it('splits on the last colon, so a column name may contain colons', () => {
    expect([...parseWidths('ns:col:220')]).toEqual([['ns:col', 220]])
  })

  it('skips malformed or non-positive pairs rather than throwing', () => {
    expect([...parseWidths('name:,dir:480')]).toEqual([['dir', 480]])
    expect([...parseWidths(':220,dir:480')]).toEqual([['dir', 480]])
    expect([...parseWidths('name:abc,dir:480')]).toEqual([['dir', 480]])
    expect([...parseWidths('name:-5,zero:0,dir:480')]).toEqual([['dir', 480]])
    expect([...parseWidths('garbage,dir:480')]).toEqual([['dir', 480]])
  })
})

describe('serializeWidths', () => {
  it('joins name:px pairs and rounds to whole px', () => {
    expect(serializeWidths(new Map())).toBe('')
    expect(serializeWidths(new Map([['name', 220], ['dir', 480]]))).toBe('name:220,dir:480')
    expect(serializeWidths(new Map([['a', 220.7]]))).toBe('a:221')
  })

  it('round-trips a canonical string', () => {
    const s = 'name:220,dir:480,ts:96'
    expect(serializeWidths(parseWidths(s))).toBe(s)
  })
})

const cols = (...names: string[]) => names.map(name => ({ name }))

/** `'schema'` scope keys widths by a fingerprint of the column *set*, so
 *  sibling files share and a reordered header still resolves the same. */
describe('columnFingerprint', () => {
  it('is order-independent', () => {
    expect(columnFingerprint(cols('a', 'b', 'c'))).toBe(columnFingerprint(cols('c', 'a', 'b')))
  })

  it('distinguishes different column sets', () => {
    expect(columnFingerprint(cols('a', 'b'))).not.toBe(columnFingerprint(cols('a', 'c')))
    expect(columnFingerprint(cols('a', 'b'))).not.toBe(columnFingerprint(cols('a', 'b', 'c')))
  })
})

/** `scopeKey` maps a scope to the `localStorage` sub-key — schema by
 *  fingerprint, column globally, path by path, or a custom function. */
describe('scopeKey', () => {
  const c = cols('name', 'size')
  it('keys schema by the column fingerprint', () => {
    expect(scopeKey('schema', c, '/x.parquet')).toBe(`s:${columnFingerprint(c)}`)
  })

  it('keys column globally, and path by path', () => {
    expect(scopeKey('column', c, '/x.parquet')).toBe('c')
    expect(scopeKey('path', c, '/x.parquet')).toBe('p:/x.parquet')
  })

  it('delegates to a custom scope function', () => {
    expect(scopeKey((cs, p) => `${cs.length}@${p}`, c, '/x.parquet')).toBe('f:2@/x.parquet')
  })
})
