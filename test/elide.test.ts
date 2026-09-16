import { describe, expect, it } from 'vitest'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  applyElide, cellClipped, cellTitle, elideCellStyle, ELIDE_DEFAULTS, resolveElide,
  type ElideCtx,
} from '../src/renderers/table'

/** A long GCS object path — the value that clips to a bare `…` and
 *  motivated elidable cells. */
const PATH = 'checkpoints/adam-lr1.00e-2-128B-nesterovFalse/step-42000/shard-0000.safetensors'
const COL = { name: 'name' }
const ARGS = { column: COL, row: {}, path: 'logs/' }

/** A stand-in `<td>` for the hover measurement: `applyElide`'s native
 *  `onMouseEnter` reads `scrollWidth`/`clientWidth` off `e.currentTarget`
 *  and writes its `title`. */
function fakeTd(scrollWidth: number, clientWidth: number): HTMLElement {
  return { scrollWidth, clientWidth, title: '' } as unknown as HTMLElement
}
const enter = (td: HTMLElement) => ({ currentTarget: td }) as unknown as ReactMouseEvent<HTMLElement>

/** `cellTitle` is the default `content`: full text for scalars, `undefined`
 *  for values a cell draws as its own node. */
describe('cellTitle', () => {
  it('returns the full text for scalar values', () => {
    expect(cellTitle(PATH)).toBe(PATH)
    expect(cellTitle('')).toBe('')
    expect(cellTitle(42)).toBe('42')
    expect(cellTitle(0)).toBe('0')
    expect(cellTitle(1234567890123456789n)).toBe('1234567890123456789')
    expect(cellTitle(true)).toBe('true')
  })

  it('renders a Date as its ISO string', () => {
    expect(cellTitle(new Date('2026-04-25T00:00:00.000Z'))).toBe('2026-04-25T00:00:00.000Z')
  })

  it('returns undefined for values drawn as their own node', () => {
    expect(cellTitle(null)).toBeUndefined()
    expect(cellTitle(undefined)).toBeUndefined()
    expect(cellTitle(new Uint8Array([1, 2, 3]))).toBeUndefined()
    expect(cellTitle({ a: 1 })).toBeUndefined()
    expect(cellTitle([1, 2, 3])).toBeUndefined()
  })
})

/** `cellClipped` is the overflow measurement behind `onlyWhenClipped`
 *  (`scrollWidth > clientWidth`, `+1` for sub-pixel rounding). */
describe('cellClipped', () => {
  it('is true only when content overflows the box by more than a pixel', () => {
    expect(cellClipped(fakeTd(500, 200))).toBe(true)
    expect(cellClipped(fakeTd(200, 200))).toBe(false)
    expect(cellClipped(fakeTd(201, 200))).toBe(false)
    expect(cellClipped(fakeTd(202, 200))).toBe(true)
  })
})

/** `resolveElide` folds the `elide` option to a fully-bound strategy: the
 *  `true`/absent preset, the `false` off-switch, and per-axis overrides. */
describe('resolveElide', () => {
  it('resolves the batteries-included preset from true and from absent', () => {
    expect(resolveElide(true)).toBe(ELIDE_DEFAULTS)
    expect(resolveElide(undefined)).toBe(ELIDE_DEFAULTS)
    expect(ELIDE_DEFAULTS).toEqual({ maxWidth: '30em', tooltip: 'native', content: cellTitle, onlyWhenClipped: true })
  })

  it('turns clipping and the tooltip off for false', () => {
    expect(resolveElide(false)).toEqual({ maxWidth: false, tooltip: false, content: cellTitle, onlyWhenClipped: true })
  })

  it('overrides only the named axes', () => {
    expect(resolveElide({ maxWidth: false })).toEqual({ maxWidth: false, tooltip: 'native', content: cellTitle, onlyWhenClipped: true })
    expect(resolveElide({ tooltip: false })).toEqual({ maxWidth: '30em', tooltip: false, content: cellTitle, onlyWhenClipped: true })
    expect(resolveElide({ onlyWhenClipped: false })).toEqual({ maxWidth: '30em', tooltip: 'native', content: cellTitle, onlyWhenClipped: false })
  })
})

/** `elideCellStyle` is the width-cap half — the clip idiom itself lives in
 *  `TD_STYLE`, so this contributes only `maxWidth`. */
describe('elideCellStyle', () => {
  it('maps the cap to a CSS length, or none when clipping is off', () => {
    expect(elideCellStyle(resolveElide(true))).toEqual({ maxWidth: '30em' })
    expect(elideCellStyle(resolveElide(false))).toEqual({ maxWidth: 'none' })
    expect(elideCellStyle(resolveElide({ maxWidth: '12em' }))).toEqual({ maxWidth: '12em' })
  })
})

/** `applyElide` is the tooltip half — it decides the `<td>`'s `title` (or a
 *  hover measurement that sets one) and the node to render. */
describe('applyElide', () => {
  it('titles a default scalar only once the cell is measured to clip', () => {
    const out = applyElide(resolveElide(true), { value: PATH, node: 'N', hasCustomRender: false, ...ARGS })
    expect(out.title).toBeUndefined()
    expect(out.node).toBe('N')
    const clipped = fakeTd(500, 200)
    out.onMouseEnter!(enter(clipped))
    expect(clipped.title).toBe(PATH)
    const fits = fakeTd(200, 200)
    out.onMouseEnter!(enter(fits))
    expect(fits.title).toBe('')
  })

  it('titles a default scalar unconditionally when onlyWhenClipped is off', () => {
    expect(applyElide(resolveElide({ onlyWhenClipped: false }), { value: PATH, node: 'N', hasCustomRender: false, ...ARGS }))
      .toEqual({ title: PATH, node: 'N' })
  })

  it('titles an interpreted cell with its raw value, clipped or not', () => {
    // A temporal integer drawn as a date: `raw` is the underlying value the
    // cell reformatted away, so its tooltip always adds information.
    expect(applyElide(resolveElide(true), { value: 1704067200, node: '2024-01-01', hasCustomRender: false, raw: '1704067200', ...ARGS }))
      .toEqual({ title: '1704067200', node: '2024-01-01' })
  })

  it('adds no title when a renderCell owns the cell', () => {
    expect(applyElide(resolveElide(true), { value: PATH, node: 'N', hasCustomRender: true, ...ARGS }))
      .toEqual({ node: 'N' })
  })

  it('adds no title for a value with no readable text, or an empty string', () => {
    expect(applyElide(resolveElide(true), { value: null, node: 'N', hasCustomRender: false, ...ARGS }))
      .toEqual({ node: 'N' })
    expect(applyElide(resolveElide(true), { value: '', node: 'N', hasCustomRender: false, ...ARGS }))
      .toEqual({ node: 'N' })
  })

  it('adds no title when the tooltip is off, even for a long scalar', () => {
    expect(applyElide(resolveElide(false), { value: PATH, node: 'N', hasCustomRender: false, ...ARGS }))
      .toEqual({ node: 'N' })
  })

  it('delegates to a tooltip render-prop, passing the full text, raw, and node', () => {
    const seen: ElideCtx[] = []
    const tooltip = (ctx: ElideCtx) => { seen.push(ctx); return `TT(${ctx.text})` }
    const out = applyElide(resolveElide({ tooltip }), { value: PATH, node: 'N', hasCustomRender: false, raw: 'RAW', ...ARGS })
    expect(out).toEqual({ node: `TT(${PATH})` })
    expect(seen).toEqual([{ value: PATH, text: PATH, raw: 'RAW', node: 'N', column: COL, row: {}, path: 'logs/' }])
  })

  it('runs the render-prop even when a renderCell is present (it is the opt-in)', () => {
    const out = applyElide(resolveElide({ tooltip: (ctx) => `TT(${ctx.text})` }),
      { value: PATH, node: 'N', hasCustomRender: true, ...ARGS })
    expect(out).toEqual({ node: `TT(${PATH})` })
  })
})
