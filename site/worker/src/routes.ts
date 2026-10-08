/** The demo edge's URL scheme — pure, so it's unit-tested from the lib's
 *  vitest suite (`test/site-worker-routes.test.ts`) without a Worker.
 *
 *  Two kinds of URL carry a *target* (a mount + a splat within it):
 *   - a SPA page, `/<mount>/<splat>` (what `<FileTree routeBase>` emits);
 *   - its share image, `/og/<mount>/<splat>.<png|svg>`.
 *
 *  The image URL is the page URL's splat *verbatim* plus the extension,
 *  so a directory's trailing slash survives (`/mock/docs/` →
 *  `/og/mock/docs/.png`, the root `/mock` → `/og/mock/.png`). That keeps
 *  the mapping an exact inverse: stripping the slash would hand
 *  `parsePath` `docs.v2` for a dir named `docs.v2/`, and it'd guess
 *  "file". The splat stays percent-encoded end to end; `parsePath`
 *  decodes it. */

/** SPA mounts that address a path worth a per-path card. `mock` and
 *  `http` have a server-side store (fixture / R2); the bucket browsers
 *  (`s3`, `r2`, `gcs`) are client-credentialed, so the edge can only
 *  draw a path-only card for them. */
export const MOUNTS = ['mock', 'http', 's3', 'r2', 'gcs'] as const
export type Mount = typeof MOUNTS[number]

export type OgFormat = 'png' | 'svg'

export interface OgTarget {
  mount: Mount
  /** Route-relative splat, percent-encoded as in the URL; `''` = the
   *  mount's root, a trailing `/` = a directory. */
  splat: string
}

export interface OgImageRequest extends OgTarget {
  format: OgFormat
}

function isMount(s: string): s is Mount {
  return (MOUNTS as readonly string[]).includes(s)
}

/** The target a SPA page path addresses, or `null` for a page that
 *  isn't under a mount (`/`, `/elide`, the `/og` preview route, …). */
export function pageTarget(pathname: string): OgTarget | null {
  const m = pathname.match(/^\/([^/]+)(?:\/(.*))?$/)
  if (!m || !isMount(m[1])) return null
  return { mount: m[1], splat: m[2] ?? '' }
}

/** A target's share-image path (site-relative). */
export function ogImagePath({ mount, splat }: OgTarget, format: OgFormat = 'png'): string {
  return `/og/${mount}/${splat}.${format}`
}

/** Inverse of `ogImagePath`; `null` for anything else under `/og/` (the
 *  SPA's own `/og/*` preview route lives there too, and falls through
 *  to the assets). */
export function parseOgImagePath(pathname: string): OgImageRequest | null {
  const m = pathname.match(/^\/og\/([^/]+)\/(.*)\.(png|svg)$/)
  if (!m || !isMount(m[1])) return null
  return { mount: m[1], splat: m[2], format: m[3] as OgFormat }
}

/** Where a mount's cards get their data, and how long a rendered card
 *  may be cached (seconds):
 *   - `fixture` — the site's own `MockStore` fixture (the bytes
 *     `MockDemo` browses); changes only on deploy.
 *   - `r2` — the live R2 `MultiStore` `/http` browses (and `/v1/files`
 *     serves); objects can change, so a shorter TTL.
 *   - `path` — no server-side store (client-credentialed bucket
 *     browsers): a path-only card, no size or treemap. */
export type CardSourceKind = 'fixture' | 'r2' | 'path'

export const MOUNT_SOURCES: Record<Mount, { kind: CardSourceKind; maxAge: number }> = {
  mock: { kind: 'fixture', maxAge: 86400 },
  http: { kind: 'r2', maxAge: 3600 },
  s3: { kind: 'path', maxAge: 86400 },
  r2: { kind: 'path', maxAge: 86400 },
  gcs: { kind: 'path', maxAge: 86400 },
}

const MOUNT_LABELS: Record<Mount, string> = {
  mock: 'MockStore demo',
  http: 'R2 buckets over HttpStore',
  s3: 'S3 browser',
  r2: 'R2 browser',
  gcs: 'GCS browser',
}

export const SITE_NAME = '@rdub/file-tree'
const SITE_TITLE = SITE_NAME
const SITE_DESCRIPTION = 'Storage-agnostic file/directory tree browser: React UI + Store abstraction (R2, S3, GCS, HTTP, …).'

/** What a page's `<head>` should advertise: title, description, and
 *  the (site-relative) image path. Derived from the path alone — no
 *  store call on the HTML path; the image route does the resolving. A
 *  page outside every mount gets the site card (the mock root). */
export interface PageOg {
  title: string
  description: string
  imagePath: string
}

export function pageOg(pathname: string): PageOg {
  const t = pageTarget(pathname)
  if (!t) {
    return { title: SITE_TITLE, description: SITE_DESCRIPTION, imagePath: ogImagePath({ mount: 'mock', splat: '' }) }
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(t.splat)
  } catch {
    decoded = t.splat
  }
  const trimmed = decoded.replace(/\/+$/, '')
  const leaf = trimmed.split('/').pop() || t.mount
  return {
    title: `${leaf} — ${SITE_NAME}`,
    description: `${MOUNT_LABELS[t.mount]}: /${decoded}`,
    imagePath: ogImagePath(t),
  }
}
