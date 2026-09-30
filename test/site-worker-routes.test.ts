/** The demo Worker's URL scheme (`site/worker/src/routes.ts`): page
 *  path ↔ target ↔ share-image path, and the per-mount card source. */
import { describe, expect, it } from 'vitest'
import {
  MOUNT_SOURCES, ogImagePath, pageOg, pageTarget, parseOgImagePath,
} from '../site/worker/src/routes'

describe('pageTarget', () => {
  it('maps mount pages to (mount, splat), keeping the splat verbatim', () => {
    expect([
      '/mock',
      '/mock/',
      '/mock/docs/',
      '/mock/docs',
      '/mock/samples/events.parquet',
      '/http/demo/a%20b/',
      '/s3/my-bucket/x.csv',
    ].map(pageTarget)).toEqual([
      { mount: 'mock', splat: '' },
      { mount: 'mock', splat: '' },
      { mount: 'mock', splat: 'docs/' },
      { mount: 'mock', splat: 'docs' },
      { mount: 'mock', splat: 'samples/events.parquet' },
      { mount: 'http', splat: 'demo/a%20b/' },
      { mount: 's3', splat: 'my-bucket/x.csv' },
    ])
  })

  it('is null outside every mount', () => {
    expect(['/', '/elide', '/og', '/og/docs/', '/mockery/x'].map(pageTarget)).toEqual([null, null, null, null, null])
  })
})

describe('ogImagePath / parseOgImagePath', () => {
  it('appends the extension to the splat, so a dir keeps its trailing slash', () => {
    expect([
      ogImagePath({ mount: 'mock', splat: '' }),
      ogImagePath({ mount: 'mock', splat: 'docs/' }),
      ogImagePath({ mount: 'mock', splat: 'docs.v2/' }),
      ogImagePath({ mount: 'http', splat: 'demo/x.parquet' }, 'svg'),
    ]).toEqual([
      '/og/mock/.png',
      '/og/mock/docs/.png',
      '/og/mock/docs.v2/.png',
      '/og/http/demo/x.parquet.svg',
    ])
  })

  it('round-trips', () => {
    const targets = [
      { mount: 'mock', splat: '' },
      { mount: 'mock', splat: 'docs/' },
      { mount: 'mock', splat: 'docs.v2/' },
      { mount: 'http', splat: 'demo/a%20b.csv' },
      { mount: 'gcs', splat: 'b/logo.png' },
    ] as const
    expect(targets.map(t => parseOgImagePath(ogImagePath(t)))).toEqual(
      targets.map(t => ({ ...t, format: 'png' })),
    )
  })

  it('leaves the SPA `/og/*` preview route and unknown mounts alone', () => {
    expect([
      '/og',
      '/og/',
      '/og/docs/',
      '/og/README.md',
      '/og/docs/logo.png',
      '/og/mock/docs/.jpg',
      '/og/mock.png',
    ].map(parseOgImagePath)).toEqual([null, null, null, null, null, null, null])
  })
})

describe('pageOg', () => {
  it('titles a mount page by its leaf, and points at its image', () => {
    expect([
      pageOg('/mock/docs/'),
      pageOg('/mock'),
      pageOg('/http/demo/a%20b.csv'),
    ]).toEqual([
      { title: 'docs — @rdub/file-tree', description: 'MockStore demo: /docs/', imagePath: '/og/mock/docs/.png' },
      { title: 'mock — @rdub/file-tree', description: 'MockStore demo: /', imagePath: '/og/mock/.png' },
      { title: 'a b.csv — @rdub/file-tree', description: 'R2 buckets over HttpStore: /demo/a b.csv', imagePath: '/og/http/demo/a%20b.csv.png' },
    ])
  })

  it('gives other pages the site card', () => {
    const site = {
      title: '@rdub/file-tree — demos',
      description: 'Storage-agnostic file/directory tree browser: React UI + Store abstraction (R2, S3, GCS, HTTP, …).',
      imagePath: '/og/mock/.png',
    }
    expect(['/', '/elide', '/og/docs/'].map(pageOg)).toEqual([site, site, site])
  })
})

describe('MOUNT_SOURCES', () => {
  it('backs `mock` with the fixture, `http` with live R2, the bucket browsers with the path alone', () => {
    expect(MOUNT_SOURCES).toEqual({
      mock: { kind: 'fixture', maxAge: 86400 },
      http: { kind: 'r2', maxAge: 3600 },
      s3: { kind: 'path', maxAge: 86400 },
      r2: { kind: 'path', maxAge: 86400 },
      gcs: { kind: 'path', maxAge: 86400 },
    })
  })
})
