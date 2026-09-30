/** Relative links in rendered markdown, resolved against the file's place in
 *  the tree rather than the page URL (which a `<base>` tag, or a route that
 *  doesn't mirror the store's layout, would get wrong).
 *
 *  React-free (bar the `MouseEvent` type) and router-free: `<FileTree>` builds
 *  a {@link MarkdownCtx} per file and hands it to its `markdownRenderer`, which
 *  decides how to draw the links. */
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Store } from '../types'
import { keyToSplat } from './parsePath'

/** What a `MarkdownRenderer` gets besides the source, when rendered inside a
 *  `<FileTree>`: enough to point relative links and images back into the tree. */
export interface MarkdownCtx {
  /** Store key of the markdown file. */
  path: string
  /** A link's resolved form. `internal` = a route inside this tree (so a
   *  plain click should `navigate`, not reload); otherwise `href` is returned
   *  unchanged (external, anchor, site-absolute, or escaping the tree). */
  resolveHref: (href: string) => { href: string; internal: boolean }
  /** An image's resolved `src`: a relative path becomes the store's URL for
   *  that file (`Store.getUrl`), where the store can mint one; else unchanged. */
  resolveSrc: (src: string) => string
  /** In-app navigation to a `resolveHref(…).href` with `internal: true`. */
  navigate: (href: string) => void
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Resolve a relative markdown `href` against `fileKey` (a store key) to a
 *  store key, or `null` when it isn't tree-relative: has a scheme, is
 *  protocol- or site-absolute, is a bare `#anchor` / `?query`, or climbs above
 *  the store root / outside `rootPrefix`. Returns the key and the href's
 *  `?query#hash` suffix, kept verbatim. A trailing `/` (a dir link) is kept. */
export function resolveTreeKey(href: string, fileKey: string, rootPrefix = ''): { key: string; suffix: string } | null {
  if (!href || SCHEME.test(href) || href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) return null
  const m = /^([^?#]*)(.*)$/.exec(href)!
  const [, rel, suffix] = m
  const dir = fileKey.slice(0, fileKey.lastIndexOf('/') + 1)
  const parts = `${dir}${rel}`.split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (!out.length) return null
      out.pop()
    } else {
      out.push(p)
    }
  }
  // A trailing `/`, `.` or `..` names a directory; keep the listing's `/`.
  const isDir = ['', '.', '..'].includes(parts[parts.length - 1])
  const key = out.join('/') + (isDir && out.length ? '/' : '')
  if (!key.startsWith(rootPrefix)) return null
  return { key, suffix }
}

/** The in-tree route for a relative markdown `href`, or `null` (see
 *  {@link resolveTreeKey}). Hrefs are kept as written (URL-encoded), so the
 *  route decodes them the same way it decodes any other. */
export function resolveTreeHref(href: string, fileKey: string, opts: { routeBase: string; rootPrefix?: string }): string | null {
  const r = resolveTreeKey(href, fileKey, opts.rootPrefix)
  if (!r) return null
  return `${opts.routeBase.replace(/\/+$/, '')}/${keyToSplat(r.key, opts.rootPrefix)}${r.suffix}`
}

/** Build the {@link MarkdownCtx} for the markdown file at store key `path`. */
export function markdownCtx(
  path: string,
  opts: { store: Store; routeBase: string; rootPrefix?: string; navigate: (href: string) => void },
): MarkdownCtx {
  const { store, routeBase, rootPrefix = '', navigate } = opts
  return {
    path,
    navigate,
    resolveHref: href => {
      const to = resolveTreeHref(href, path, { routeBase, rootPrefix })
      return to === null ? { href, internal: false } : { href: to, internal: true }
    },
    resolveSrc: src => {
      const r = resolveTreeKey(src, path, rootPrefix)
      if (!r || r.key.endsWith('/') || !store.getUrl) return src
      try {
        return store.getUrl(decodeURIComponent(r.key), { inline: true }) + r.suffix
      } catch {
        // A store whose `getUrl` can't cover this key (e.g. a prefix it
        // denies) leaves the image as written rather than breaking the page.
        return src
      }
    },
  }
}

/** Whether a click on an in-tree link should navigate in-app: a plain
 *  left-click. Modified clicks (new tab/window, download) and non-primary
 *  buttons keep the browser's own behavior. */
export function isPlainClick(e: ReactMouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
}
