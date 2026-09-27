/** `<FileTree home titleHref>`: a link back to the host site as the first
 *  breadcrumb segment, and a linkable title. Rendered to static markup under
 *  a `MemoryRouter` (vitest runs in node) and compared exactly. */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { FileTree } from '../src/react/FileTree'
import { MockStore } from '../src/stores/mock'

// react-router's `Link`/`MemoryRouter` use `useLayoutEffect`, which React
// warns about under the server renderer; irrelevant to static markup.
beforeAll(() => {
  const error = console.error
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return
    error(...args)
  })
})

const store = MockStore({ 'records/payments.csv': 'a,b\n1,2\n' }, { describe: 'mock://b/' })

/** The `<h1>` (if any) and the breadcrumb `<nav>` of a `<FileTree>` at `url`. */
function header(url: string, props: Record<string, unknown> = {}): { h1: string | null; nav: string } {
  const html = renderToStaticMarkup(
    h(MemoryRouter, { initialEntries: [url] }, h(FileTree, { store, routeBase: '/files', ...props }) as ReactNode),
  )
  return {
    h1: html.match(/<h1[^>]*>.*?<\/h1>/)?.[0] ?? null,
    nav: html.match(/<nav aria-label="Breadcrumb".*?<\/nav>/)![0],
  }
}

const NAV_OPEN = '<nav aria-label="Breadcrumb" style="font-family:ui-monospace, monospace;font-size:0.95em;margin-bottom:0.5em">'
const SEP = '<span style="opacity:0.5"> / </span>'
const TREE = `<span><a href="/files/">mock://b/</a></span><span>${SEP}<a href="/files/records">records</a></span><span>${SEP}<span style="opacity:0.7">payments.csv</span></span>`

describe('FileTree home link', () => {
  it('neither set: no title, breadcrumb starts at the store root', () => {
    const { h1, nav } = header('/files/records/payments.csv')
    expect(h1).toBe(null)
    expect(nav).toBe(`${NAV_OPEN}${TREE}</nav>`)
  })

  it('`home` renders a plain link before the root crumb', () => {
    const { nav } = header('/files/records/payments.csv', { home: { href: 'https://jct.rbw.sh', label: 'jct.rbw.sh' } })
    expect(nav).toBe(`${NAV_OPEN}<span><a href="https://jct.rbw.sh">jct.rbw.sh</a></span>${TREE.replace('<span><a', `<span>${SEP}<a`)}</nav>`)
  })

  it('`titleHref` makes the title a link; without it the title is plain text', () => {
    expect(header('/files/', { title: 'Files' }).h1).toBe('<h1 style="font-size:1.4em;margin:0 0 0.3em">Files</h1>')
    expect(header('/files/', { title: 'Files', titleHref: '/' }).h1).toBe(
      '<h1 style="font-size:1.4em;margin:0 0 0.3em"><a href="/" style="color:inherit;text-decoration:none">Files</a></h1>',
    )
  })

  it('`renderCrumb` sees the home crumb as `kind: "home"`, indexed first', () => {
    const seen: string[] = []
    header('/files/records/payments.csv', {
      home: { href: '/', label: 'JC tax map' },
      renderCrumb: ({ crumb, index, defaultNode }: { crumb: { kind?: string; to: string }; index: number; defaultNode: ReactNode }) => {
        seen.push(`${index}:${crumb.kind ?? 'tree'}:${crumb.to}`)
        return defaultNode
      },
    })
    expect(seen).toEqual(['0:home:/', '1:tree:/files/', '2:tree:/files/records', '3:tree:/files/records/payments.csv'])
  })
})
