# CFP + dynamic per-path OG images

Move the demo from GitHub Pages to Cloudflare Pages, and add **dynamic
Open Graph images per blob path** — so pasting a `file-tree` link in
Slack/Discord/iMessage unfurls a card *for that path*: a file's name +
size + type, or a **directory's treemap**. The card renderer is a
framework-agnostic library feature; the edge wiring is the demo's, on
CFP, and a recipe for any consumer.

## Why CFP (and why GHP can't)

An OG unfurl has two halves with different needs:

- **The image** — a card for a path. A Worker can render and serve this;
  it does *not* require CFP.
- **The `<meta og:image>` tag** — must be in the **initial HTML**, because
  unfurlers don't run JS. On GHP the site is one static `index.html` for
  every route (SPA fallback → `404.html`), so it *cannot* carry a
  per-path og:image. You need the HTML response itself to vary per path.

That second half is the whole game, and it's exactly what GHP can't do
and CFP can: a Pages **Function** (or a Worker in front) rewrites
`<head>` per request. You *could* keep GHP and put a Worker in front to
rewrite HTML, but then you've added a proxy hop for nothing — if a Worker
is fronting everything, host on CFP and drop the GHP origin. So: **CFP**,
consolidating the OG middleware, the `/og` renderer, and (later) the
debounced scan route on one edge.

## Architecture

```
@rdub/file-tree/og   (library, framework-agnostic, pure)
  ├─ renderOgCard(data, opts?) : string        // data → SVG (1200×630)
  └─ ogCardData({store, treeSource?, path}) : Promise<OgCardData>   // resolve from a Store/TreeSource

site/functions/  (Cloudflare Pages Functions — the demo's edge)
  ├─ og/[[path]].ts   → GET /og/<path>.png : rasterize renderOgCard → PNG (resvg-wasm)
  └─ _middleware.ts   → inject <meta og:image content="/og/<path>.png"> per request
```

- **`renderOgCard`** is pure (`OgCardData → SVG` string): no `Store`, no
  network, no React, no DOM — testable by asserting SVG structure, and
  runnable in a Worker. A **file** card is breadcrumb + name + size +
  type badge; a **dir** card draws its children as a **treemap** via
  `@disk-tree/react`'s pure `squarify` + `DEFAULT_PALETTE` (an optional
  peer, `external`, exactly as `renderers/treemap` uses it), so the share
  card and the interactive view read the same.
- **`ogCardData`** is the impure resolver: a file → `store.list` of its
  parent for the size (or a `head`), a dir → `treeSource.children({path})`
  for the recursive total + the child rects. It degrades: no
  `treeSource`, or a `TreeTooLargeError`, → a plain dir card (no
  treemap), never an error.
- **`og/[[path]].ts`** (Pages Function): resolves data against the same
  `Store` the site uses (the R2 `MultiStore`, server-side), renders SVG,
  rasterizes to PNG with `@resvg/resvg-wasm` (runs in Workers; needs one
  embedded font — bundle a single weight, e.g. Inter/DejaVu, as the
  glyph source). Cache the PNG (`Cache-Control` + the colo cache), keyed
  by path + a snapshot/version token so a changed tree re-renders.
- **`_middleware.ts`**: for a navigable path, rewrite the served
  `index.html`'s OG/Twitter tags to point `og:image` at
  `/og/<path>.png`, `og:title` at the leaf name, `og:description` at the
  size/summary. Only the `<head>` is rewritten; the SPA body is
  untouched. Non-HTML and asset requests pass through.

## PNG, not SVG

Unfurlers want PNG/JPG at 1200×630; SVG is unreliable as `og:image`. So
the library renders SVG (clean to author, easy to test, tiny), and the
edge rasterizes. `@resvg/resvg-wasm` does SVG→PNG in a Worker without a
browser — the one cost is it needs a font provided (system fonts aren't
available in the sandbox), so bundle a single WOFF/TTF weight and pass it
to resvg. Document the font as the one required asset.

## The dir-treemap card (the neat part)

A directory's OG image *is* its treemap. `squarify(children, 0, 0, w, h,
n => n.size)` lays out `Rect<TreeNode>[]`; draw each as a `<rect>` filled
from `DEFAULT_PALETTE` by index, with the child's name + `fmtSize` when
the rect is big enough to fit legible text (skip labels on slivers —
same threshold logic the interactive map uses). Header carries the
breadcrumb + the dir's recursive total. This reuses the *pure* half of
`@disk-tree/react`, so no browser, no React — a Worker draws the same
picture the page does.

## Plug-and-play

The library ships **only** `renderOgCard` + `ogCardData` (+ the SVG→PNG
step as a documented helper, `@resvg/resvg-wasm` an optional peer). CF is
**not** forced on consumers: a consumer on Vercel points `@vercel/og` at
`renderOgCard`; one on their own Node server rasterizes however they
like; the demo's CFP Functions are the reference wiring, copyable into
`examples/`. Same discipline as every other seam — the capability is in
the library, the host is the consumer's choice.

## CFP migration (the demo)

Mechanical, low-risk — the site is a static Vite build; CFP serves the
same `dist/`:

1. Create a **Pages project** (`file-tree`) — build `pnpm build` in
   `site/`, output `site/dist`. (Account-level; the repo owner does this
   in the CF dashboard or via `wrangler pages project create`.)
2. Move the **custom domain** `file-tree.rbw.sh` from GH Pages to the
   Pages project (DNS + Pages custom-domain binding). Drop
   `site/public/CNAME` (GHP-specific) once cut over.
3. Add `site/functions/` (the OG middleware + `/og` route). Pages picks
   them up automatically.
4. Fold the existing R2 `MultiStore` binding (today in `site/worker`)
   into the Pages project's bindings, so the Functions read the same
   buckets. The standalone `site/worker` can be retired or kept as the
   `/http` backend — either works; Functions + bindings is the tidier
   end state.
5. Swap CI's `build-pages`/`deploy-pages` jobs for a
   `cloudflare/wrangler-action` **Pages deploy** (the repo already uses
   wrangler-action for `deploy-worker`). Keep `build-dist` (npm-dist)
   unchanged — that's independent of hosting.

Steps 1–2 and the CI-secret bits are the owner's CF-account actions; the
`functions/`, config, and the swapped CI job are code.

## Fold-in: the debounced public scan route

Once on CFP with Functions, the path-3 scan button lands here too:
`functions/scan.ts` — a POST that rate-limits via a KV/DO
"last-scan-at" (hourly), and proxies to a hosted disk-tree server's
`POST /api/scan/start`; the button shows disabled with an explanatory
tooltip while `< 1h`. Design only until there's a hosted DT server to
dispatch to (the real prerequisite, neither GHP nor CFP). Cross-ref
`~/c/disk-tree/specs/file-tree-integration.md` (B2/B3, CORS-ready).

## Open questions

- **Font for resvg** — which single weight to bundle (size vs. glyph
  coverage). Inter or a DejaVu subset; note the ~50–200KB asset.
- **Cache key / invalidation** — path + what version token? For a live
  `walkTreeSource` card, the tree can change; for a snapshot source, key
  by snapshot id (reuses the block-cache versioning idea).
- **Crawler-only vs. always rewrite** — rewrite the OG head for every
  request (simple, cacheable) vs. only for known unfurler UAs (smaller
  blast radius). Prefer always — it's a static `<head>` edit, cache-
  friendly, and correct for humans who "view source" too.
- **`ogCardData` for a file's size** — `store.list(parent)` and match, vs.
  a `store.head(path)` if/when the `Store` grows one. List is fine now.

## Status

**Library core built + verified; edge glue written, migration pending.**

Built and tested (`@rdub/file-tree/og`, 9 tests, 242 total green):
- `renderOgCard(data)` — pure SVG (1200×630), file card + dir treemap
  (via `@disk-tree/react`'s pure `squarify`/`DEFAULT_PALETTE`, an optional
  peer). Reuses `fmtSize` + the path/splat helpers.
- `ogCardData({ store, treeSource?, splat })` — resolver; dir → recursive
  size + largest-first tiles, file → size + ext badge, degrades to a
  plain card on any tree failure.
- `injectOgTags(html, meta)` / `ogTags(meta)` — pure per-path `<head>`
  rewrite (idempotent), so any edge/host can stamp the tags.
- Verified in-browser at `/og/*` (a site preview route rendering the SVG
  inline): root treemap card, dir card, file card all render.

Written as deploy-ready reference, **inert until the CFP migration**
(they're CF Pages Functions, outside the Vite app + site `tsconfig`, so
they don't touch the current GHP build):
- `site/functions/_middleware.ts` — stamps per-path OG tags into the SPA
  HTML.
- `site/functions/og/[[path]].ts` — renders the card; serves SVG until
  the rasterizer is added.
- `site/functions/README.md` — the go-live steps.

Owner's remaining steps (need a CF account / hosted store, can't be run
here): the **CFP migration** (steps 1–2 above), **R2 bindings** on the
Pages project, **`@resvg/resvg-wasm` + a bundled font** for SVG→PNG, and
— for the scan fold-in — a **hosted disk-tree server**.
