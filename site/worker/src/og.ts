/** The edge half of dynamic OG images: per-path `<head>` stamping for
 *  SPA HTML, and `/og/<mount>/<splat>.<png|svg>` rendering. The card
 *  itself is the library's (`renderOgCard(await ogCardData(...))`); this
 *  file only wires stores, rasterizes, and caches. */
import { injectOgTags, ogCardData, renderOgCard, OG_WIDTH } from '@rdub/file-tree/og'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import RESVG_WASM from '@resvg/resvg-wasm/index_bg.wasm'
import INTER_400 from '../fonts/Inter-400.ttf'
import INTER_700 from '../fonts/Inter-700.ttf'
import MONO_400 from '../fonts/JetBrainsMono-400.ttf'
import MONO_600 from '../fonts/JetBrainsMono-600.ttf'
import type { Env } from './env'
import { MOUNT_SOURCES, SITE_NAME, pageOg, type OgImageRequest } from './routes'
import { cardSource } from './stores'

/** A Worker has no system fonts, so resvg gets exactly these (Latin
 *  subsets, see `fonts/README.md`). resvg-wasm ignores the generic
 *  `monospace` → `monospaceFamily` mapping, so the card also names the
 *  families outright (`CARD_FONTS`, first in its stacks). */
const FONT_OPTIONS = {
  fontBuffers: [INTER_400, INTER_700, MONO_400, MONO_600].map(b => new Uint8Array(b)),
  loadSystemFonts: false,
  defaultFontFamily: 'Inter',
  sansSerifFamily: 'Inter',
  monospaceFamily: 'JetBrains Mono',
}

const CARD_FONTS = { sansFont: 'Inter', monoFont: 'JetBrains Mono' }

let wasmReady: Promise<void> | undefined

async function svgToPng(svg: string): Promise<Uint8Array> {
  wasmReady ??= initWasm(RESVG_WASM)
  await wasmReady
  const resvg = new Resvg(svg, { font: FONT_OPTIONS, fitTo: { mode: 'width', value: OG_WIDTH } })
  try {
    return resvg.render().asPng()
  } finally {
    resvg.free()
  }
}

/** Render (or serve from the colo cache) the card for `req`. The cache
 *  key carries the deploy's version id, so a deploy never serves the
 *  previous one's PNGs; within a deploy, `MOUNT_SOURCES[mount].maxAge`
 *  bounds staleness for the live R2 tree. (The Cache API is a no-op on
 *  `*.workers.dev`; it takes effect on a custom domain.) */
export async function serveOgImage(
  request: Request,
  req: OgImageRequest,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default
  const keyUrl = new URL(request.url)
  keyUrl.search = `v=${env.CF_VERSION_METADATA?.id ?? 'dev'}`
  const cacheKey = new Request(keyUrl.toString(), { method: 'GET' })
  if (request.method === 'GET') {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }

  const { store, treeSource } = await cardSource(req.mount, env)
  const data = await ogCardData({ store, splat: req.splat, ...(treeSource ? { treeSource } : {}) })
  const svg = renderOgCard(data, CARD_FONTS)
  const { maxAge } = MOUNT_SOURCES[req.mount]
  const headers = {
    'content-type': req.format === 'png' ? 'image/png' : 'image/svg+xml; charset=utf-8',
    'cache-control': `public, max-age=${maxAge}`,
    'access-control-allow-origin': '*',
  }
  const body = req.format === 'png' ? await svgToPng(svg) : svg
  const response = new Response(body, { headers })
  if (request.method === 'GET') ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

/** Stamp per-path `og:*` / `twitter:*` tags into a SPA HTML response.
 *  Path-only (no store call): `og:image` points at the image route,
 *  which does the resolving, cached. Everything but the `<head>` is
 *  untouched. */
export async function stampHtml(request: Request, res: Response): Promise<Response> {
  const url = new URL(request.url)
  const og = pageOg(url.pathname)
  const html = await res.text()
  const stamped = injectOgTags(html, {
    title: og.title,
    description: og.description,
    image: `${url.origin}${og.imagePath}`,
    url: url.href,
    siteName: SITE_NAME,
  })
  // The body changed, so the asset's length + validator no longer
  // describe it.
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('etag')
  return new Response(stamped, { status: res.status, headers })
}
