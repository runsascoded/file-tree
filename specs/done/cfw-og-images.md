# CF Workers + Assets + dynamic per-path OG images

Host the demo on **Cloudflare Workers + Assets** (one Worker serves the SPA, the R2 API, and share images), and add **dynamic Open Graph images per blob path** — so pasting a `file-tree` link in Slack/Discord/iMessage unfurls a card *for that path*: a file's name + size + type, or a **directory's treemap**. The card renderer is a framework-agnostic library feature; the edge wiring is the demo's (`site/worker/`), and a recipe for any consumer.

(Originally drafted as `specs/cfp-og-images.md`, targeting Cloudflare **Pages** + Pages Functions. Built on Workers + Assets instead; see "Why Workers + Assets".)

## Why an edge at all (and why GHP can't)

An OG unfurl has two halves with different needs:

- **The image** — a card for a path. Any Worker can render and serve this.
- **The `<meta og:image>` tag** — must be in the **initial HTML**, because unfurlers don't run JS. On GHP the site is one static `index.html` for every route (SPA fallback → `404.html`), so it *cannot* carry a per-path og:image. The HTML response itself has to vary per path.

That second half is what GHP can't do: something must rewrite `<head>` per request.

## Why Workers + Assets (not Pages, not a second Worker)

- The repo already deploys a Worker (`file-tree-demo`, the `/v1/files/*` R2 API behind `/http`) via `wrangler-action`. Adding `[assets]` to it gives **one edge** for API + SPA + OG, one `wrangler.toml`, one deploy job, one set of R2 bindings. Pages would have meant a second project, re-declaring the R2 bindings on it, and Functions with their own routing conventions.
- Workers + Assets is CF's forward path for static sites (Pages is in maintenance mode), and matches the "dOGI" pattern: `run_worker_first` lets the Worker see every navigation, stamp `<head>`, and `env.ASSETS.fetch` does the SPA fallback (`not_found_handling = "single-page-application"`).
- Extending stays clean: the API is one branch (`/v1/files/*`), OG images another (`/og/<mount>/….png`), everything else is assets + a head rewrite. The store construction is shared (`src/stores.ts`), so a card and the API see the same tree.

## Architecture (as built)

```
@rdub/file-tree/og   (library, framework-agnostic, pure)
  ├─ renderOgCard(data, opts?) : string        // data → SVG (1200×630)
  ├─ ogCardData({store, treeSource?, splat}) : Promise<OgCardData>
  └─ injectOgTags(html, meta) / ogTags(meta)   // per-path <head> rewrite

site/worker/  (the demo's edge: one Worker, `file-tree-demo`)
  ├─ wrangler.toml   [assets] ../dist, SPA fallback, run_worker_first (all but /assets/*, favicon, jq.wasm)
  ├─ src/index.ts    /v1/files/* → API; /og/<mount>/<splat>.<png|svg> → card; else ASSETS + stampHtml
  ├─ src/routes.ts   pure URL scheme: pageTarget, ogImagePath/parseOgImagePath, pageOg, MOUNT_SOURCES
  ├─ src/stores.ts   r2DemoStore(env) (shared with the API), cardSource(mount, env)
  ├─ src/og.ts       serveOgImage (resolve → SVG → resvg PNG → cache), stampHtml
  └─ fonts/          Inter 400/700 + JetBrains Mono 400/600, Latin subsets (OFL)
```

### URL scheme

- Page: `/<mount>/<splat>` — mounts `mock`, `http`, `s3`, `r2`, `gcs` (the SPA's `<FileTree routeBase>`s).
- Image: `/og/<mount>/<splat>.png` (`.svg` also served). The splat is the page's **verbatim** (still percent-encoded), plus the extension — so a dir keeps its trailing slash: `/mock/docs/` → `/og/mock/docs/.png`, `/mock` → `/og/mock/.png`. Stripping the slash would hand `parsePath` `docs.v2` for a dir `docs.v2/` and it'd guess "file"; this way the mapping is an exact inverse.
- `/og/*` paths that aren't `<known mount>/….<png|svg>` fall through to the SPA, where the site's own `/og/*` **preview route** (inline SVG, `OgPreview.tsx`) still lives.
- Pages outside every mount (`/`, `/elide`, `/fold`, `/og/…` preview, …) get the site card: title `@rdub/file-tree — demos`, image `/og/mock/.png`.
- `og:image` is absolute, built from the request's origin — correct on `*.workers.dev`, the custom domain, and `localhost`.

### Card data per mount (`MOUNT_SOURCES`)

| Mount | Source | TTL |
| --- | --- | --- |
| `mock` | the site's `MockStore` fixture (`site/src/fixtures/demo.ts`, bundled into the Worker, lazy-imported once per isolate) + `walkTreeSource` | 1 day |
| `http` | the live R2 `MultiStore` (same as `/v1/files`) + `walkTreeSource({ maxNodes: 500 })` | 1 h |
| `s3`, `r2`, `gcs` | none (client-credentialed browsers): path-only card from an empty store | 1 day |

`ogCardData` degrades on any tree failure (too large, R2 op limit, network) to a plain dir card — verified: `/og/http/.png` (whole multi-bucket tree) walks past 500 nodes and renders the plain card; `/og/http/demo/.png` renders the treemap.

### HTML stamping

For every HTML response from `env.ASSETS`, `stampHtml` calls `injectOgTags` with `pageOg(pathname)` — path-only, no store call (the image route does the resolving, cached). It sets `<title>`, `og:title/description/image/url/site_name/type`, `og:image:width/height`, `twitter:*`. `content-length` + `etag` are dropped (body changed). Always rewritten, not UA-sniffed: a static `<head>` edit, and correct for "view source" too.

### PNG rasterization

`@resvg/resvg-wasm` (2.6.2; wasm imported as a `CompiledWasm` module, `initWasm` once per isolate). Fonts are the one required asset: Inter 400/700 + JetBrains Mono 400/600, Latin subsets, ~180 KB raw / ~90 KB gz, imported via a `Data` rule (`site/worker/fonts/README.md` has provenance + the subset command).

Two library tweaks fell out of rasterizing for real:
- **`OgCardOptions.sansFont` / `monoFont`** — prepended to the card's font stacks. resvg-wasm ignores its `monospaceFamily` option for the generic `monospace`, so mono text fell back to Inter until the card named `'JetBrains Mono'` outright.
- **Plain dir card's folder mark is a `<path>`**, not the `📁` emoji (no emoji font in a Worker → blank/`.notdef`).
- Also: the root card no longer repeats the store label as both header and title, and tile-label clipping uses a mono glyph width (~14.5px @ 24px) so names don't overrun their tiles.

### Caching

`Cache-Control: public, max-age=<TTL>` per mount, and `caches.default` keyed by URL + `?v=<CF_VERSION_METADATA.id>` so a deploy (new fixture, new renderer) never serves the previous deploy's PNGs. The Cache API is a no-op on `*.workers.dev`; it takes effect on the custom domain.

### Bundle size

`wrangler deploy --dry-run`: 3.3 MB upload / **1.16 MB gzipped** — JS ~720 KB (~150 KB gz, incl. the fixture's SQLite/PDF/parquet bytes), resvg wasm 2.48 MB (~950 KB gz), fonts ~180 KB (~90 KB gz). Under the free plan's 3 MB (gz) limit.

## Plug-and-play

The library ships `renderOgCard` + `ogCardData` + `injectOgTags` only; no CF dependency. A consumer on Vercel points `@vercel/og`/resvg at `renderOgCard`; one on Node rasterizes however it likes; `site/worker/src/{og,routes,stores}.ts` is the reference Workers wiring (the URL scheme in `routes.ts` is generic enough to copy).

## CI

- `deploy-worker` now also installs site deps and builds `site/dist` before `wrangler deploy` (assets ship with the Worker; the Worker bundles the site fixture).
- `build-pages` / `deploy-pages` were removed after the cutover (`dd094a3`); `deploy-worker` is the site's only deploy.
- `build-dist` (npm-dist) unchanged.

## Verified locally

`wrangler dev --port 8733` over a fresh `site/dist` (remote R2 bindings):
- `/mock/docs/` HTML → `<title>docs — @rdub/file-tree</title>` + `og:image = http://localhost:8733/og/mock/docs/.png` etc.
- `/og/mock/docs/.png`, `/og/mock/.png`, `/og/mock/samples/events.parquet.png`, `/og/s3/mybucket/data/.png`, `/og/http/demo/.png`, `/og/http/.png` → `image/png`, 1200×630, eyeballed.
- `/` → site card tags; `/assets/*.js` served statically; `/og/docs/` (preview route) → SPA HTML; `/v1/files/list?prefix=` → JSON; `OPTIONS /v1/files/list` → 204.

Tests: `test/site-worker-routes.test.ts` (URL scheme + mount mapping), `test/og-card.test.ts` (folder mark, font options, root header).

## Cutover (done, 2026-09-30)

1. Pushed; CI deployed the Worker with assets; checked `file-tree-demo.ryan-0dc.workers.dev` (tags + PNG).
2. Deleted the `file-tree` CNAME (→ `runsascoded.github.io`) in the `rbw.sh` zone (dashboard), then added `routes = [{ pattern = "file-tree.rbw.sh", custom_domain = true }]` to `wrangler.toml` (`29557cc`), so `wrangler deploy` owns the domain, DNS record and cert.
3. Removed GHP: CI jobs + permissions, `site/public/CNAME`, the repo's Pages site (`gh api -X DELETE repos/runsascoded/file-tree/pages`) and its `github-pages` environment. `HttpDemo`'s API base is now same-origin `/v1/files` (`dd094a3`).
4. Unfurls verified on `file-tree.rbw.sh` in Slack, iMessage and WhatsApp.
5. No new secrets or bindings: the Worker reuses `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` and its three R2 bindings.

## Deferred: the debounced public scan route

Folds into this same Worker when it exists: a `POST /scan` that rate-limits via KV/DO "last-scan-at" (hourly) and proxies to a hosted disk-tree server's `POST /api/scan/start`; the button shows disabled with an explanatory tooltip while `< 1h`. Blocked on a hosted DT server (cross-ref `~/c/disk-tree/specs/file-tree-integration.md`, B2/B3).

## Open follow-ups

- **R2 root cards**: the multi-bucket root and big ctbk prefixes exceed the 500-node walk and get a plain card. A snapshot `TreeSource` (disk-tree scan) would give them treemaps; key their cache by snapshot id.
- **Glyph coverage**: non-Latin path names render blanks (font subset). Widen the subset if real consumers need it.
