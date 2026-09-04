import { Store } from '../index.cjs';
import { P as ParsePathOptions } from '../parsePath-CLQfXstk.cjs';
import { TreeSource } from '../renderers/treeSource.cjs';

/** The standard Open Graph image box. */
declare const OG_WIDTH = 1200;
declare const OG_HEIGHT = 630;
/** One child tile of a directory treemap card. */
interface OgTreemapChild {
    name: string;
    size: number;
}
/** Everything `renderOgCard` needs, already resolved. */
interface OgCardData {
    /** Ancestor segments from the root, excluding the leaf itself. */
    crumbs: readonly string[];
    /** Leaf name (the file, the directory, or the store label at root). */
    name: string;
    kind: 'file' | 'dir';
    /** Bytes; a dir's is its recursive total. `null`/absent when unknown. */
    size?: number | null;
    /** Store label for the header (e.g. `mock://demo-bucket`). */
    storeLabel?: string;
    /** Right-aligned meta badge — an extension, `N items`, a mime, etc. */
    badge?: string;
    /** For a dir: children to draw as a treemap. Omit for a plain card. */
    treemap?: readonly OgTreemapChild[];
}
interface OgCardOptions {
    /** Wordmark in the footer. Default `@rdub/file-tree`. */
    brand?: string;
    /** Background / ink / muted colors. Defaults are a dark card. */
    background?: string;
    ink?: string;
    muted?: string;
    /** Palette for treemap tiles. Default `@rdub/treemap`'s. */
    palette?: readonly string[];
}
/** Render `OgCardData` to a 1200×630 SVG string. Pure. */
declare function renderOgCard(data: OgCardData, opts?: OgCardOptions): string;
interface OgCardDataOptions {
    store: Store;
    /** URL splat identifying the path, as `<FileTree>` parses it. */
    splat: string;
    /** Recursive-size source; when present a dir card gets a treemap. */
    treeSource?: TreeSource;
    /** Matches `<FileTree rootPrefix>` so paths line up. */
    rootPrefix?: string;
    /** Forwarded to `parsePath` (extra text extensions). */
    parseOptions?: ParsePathOptions;
    /** Cap the treemap to the N largest children (keeps the card legible
     *  and the SVG small). Default 40. */
    maxTiles?: number;
}
/** Resolve `OgCardData` from a `Store` (+ optional `TreeSource`). Impure;
 *  degrades to a plain card on any tree failure. */
declare function ogCardData(opts: OgCardDataOptions): Promise<OgCardData>;

/** Per-path Open Graph `<head>` rewriting — the other half of dynamic
 *  OGI. An SPA serves one static `index.html`; an edge (CF Pages
 *  middleware, a Vercel edge fn, any origin proxy) calls `injectOgTags`
 *  to stamp per-path `og:*` / `twitter:*` tags into that HTML *before*
 *  it reaches an unfurler, which never runs the JS that would otherwise
 *  set them. Pure string→string, so it's testable and host-agnostic.
 *  See `specs/cfp-og-images.md`. */
interface OgMeta {
    /** `og:title` + `<title>`. */
    title: string;
    /** `og:image` — absolute URL preferred (unfurlers don't resolve
     *  relative paths reliably). */
    image: string;
    /** `og:description` + `twitter:description`. */
    description?: string;
    /** `og:url` — the canonical page URL. */
    url?: string;
    /** `og:type`. Default `website`. */
    type?: string;
    /** `og:site_name`. */
    siteName?: string;
    /** `og:image:width` / `:height`. Default 1200×630. */
    imageWidth?: number;
    imageHeight?: number;
    /** `twitter:card`. Default `summary_large_image`. */
    twitterCard?: string;
}
/** The block of `<meta>` tags for `meta`, newline-joined, no wrapping
 *  `<head>`. */
declare function ogTags(meta: OgMeta): string;
/** Strip any existing `og:*` / `twitter:*` meta and inject `meta`'s tags
 *  (and a fresh `<title>`) into `html`'s `<head>`. Idempotent: rerunning
 *  with the same input reproduces the same output. */
declare function injectOgTags(html: string, meta: OgMeta): string;

export { OG_HEIGHT, OG_WIDTH, type OgCardData, type OgCardDataOptions, type OgCardOptions, type OgMeta, type OgTreemapChild, injectOgTags, ogCardData, ogTags, renderOgCard };
