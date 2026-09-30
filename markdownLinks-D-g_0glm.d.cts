import { MouseEvent } from 'react';
import { Store } from './index.cjs';

/** Relative links in rendered markdown, resolved against the file's place in
 *  the tree rather than the page URL (which a `<base>` tag, or a route that
 *  doesn't mirror the store's layout, would get wrong).
 *
 *  React-free (bar the `MouseEvent` type) and router-free: `<FileTree>` builds
 *  a {@link MarkdownCtx} per file and hands it to its `markdownRenderer`, which
 *  decides how to draw the links. */

/** What a `MarkdownRenderer` gets besides the source, when rendered inside a
 *  `<FileTree>`: enough to point relative links and images back into the tree. */
interface MarkdownCtx {
    /** Store key of the markdown file. */
    path: string;
    /** A link's resolved form. `internal` = a route inside this tree (so a
     *  plain click should `navigate`, not reload); otherwise `href` is returned
     *  unchanged (external, anchor, site-absolute, or escaping the tree). */
    resolveHref: (href: string) => {
        href: string;
        internal: boolean;
    };
    /** An image's resolved `src`: a relative path becomes the store's URL for
     *  that file (`Store.getUrl`), where the store can mint one; else unchanged. */
    resolveSrc: (src: string) => string;
    /** In-app navigation to a `resolveHref(…).href` with `internal: true`. */
    navigate: (href: string) => void;
}
/** Resolve a relative markdown `href` against `fileKey` (a store key) to a
 *  store key, or `null` when it isn't tree-relative: has a scheme, is
 *  protocol- or site-absolute, is a bare `#anchor` / `?query`, or climbs above
 *  the store root / outside `rootPrefix`. Returns the key and the href's
 *  `?query#hash` suffix, kept verbatim. A trailing `/` (a dir link) is kept. */
declare function resolveTreeKey(href: string, fileKey: string, rootPrefix?: string): {
    key: string;
    suffix: string;
} | null;
/** The in-tree route for a relative markdown `href`, or `null` (see
 *  {@link resolveTreeKey}). Hrefs are kept as written (URL-encoded), so the
 *  route decodes them the same way it decodes any other. */
declare function resolveTreeHref(href: string, fileKey: string, opts: {
    routeBase: string;
    rootPrefix?: string;
}): string | null;
/** Build the {@link MarkdownCtx} for the markdown file at store key `path`. */
declare function markdownCtx(path: string, opts: {
    store: Store;
    routeBase: string;
    rootPrefix?: string;
    navigate: (href: string) => void;
}): MarkdownCtx;
/** Whether a click on an in-tree link should navigate in-app: a plain
 *  left-click. Modified clicks (new tab/window, download) and non-primary
 *  buttons keep the browser's own behavior. */
declare function isPlainClick(e: MouseEvent): boolean;

export { type MarkdownCtx as M, resolveTreeKey as a, isPlainClick as i, markdownCtx as m, resolveTreeHref as r };
