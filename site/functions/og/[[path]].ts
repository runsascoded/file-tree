/** Cloudflare Pages Function: `GET /og/<path>.png` — the share image for
 *  a blob path. Resolves `OgCardData` against the same R2 `MultiStore`
 *  the `/http` demo uses, renders the SVG card, and (once the rasterizer
 *  is wired) returns a PNG. Unfurlers want PNG at 1200×630.
 *
 *  Two deploy steps remain, both flagged inline — they need the CFP
 *  migration + a hosted store, so they can't be exercised from the GHP
 *  build (see `../../../specs/cfp-og-images.md`):
 *    1. Bind the R2 buckets on the Pages project (as `site/worker` does
 *       today) and construct the `MultiStore` from them.
 *    2. Add `@resvg/resvg-wasm` + one bundled font weight to rasterize
 *       SVG → PNG in the Worker. Until then this serves the SVG, which
 *       browsers render but some unfurlers reject. */
import { ogCardData, renderOgCard, OG_WIDTH } from '@rdub/file-tree/og'
// import { MultiStore } from '@rdub/file-tree/stores/multi'
// import { walkTreeSource } from '@rdub/file-tree/renderers/walkTreeSource'
// import { Resvg, initWasm } from '@resvg/resvg-wasm'
// import RESVG_WASM from '@resvg/resvg-wasm/index_bg.wasm'      // CF bundles .wasm imports
// import FONT from '../../assets/Inter-Regular.ttf'            // one weight, ~200KB

export const onRequest = async (ctx: { params: { path: string | string[] }; env: Record<string, unknown> }): Promise<Response> => {
  const raw = ctx.params.path
  const joined = Array.isArray(raw) ? raw.join('/') : raw
  const splat = joined.replace(/\.png$/, '')

  // Step 1: build the store from the Pages project's R2 bindings, and a
  // tree source for dir treemaps. For a large bucket prefer a snapshot
  // source over a live walk; `walkTreeSource` is bounded here.
  //   const store = MultiStore({ ctbk: ctx.env.CTBK, ... })
  //   const treeSource = walkTreeSource(store, { maxNodes: 5000 })
  //   const data = await ogCardData({ store, treeSource, splat })
  //
  // Placeholder until the binding is wired: a plain card from the path.
  const leaf = splat.replace(/\/+$/, '').split('/').pop() || 'root'
  const data = await ogCardData({
    store: { async list() { return { entries: [] } } } as never,
    splat,
  }).catch(() => ({ crumbs: [], name: leaf, kind: 'dir' as const }))
  const svg = renderOgCard(data)

  // Step 2: rasterize. Until resvg is added, serve the SVG.
  //   await initWasm(RESVG_WASM)
  //   const png = new Resvg(svg, {
  //     font: { fontBuffers: [new Uint8Array(FONT as ArrayBuffer)], loadSystemFonts: false },
  //     fitTo: { mode: 'width', value: OG_WIDTH },
  //   }).render().asPng()
  //   return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } })
  void OG_WIDTH
  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
