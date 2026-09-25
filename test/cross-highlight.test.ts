/** `scrubMatchesRow` — the listing's cross-highlight predicate: a hovered or
 *  selected tile (tree-relative, no trailing slash) lights the top-level row
 *  that *contains* it, since a nested tile has no row of its own in a
 *  one-level listing. */
import { describe, expect, it } from 'vitest'
import { scrubMatchesRow } from '../src/react/DirListing'

describe('scrubMatchesRow', () => {
  it('matches the row exactly', () => {
    expect(scrubMatchesRow('config.json', 'config.json')).toBe(true)
    expect(scrubMatchesRow('samples', 'samples')).toBe(true)
  })

  it('matches a descendant tile against its containing row', () => {
    expect(scrubMatchesRow('samples/catalog.sqlite', 'samples')).toBe(true)
    expect(scrubMatchesRow('samples/nested/events.parquet', 'samples')).toBe(true)
  })

  it('does not match a sibling whose name is a string prefix', () => {
    expect(scrubMatchesRow('samples-old/x', 'samples')).toBe(false)
    expect(scrubMatchesRow('samples2', 'samples')).toBe(false)
  })

  it('does not match an unrelated row', () => {
    expect(scrubMatchesRow('samples/catalog.sqlite', 'docs')).toBe(false)
    expect(scrubMatchesRow('config.json', 'config.yaml')).toBe(false)
  })

  it('does not match an ancestor (only self-or-descendant lights up)', () => {
    expect(scrubMatchesRow('samples', 'samples/catalog.sqlite')).toBe(false)
  })

  it('matches nothing when there is no scrub path', () => {
    expect(scrubMatchesRow(null, 'samples')).toBe(false)
    expect(scrubMatchesRow(undefined, 'samples')).toBe(false)
  })
})
