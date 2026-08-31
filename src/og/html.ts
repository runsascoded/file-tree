/** Per-path Open Graph `<head>` rewriting — the other half of dynamic
 *  OGI. An SPA serves one static `index.html`; an edge (CF Pages
 *  middleware, a Vercel edge fn, any origin proxy) calls `injectOgTags`
 *  to stamp per-path `og:*` / `twitter:*` tags into that HTML *before*
 *  it reaches an unfurler, which never runs the JS that would otherwise
 *  set them. Pure string→string, so it's testable and host-agnostic.
 *  See `specs/cfp-og-images.md`. */

export interface OgMeta {
  /** `og:title` + `<title>`. */
  title: string
  /** `og:image` — absolute URL preferred (unfurlers don't resolve
   *  relative paths reliably). */
  image: string
  /** `og:description` + `twitter:description`. */
  description?: string
  /** `og:url` — the canonical page URL. */
  url?: string
  /** `og:type`. Default `website`. */
  type?: string
  /** `og:site_name`. */
  siteName?: string
  /** `og:image:width` / `:height`. Default 1200×630. */
  imageWidth?: number
  imageHeight?: number
  /** `twitter:card`. Default `summary_large_image`. */
  twitterCard?: string
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;'))
}

/** The block of `<meta>` tags for `meta`, newline-joined, no wrapping
 *  `<head>`. */
export function ogTags(meta: OgMeta): string {
  const w = meta.imageWidth ?? 1200
  const h = meta.imageHeight ?? 630
  const rows: [string, string, string][] = [
    ['property', 'og:type', meta.type ?? 'website'],
    ['property', 'og:title', meta.title],
    ['property', 'og:image', meta.image],
    ['property', 'og:image:width', String(w)],
    ['property', 'og:image:height', String(h)],
    ['name', 'twitter:card', meta.twitterCard ?? 'summary_large_image'],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:image', meta.image],
  ]
  if (meta.description != null) {
    rows.push(['property', 'og:description', meta.description])
    rows.push(['name', 'twitter:description', meta.description])
  }
  if (meta.url != null) rows.push(['property', 'og:url', meta.url])
  if (meta.siteName != null) rows.push(['property', 'og:site_name', meta.siteName])
  return rows.map(([attr, key, val]) => `<meta ${attr}="${key}" content="${esc(val)}">`).join('\n')
}

/** Strip any existing `og:*` / `twitter:*` meta and inject `meta`'s tags
 *  (and a fresh `<title>`) into `html`'s `<head>`. Idempotent: rerunning
 *  with the same input reproduces the same output. */
export function injectOgTags(html: string, meta: OgMeta): string {
  // Drop existing OG/Twitter meta so re-stamping doesn't duplicate.
  let out = html.replace(
    /[ \t]*<meta\b[^>]*\b(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\n?/gi,
    '',
  )
  // Replace an existing <title>, else the block carries the title tag.
  const titleTag = `<title>${esc(meta.title)}</title>`
  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, titleTag)
  }
  const block = (/<title>[\s\S]*?<\/title>/i.test(out) ? '' : `${titleTag}\n`) + ogTags(meta)
  // Insert before </head> (case-insensitive); fall back to prepending.
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${block}\n</head>`)
  return block + out
}
