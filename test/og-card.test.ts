/** OG card renderer: the pure SVG output (structure asserted exactly),
 *  then the `ogCardData` resolver against a MockStore + walkTreeSource. */
import { describe, expect, it } from 'vitest'
import { renderOgCard, ogCardData, OG_WIDTH, OG_HEIGHT, type OgCardData } from '../src/og/card'
import { ogTags, injectOgTags } from '../src/og/html'
import { MockStore } from '../src/stores/mock'
import { CONFORMANCE_FIXTURE } from '../src/test/conformance'
import { walkTreeSource } from '../src/renderers/walkTreeSource'

/** Ordered `<text>` contents. */
function texts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1])
}
/** Count of a given tag. */
function count(svg: string, tag: string): number {
  return [...svg.matchAll(new RegExp(`<${tag}\\b`, 'g'))].length
}

describe('renderOgCard', () => {
  it('a file card is header + title + meta + glyph + brand, on a 1200×630 canvas', () => {
    const svg = renderOgCard({
      crumbs: ['docs'], name: 'intro.md', kind: 'file',
      size: 12, storeLabel: 'mock://demo-bucket', badge: 'md',
    })
    expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}"`)).toBe(true)
    expect(texts(svg)).toEqual([
      'mock://demo-bucket / docs',
      'intro.md',
      '12 B  ·  md',
      '.md',
      '@rdub/file-tree',
    ])
    // background + top accent + the body panel — no treemap tiles.
    expect(count(svg, 'rect')).toBe(3)
  })

  it('a dir card draws one tile per child, labelled where it fits', () => {
    // Three roughly-equal children so every tile clears the label
    // threshold — the ordered text list is then fully determined.
    const tiles = [
      { name: 'alpha', size: 100 },
      { name: 'bravo', size: 90 },
      { name: 'gamma', size: 80 },
    ]
    const data: OgCardData = {
      crumbs: [], name: 'root', kind: 'dir',
      size: 270, storeLabel: 'mock://demo-bucket', badge: '3 items', treemap: tiles,
    }
    const svg = renderOgCard(data)
    // background + accent + 3 tiles.
    expect(count(svg, 'rect')).toBe(5)
    const t = texts(svg)
    // Header, title, meta come first; brand last.
    expect(t[0]).toBe('mock://demo-bucket')
    expect(t[1]).toBe('root')
    expect(t[2]).toBe('270 B  ·  3 items')
    expect(t[t.length - 1]).toBe('@rdub/file-tree')
    // Every child renders its name and its size as tile labels.
    const labels = t.slice(3, -1)
    expect(labels).toEqual(['alpha', '100 B', 'bravo', '90 B', 'gamma', '80 B'])
  })

  it('omits the treemap and shows a folder glyph for a plain dir card', () => {
    const svg = renderOgCard({ crumbs: [], name: 'empty', kind: 'dir', storeLabel: 's' })
    expect(texts(svg)).toEqual(['s', 'empty', '📁', '@rdub/file-tree'])
    expect(count(svg, 'rect')).toBe(3) // bg + accent + panel, no tiles
  })
})

describe('ogCardData', () => {
  const store = () => MockStore(CONFORMANCE_FIXTURE)
  const tree = () => walkTreeSource(MockStore(CONFORMANCE_FIXTURE))

  it('resolves a directory to its recursive size + largest-first tiles', async () => {
    const data = await ogCardData({ store: store(), treeSource: tree(), splat: 'docs/' })
    expect({ name: data.name, kind: data.kind, size: data.size, badge: data.badge }).toEqual({
      name: 'docs', kind: 'dir', size: 34, badge: '2 items', // intro.md 12 + guide 22
    })
    expect(data.crumbs).toEqual([])
    expect(data.treemap).toEqual([
      { name: 'guide', size: 22 },
      { name: 'intro.md', size: 12 },
    ])
  })

  it('resolves the root, sized and tiled over its top-level children', async () => {
    const data = await ogCardData({ store: store(), treeSource: tree(), splat: '' })
    expect({ kind: data.kind, size: data.size, badge: data.badge }).toEqual({
      kind: 'dir', size: 343, badge: '4 items',
    })
    expect(data.treemap).toEqual([
      { name: 'binary.bin', size: 256 },
      { name: 'docs', size: 34 },
      { name: 'README.md', size: 29 },
      { name: 'data', size: 24 },
    ])
  })

  it('resolves a file to its size + extension badge, no treemap', async () => {
    const data = await ogCardData({ store: store(), splat: 'docs/intro.md' })
    expect(data).toEqual({
      crumbs: ['docs'], name: 'intro.md', kind: 'file',
      size: 12, storeLabel: undefined, badge: 'md',
    })
    expect(data.treemap).toBeUndefined()
  })

  it('degrades a dir to a plain card when no treeSource is given', async () => {
    const data = await ogCardData({ store: store(), splat: 'docs/' })
    expect(data.treemap).toBeUndefined()
    expect({ name: data.name, kind: data.kind }).toEqual({ name: 'docs', kind: 'dir' })
  })
})

describe('injectOgTags', () => {
  it('emits the og/twitter tag block for the given meta', () => {
    const tags = ogTags({
      title: 'docs/', image: 'https://x.dev/og/docs.png',
      description: '459 B · 3 items', url: 'https://x.dev/mock/docs/', siteName: 'file-tree',
    })
    expect(tags.split('\n')).toEqual([
      '<meta property="og:type" content="website">',
      '<meta property="og:title" content="docs/">',
      '<meta property="og:image" content="https://x.dev/og/docs.png">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="docs/">',
      '<meta name="twitter:image" content="https://x.dev/og/docs.png">',
      '<meta property="og:description" content="459 B · 3 items">',
      '<meta name="twitter:description" content="459 B · 3 items">',
      '<meta property="og:url" content="https://x.dev/mock/docs/">',
      '<meta property="og:site_name" content="file-tree">',
    ])
  })

  it('replaces the title, strips prior og/twitter meta, and injects before </head>', () => {
    const html = [
      '<!doctype html><html><head>',
      '<meta charset="utf-8">',
      '<title>old</title>',
      '<meta property="og:title" content="stale">',
      '<meta name="twitter:image" content="stale.png">',
      '</head><body><div id="root"></div></body></html>',
    ].join('\n')
    const out = injectOgTags(html, { title: 'new', image: 'https://x.dev/og.png' })
    // Old OG/Twitter meta gone; title replaced; no duplicate title.
    expect(out.includes('content="stale"')).toBe(false)
    expect(out.includes('content="stale.png"')).toBe(false)
    expect((out.match(/<title>/g) ?? []).length).toBe(1)
    expect(out.includes('<title>new</title>')).toBe(true)
    // Idempotent: a second pass reproduces the first's output.
    expect(injectOgTags(out, { title: 'new', image: 'https://x.dev/og.png' })).toBe(out)
    // The block lands inside <head>.
    const head = out.slice(out.indexOf('<head>'), out.indexOf('</head>'))
    expect(head.includes('<meta property="og:image" content="https://x.dev/og.png">')).toBe(true)
  })
})
