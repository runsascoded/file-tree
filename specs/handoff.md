# `@rdub/file-tree` — handoff

Storage-agnostic file/directory tree browser. Two-day-old project, scaffolded
during a session in `~/c/hccs/ctbk` while wiring up consumers there and in
`~/c/hccs/crashes`. Everything below is an as-of `2026-05-08` snapshot.

## Status

3 commits on `main`, **not pushed anywhere yet**. User explicitly asked to
delay GitHub push until the design has stabilized via real consumers.

```
82ae3d1  add MockStore, conformance harness, and site/ demo app
c934719  fix: cross-bundle NotFoundError check + auto-follow DirListing cursors
f40f527  @rdub/file-tree v0.0.1: initial scaffold
```

## What's here

| Area | State |
|------|-------|
| Core `Store` interface (`src/types.ts`) | Done. `list`, `get`, optional `range` capability, `NotFoundError` |
| `R2Store` (CFW R2Bucket binding) | Done, validated against ctbk's prod bucket via `wrangler dev --remote` |
| `HttpStore` (browser → server proxy) | Done, validated against both Crashes' and ctbk's workers |
| `MockStore` (in-memory) | Done. Powers tests + `site/` demo |
| Server handlers (`src/server/`) | Done. `createHandlers(store, { basePath?, corsOrigin? })` exposes `/list` + `/get` |
| React UI (`src/react/`) | `<FileTree>`, `<DirListing>` (auto-cursor-follow), `<TextViewer>` (Range head-fetch + load-all), `<Breadcrumb>`, `parsePath`, `makeMatcher` (substring/glob filter) |
| Conformance harness (`src/test/conformance.ts`) | Done. 9 tests; pluggable into any new Store impl. |
| Vitest tests (`test/mock-store.test.ts`) | Done. 9/9 passing. |
| Demo site (`site/`) | Vite app on port 8731. Home + MockDemo done. HttpDemo route exists but the worker behind it is TBD. |
| Playwright e2e against `site/` | **TODO** (Task #49) — small specs over the MockDemo route should be the very next thing |
| `site/worker/` (CFW for HttpDemo) | **TODO** — needs a small dedicated R2 bucket with demo data, then the worker code follows the same `R2Store` + `createHandlers` pattern as ctbk/crashes |
| Static-bucket Stores | **TODO** v2 — public-bucket browsing without a server, listing manifest pre-built |
| `S3Store`, `GitHubStore`, `GitLabStore`, `DiskTreeStore` | **TODO** — design intent in README roadmap table |
| Zip-entry preview | **TODO** — original Crashes raw browser had this; not lifted yet |
| `ParquetTable` view | **TODO** — deferred from v1 since it brings hyparquet + its own filter/dtype state |
| GitHub repo / npm publish | **TODO** — paused per user's "let it stabilize first" |

## Architectural decisions worth preserving

### `Store` is the single abstraction
Anything that can `list(prefix) → entries` and `get(path[, range]) → bytes`
plugs into the React UI. The interface is deliberately narrow: store impls
shouldn't decode (text vs binary, parquet vs zip, …); the UI is responsible
for that. Keeps stores cheap to write and lets new file kinds land without
touching every backend.

Every Store should implement directory grouping itself — i.e. return
`isDir: true` entries for "directories" the way R2/S3 do via delimiter.
Stores without a native dir concept (GitHub) synthesize this by grouping
on the next path segment.

### Subpath exports avoid dep bloat
Each Store + the server lives at its own subpath (`@rdub/file-tree/stores/r2`,
`/stores/http`, `/server`, …). Consumers only pull what they import. Server
code never reaches a browser bundle.

### `name === 'NotFoundError'` instead of `instanceof`
tsup bundles each subpath independently → `../types` is duplicated across
bundles → `instanceof NotFoundError` from one bundle fails when checked
against the class from another bundle. Use `e instanceof Error && e.name === 'NotFoundError'`.
Already bit us once (Crashes PoC); see the relevant test in
`src/test/conformance.ts`.

### `DirListing` auto-follows cursors (up to 20 pages)
R2's delimiter-grouped `list` page-truncates by raw-key scan, not by
delimited-result count. Under `cons=1m/` (1440 minute shards / day), a
single LIST returns ~3 day prefixes + a continuation cursor. Most users
expect "all entries" when navigating to a dir, so auto-follow is the
default. The "load more" button handles the runaway-prefix case.

### Conformance harness on every Store
`runStoreConformance(makeStore)` is a vitest battery any Store can opt into.
New backends (S3, GitHub, …) should add a one-line test like
`test/mock-store.test.ts` against their own seeded fixture. This is the
contract — pass it and the React UI works automatically.

### `link:..` for `site/`, no pnpm-workspace
Matches use-kbd's pattern. Avoids needing a workspace file at the repo root.
If we add more workspace children later, may revisit — but for one demo
site, link is simpler.

## Live consumers (PoCs validated, not in this repo)

Two consumer integrations are working **but uncommitted in their respective
repos** as of handoff time. They each `pds local file-tree` and use the
local checkout via `link:`.

### `nj-crashes` (`~/c/hccs/crashes`)
- New `/v1/files/*` routes on `cells-api` (parallel to existing `/v1/raw/*`)
  — `cells-api/src/index.ts`
- New `/files/*` route on `www` mounting `<FileTree>` — `www/src/routes/FilesPage.tsx`
- `pds local file-tree` already wired in both `crashes/cells-api/` and
  `crashes/www/`
- Worker runs on port 51895; vite on 4006
- The existing `/raw/*` route + 450-LOC `cells-api/src/raw.ts` are
  untouched. They have features file-tree v1 lacks (zip, parquet) — the
  intent is to fold them into `/files/*` once feature parity is reached.

### `ctbk.dev` (`~/c/hccs/ctbk`)
- New `/api/files/*` route on `gbfs/api` worker — `gbfs/api/src/index.ts`
- New `/files/*` route on `www` mounting `<FileTree>` — `www/src/pages/Files.tsx`
- Allowed prefixes: `gbfs/`, `avail/` (matches the GBFS pipeline layout
  audited 2026-05-07)
- `pds local file-tree` wired in both `ctbk/gbfs/api/` and `ctbk/www/`
- `wrangler dev --remote` on port 51896; vite on 3456
- This route is the seed of the planned GBFS health page (cf. ctbk's
  audit summary in the prior session).

Both consumers' uncommitted changes are still pending the user's "go
ahead and commit them too" — they may have done so by the time you read this.

## Conventions / repo norms

- npm org: `@rdub` (user's only published scope)
- Build: `tsup` (ESM + CJS + dts), entry per subpath. Add new exports both
  to `tsup.config.ts` and `package.json` `exports`.
- Test: `vitest`. New Store impls should add a test file in `test/` that
  invokes `runStoreConformance`.
- e2e: `playwright`, against `site/`. Not yet set up.
- Port: site/ on 8731 (hash of "@rdub/file-tree-site" mod 1000 — picked once).
- TypeScript: `strict` on, `exactOptionalPropertyTypes` off (was friction
  with optional cursor/limit fields, removed in initial scaffold).

## Things a fresh session should know not to do

- Don't push to GitHub yet without checking with the user.
- Don't add code that only handles R2 specifically — the whole point is
  storage-agnostic. If you find yourself writing R2-specific logic in
  `src/react/` or `src/server/`, that's a smell.
- Don't import `NotFoundError` and `instanceof`-check it across subpath
  boundaries. Use `e.name`.
- Don't drop the conformance harness when adding a new Store — write a
  one-liner test file like `test/mock-store.test.ts`.
- Don't add zip / parquet / pdf as a `Store` capability — those are *view*
  concerns, dispatched from `parsePath` based on extension. Add new `kind`s
  to the `Parsed` union and a corresponding view component.

## Suggested next steps (in priority order)

1. **Playwright e2e against `site/`** — the cheapest big win. ~30 min. Cover
   the MockDemo flow: navigate dirs, filter, open text file, hit
   non-existent path. The conformance harness already covers Store
   contracts; this layer covers the UI's contract with the user.
2. **Commit consumer integrations** in Crashes/ctbk if the user hasn't.
3. **`site/worker/` for HttpDemo** — small CFW with a dedicated demo bucket
   (user populates). Validates the HTTP path end-to-end.
4. **Add `S3Store`** (sister to R2Store, but via signed `fetch` against the
   S3 list-objects-v2 XML API). Will pay for itself when ELvis comes online
   as a third consumer.
5. **Zip-entry preview** — port from Crashes' raw browser
   (`cells-api/src/raw.ts` has the central-directory parser).
6. **GitHub Pages deploy of `site/`** — once HttpDemo's worker is deployed,
   the demo becomes a real "go here to see it" link instead of a localhost
   thing.

## Open design questions

- **Static-bucket Stores**: each backend wants both server-side (CFW/Lambda
  binding) and static (browser-direct, public bucket + manifest) variants.
  Right shape for the second? Pre-built JSON manifest fetched at startup,
  with `list` returning slices of it? Defer until we actually want a deploy
  with no backing FaaS.
- **Tree-mode UI**: current UI is breadcrumbs + flat dir listings. Some
  consumers may want a left-rail tree (file-explorer style). Add as a
  `<FileTree mode="tree">` variant or a separate component? Probably the
  latter — keeps the simple breadcrumb mode lightweight.
- **Auth**: HttpStore takes optional headers, but no opinion on token
  rotation, cookie-based auth, etc. Add an example / pattern doc when the
  first authenticated consumer comes online.

## Running this locally

```bash
cd ~/c/js/file-tree
pnpm install
pnpm build           # tsup → dist/
pnpm test            # vitest, conformance suite
pnpm typecheck       # tsc --noEmit

# Demo site
cd site
pnpm install
pnpm dev             # http://localhost:8731/
```
