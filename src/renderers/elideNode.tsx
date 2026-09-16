import type { ReactNode } from 'react'
import { MIDDLE_TAIL, type EllipsisMode } from './table'

/** Wrap a cell's node for the non-default {@link EllipsisMode}s. Kept out of
 *  `table.ts` so that module stays free of a React *runtime* dependency (it
 *  exports types and pure helpers); this one creates elements.
 *
 *  - `'start'`: isolate the value in a `<bdi>` so that, inside the cell's
 *    right-to-left flow (set in `resolveColStyles`), the ellipsis eats the
 *    head while the value's own characters keep their natural order.
 *  - `'middle'`: split a plain-string value into a clip-at-end `head` and a
 *    fixed last-{@link MIDDLE_TAIL}-char `tail` laid out in a flex row — the
 *    `…` falls between them, no measurement. `text` is that string, or
 *    `undefined` when the cell isn't a default-rendered string (a custom
 *    `renderCell` or a non-string value), in which case middle can't split
 *    and falls back to a plain (end-clipped) node.
 *  - `'end'`: the CSS default — the node untouched. */
/** Split a value for `ellipsis: 'middle'` into `[head, tail]` — the head is
 *  clip-ellipsized, the tail (last `tail` chars) kept verbatim. Returns
 *  `null` when there's nothing to split: no text, or a string short enough
 *  that keeping the tail plus one head char wouldn't hide anything. */
export function splitMiddle(text: string | undefined, tail: number = MIDDLE_TAIL): [string, string] | null {
  if (text === undefined || text.length <= tail + 1) return null
  return [text.slice(0, text.length - tail), text.slice(text.length - tail)]
}

export function ellipsisWrap(
  mode: EllipsisMode,
  node: ReactNode,
  text: string | undefined,
  tail: number = MIDDLE_TAIL,
): ReactNode {
  if (mode === 'start') return <bdi>{node}</bdi>
  if (mode === 'middle') {
    const split = splitMiddle(text, tail)
    if (split) {
      const [head, end] = split
      return (
        <span style={{ display: 'flex', minWidth: 0, maxWidth: '100%' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{head}</span>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{end}</span>
        </span>
      )
    }
  }
  return node
}
