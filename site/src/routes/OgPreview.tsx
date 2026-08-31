/** Preview of `@rdub/file-tree/og`'s share card, rendered inline so the
 *  card is visible without the Cloudflare edge that serves it in prod.
 *  Renders the same SVG a Pages Function would rasterize to PNG. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { walkTreeSource } from '@rdub/file-tree/react'
import { renderOgCard, ogCardData } from '@rdub/file-tree/og'
import { DEMO_FIXTURE } from '../fixtures/demo'

const EXAMPLES = ['', 'docs/', 'samples/', 'README.md', 'samples/catalog.sqlite']

export function OgPreview() {
  const store = useMemo(() => MockStore(DEMO_FIXTURE), [])
  const treeSource = useMemo(() => walkTreeSource(store), [store])
  const loc = useLocation()
  const splat = loc.pathname.replace(/^\/og\/?/, '')
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let cancelled = false
    ogCardData({ store, treeSource, splat }).then(
      d => { if (!cancelled) setSvg(renderOgCard(d)) },
      () => { if (!cancelled) setSvg('') },
    )
    return () => { cancelled = true }
  }, [store, treeSource, splat])

  // Let the SVG scale to the container: drop the fixed px size, keep the
  // viewBox.
  const scaled = svg.replace(/width="1200" height="630"/, 'width="100%" height="auto"')

  return (
    <div style={{ padding: '1rem', maxWidth: 760 }}>
      <h1 style={{ fontSize: '1.4em' }}>OG card preview</h1>
      <p style={{ opacity: 0.8 }}>
        The share card <code>@rdub/file-tree/og</code> renders for a path. Path:{' '}
        <code>{splat || '(root)'}</code>
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {EXAMPLES.map(p => (
          <Link key={p} to={`/og/${p}`}>{p || '(root)'}</Link>
        ))}
      </div>
      <div
        style={{ border: '1px solid #333', borderRadius: 8, overflow: 'hidden', lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: scaled }}
      />
    </div>
  )
}
