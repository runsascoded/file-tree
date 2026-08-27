# CLAUDE.md

Project-specific guidance for Claude Code working in `@rdub/file-tree`.

**Read `specs/handoff.md` first** — it captures current state, architectural
decisions, and the suggested next-steps order. This file is just the
guardrails.

## Hard rules

- Don't push to GitHub without checking with the user — they want this to
  stabilize via real consumers (ctbk, nj-crashes) before publishing.
- Don't add storage-backend-specific logic in `src/react/` or `src/server/`.
  The `Store` interface is the only thing the UI/server should know about.
- Don't `instanceof NotFoundError` — use `e instanceof Error && e.name === 'NotFoundError'`.
  Subpath-export bundles each get their own copy of `../types`. (Already
  bit us once; see commit `c934719`.)
- Don't add zip / parquet / pdf as `Store` capabilities. They're *view*
  concerns; add `kind`s to `Parsed` in `src/react/parsePath.ts` and a
  matching view component.
- Don't drop the conformance harness when adding a Store. New impls add
  a one-line vitest file like `test/mock-store.test.ts`.

## Conventions

- npm org: `@rdub`. Package: `@rdub/file-tree`, scoped subpath exports.
- Build: `tsup` (ESM + CJS + dts). Add new entries to both `tsup.config.ts`
  and `package.json#exports`.
- Test: `vitest`. Tests live in `test/`; harness in `src/test/conformance.ts`.
- e2e: `playwright`, against `site/` (TODO).
- TS: `strict` on, `exactOptionalPropertyTypes` off.
- `site/` is a workspace child via `link:..` (matches `use-kbd`'s pattern).
  No pnpm-workspace.yaml at the repo root.
- Port: `site/` runs on 8731 (hash-derived, picked once).

## Quick run

```bash
pnpm install
pnpm test            # vitest: store conformance + temporal inference
pnpm typecheck
pnpm build           # tsup → dist/
pnpm e2e:mock        # what CI runs (hermetic; needs Playwright's chromium)
pnpm e2e:chrome      # same, against installed Chrome — no browser download

cd site && pnpm install && pnpm dev    # http://localhost:8731/
```

## Active consumers (other repos)

- `~/c/hccs/crashes` — `pds local file-tree` in `cells-api/` + `www/`. New
  `/v1/files/*` + `/files/*` routes parallel to existing `/v1/raw/*` + `/raw/*`.
- `~/c/hccs/ctbk` — `pds local file-tree` in `gbfs/api/` + `www/`. New
  `/api/files/*` + `/files/*` routes for the planned GBFS health page.

When making lib changes, check whether they break either consumer's
typecheck (`pnpm tc` in `~/c/hccs/crashes/{www,cells-api}` and
`~/c/hccs/ctbk/{www,gbfs/api}`).
