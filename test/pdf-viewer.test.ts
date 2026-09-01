/** `<PdfViewer>` render test.
 *
 *  The repo has no jsdom/testing-library harness, but `react-dom/server`
 *  renders in node. The direct-`getUrl` path renders synchronously (no
 *  effect, no blob), so we can assert its exact iframe markup; the
 *  fallback path (no `getUrl`) renders its loading state before any
 *  effect runs, so we assert that exactly too. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { PdfViewer } from '../src/react/PdfViewer'
import { MockStore } from '../src/stores/mock'

const PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF'

const PATH = 'docs/sample.pdf'

test('renders store.getUrl directly in an iframe', () => {
  const store = { ...MockStore({ [PATH]: PDF }), getUrl: (p: string) => `https://cdn.example.test/${p}` }
  const html = renderToStaticMarkup(createElement(PdfViewer, { store, path: PATH }))
  expect(html).toBe(
    '<iframe src="https://cdn.example.test/docs/sample.pdf" title="docs/sample.pdf"' +
    ' style="width:100%;height:80vh;border:none;border-radius:4px"></iframe>',
  )
})

test('renders a loading state for a store without getUrl (pre-blob)', () => {
  const store = MockStore({ [PATH]: { bytes: new TextEncoder().encode(PDF), contentType: 'application/octet-stream' } })
  const html = renderToStaticMarkup(createElement(PdfViewer, { store, path: PATH }))
  expect(html).toBe('<div style="opacity:0.6">loading docs/sample.pdf…</div>')
})
