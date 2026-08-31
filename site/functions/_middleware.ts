/** Cloudflare Pages middleware — stamps per-path Open Graph tags into the
 *  SPA's HTML so an unfurler (which never runs the JS that would set them
 *  client-side) sees a card for the path being shared.
 *
 *  Cheap on purpose: it derives `og:title` + the `og:image` URL from the
 *  request path alone (no store call), and points `og:image` at
 *  `/og/<path>.png`, which `functions/og/[[path]].ts` renders. The heavy
 *  data resolution lives there, cached, not on every HTML request.
 *
 *  Deploy note: this file is a Cloudflare Pages Function — it runs only
 *  once the site is on CFP (see `../../specs/cfp-og-images.md`). It is
 *  outside the Vite app + the site `tsconfig` (`include: ['src']`), so it
 *  doesn't affect the current GHP build. */
import { injectOgTags } from '@rdub/file-tree/og'

const SITE = 'https://file-tree.rbw.sh'
/** Demo mounts that address a path worth a per-path card. */
const MOUNTS = /^\/(mock|http|s3|r2|gcs)(?:\/(.*))?$/

// `PagesFunction` is provided by the CF Pages runtime at deploy time.
export const onRequest = async (ctx: { request: Request; next: () => Promise<Response> }): Promise<Response> => {
  const res = await ctx.next()
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res

  const url = new URL(ctx.request.url)
  const m = url.pathname.match(MOUNTS)
  if (!m) return res
  const mount = m[1]
  const rest = (m[2] ?? '').replace(/\/+$/, '')
  const leaf = decodeURIComponent(rest.split('/').pop() || mount)
  const imgPath = rest ? `${mount}/${rest}` : mount

  const html = await res.text()
  const stamped = injectOgTags(html, {
    title: `${leaf} — @rdub/file-tree`,
    image: `${SITE}/og/${imgPath}.png`,
    url: url.href,
    siteName: '@rdub/file-tree',
  })
  // Preserve the original headers (content-length is recomputed by the
  // runtime for the new body).
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(stamped, { status: res.status, headers })
}
