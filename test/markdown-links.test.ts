/** Relative links in rendered markdown resolve against the file's place in
 *  the tree (`resolveTreeKey` / `resolveTreeHref` / `markdownCtx`), not the
 *  page URL. */
import { describe, expect, it } from 'vitest'
import { markdownCtx, resolveTreeHref, resolveTreeKey } from '../src/react/markdownLinks'
import { MockStore } from '../src/stores/mock'
import type { Store } from '../src/types'

describe('resolveTreeKey', () => {
  const at = (href: string, rootPrefix?: string) => resolveTreeKey(href, 'docs/regions/nyc.md', rootPrefix)

  it('resolves siblings, parents and subdirs against the file\'s dir', () => {
    expect(at('sfo.md')).toEqual({ key: 'docs/regions/sfo.md', suffix: '' })
    expect(at('./sfo.md')).toEqual({ key: 'docs/regions/sfo.md', suffix: '' })
    expect(at('../intro.md')).toEqual({ key: 'docs/intro.md', suffix: '' })
    expect(at('../../samples/events.parquet')).toEqual({ key: 'samples/events.parquet', suffix: '' })
    expect(at('maps/nyc.png')).toEqual({ key: 'docs/regions/maps/nyc.png', suffix: '' })
  })

  it('keeps a dir link\'s trailing slash (and names `.` / `..` as dirs)', () => {
    expect(at('../guide/')).toEqual({ key: 'docs/guide/', suffix: '' })
    expect(at('..')).toEqual({ key: 'docs/', suffix: '' })
    expect(at('.')).toEqual({ key: 'docs/regions/', suffix: '' })
    expect(at('../..')).toEqual({ key: '', suffix: '' })
  })

  it('keeps a query/hash suffix verbatim', () => {
    expect(at('sfo.md#timezone')).toEqual({ key: 'docs/regions/sfo.md', suffix: '#timezone' })
    expect(at('../../samples/events.parquet?page=2')).toEqual({ key: 'samples/events.parquet', suffix: '?page=2' })
  })

  it('leaves non-relative hrefs alone', () => {
    for (const href of ['https://example.com/x', 'mailto:a@b.c', '//cdn.example.com/x', '/mock/data/', '#anchor', '?q=1', ''])
      expect([href, at(href)]).toEqual([href, null])
  })

  it('refuses to climb above the store root, or out of `rootPrefix`', () => {
    expect(at('../../../etc/passwd')).toBe(null)
    expect(resolveTreeKey('../other/x.md', 'docs/a.md', 'docs/')).toBe(null)
    expect(resolveTreeKey('b.md', 'docs/a.md', 'docs/')).toEqual({ key: 'docs/b.md', suffix: '' })
  })
})

describe('resolveTreeHref', () => {
  it('maps the resolved key into the route, stripping `rootPrefix`', () => {
    expect(resolveTreeHref('../../samples/events.parquet', 'docs/regions/nyc.md', { routeBase: '/mock/' })).toBe('/mock/samples/events.parquet')
    expect(resolveTreeHref('guide/', 'pub/docs/README.md', { routeBase: '/files', rootPrefix: 'pub/' })).toBe('/files/docs/guide/')
    expect(resolveTreeHref('https://x.dev', 'docs/a.md', { routeBase: '/files' })).toBe(null)
  })
})

describe('markdownCtx', () => {
  const nav: string[] = []
  const base = { routeBase: '/files', navigate: (h: string) => { nav.push(h) } }

  it('marks in-tree links internal, passes the rest through', () => {
    const ctx = markdownCtx('docs/intro.md', { store: MockStore({}), ...base })
    expect(ctx.resolveHref('guide/setup.md')).toEqual({ href: '/files/docs/guide/setup.md', internal: true })
    expect(ctx.resolveHref('https://x.dev')).toEqual({ href: 'https://x.dev', internal: false })
  })

  it('points relative images at the store\'s URL when it can mint one, else leaves them', () => {
    const withUrl: Store = { ...MockStore({}), getUrl: (p, o) => `https://cdn.test/${p}${o?.inline ? '?inline=1' : ''}` }
    expect(markdownCtx('docs/intro.md', { store: withUrl, ...base }).resolveSrc('img/a%20b.png')).toBe('https://cdn.test/docs/img/a b.png?inline=1')
    expect(markdownCtx('docs/intro.md', { store: MockStore({}), ...base }).resolveSrc('img/a.png')).toBe('img/a.png')
    const denies: Store = { ...MockStore({}), getUrl: () => { throw new Error('ForbiddenPathError') } }
    expect(markdownCtx('docs/intro.md', { store: denies, ...base }).resolveSrc('img/a.png')).toBe('img/a.png')
  })
})
