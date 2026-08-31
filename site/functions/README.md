# Cloudflare Pages Functions — dynamic per-path OG images

Reference edge wiring for `specs/cfp-og-images.md`. These run **only on
Cloudflare Pages**; the site is on GitHub Pages today, so they're inert
until the CFP migration. They sit outside the Vite app and the site
`tsconfig` (`include: ['src']`), so they don't affect the current build.

- `_middleware.ts` — stamps per-path `og:*` / `twitter:*` tags into the
  SPA HTML (via `@rdub/file-tree/og`'s `injectOgTags`), pointing
  `og:image` at `/og/<path>.png`. Cheap: path-only, no store call.
- `og/[[path]].ts` — renders the card SVG for a path (via `ogCardData` +
  `renderOgCard`) and returns the image.

## To go live (post-migration)

1. **Migrate to CFP** — Pages project building `pnpm build` in `site/`,
   output `site/dist`; move the `file-tree.rbw.sh` custom domain off GHP.
2. **Bind R2** on the Pages project (the buckets `site/worker` binds
   today) and construct the `MultiStore` in `og/[[path]].ts` from
   `ctx.env` — the two commented lines there.
3. **Add the rasterizer** — `@resvg/resvg-wasm` + one bundled font weight
   (Inter/DejaVu, ~200KB) → SVG becomes PNG (unfurlers want PNG). Until
   then the function serves SVG.
4. Swap CI's `deploy-pages` for a `wrangler pages deploy` (the repo
   already uses `wrangler-action` for the worker).

The library half (`@rdub/file-tree/og`) is published and tested; only
this edge glue depends on the migration.
