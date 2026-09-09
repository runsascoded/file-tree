import { describe, expect, it } from 'vitest'
import { parseWidths, serializeWidths } from '../src/renderers/columnResize'

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
