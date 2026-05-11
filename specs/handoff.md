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
| `R2Store` (CFW R2Bucket binding) | Done, validated against ctbk's prod bucket. Scoped-`prefixes` empty-prefix list now synthesizes a virtual root (each allowed prefix as a dir) instead of erroring. |
| `HttpStore` (browser → server proxy) | Done, validated against both Crashes' and ctbk's workers + `site/worker/`. |
| `MockStore` (in-memory) | Done. Powers tests + `site/` demo. |
| `MultiStore` (composite of N child stores) | Done. First path segment routes to a child; root list synthesizes a dir per child. Used by `site/worker/` to expose ctbk + crashes side-by-side. |
| `S3Store` (S3-compatible API; AWS / R2-via-S3 / MinIO) | Done. SigV4 via `aws4fetch` (small, fetch + `crypto.subtle`; no AWS SDK). Browser-direct or server-proxy (drop-in for `R2Store` in any `createHandlers` callsite). Public (unsigned) and credentialed paths both work. Conformance harness runs via a fake-S3 `fetch` impl backed by `MockStore`. |
| Server handlers (`src/server/`) | Done. `createHandlers(store, { basePath?, corsOrigin? })` exposes `/list` + `/get`. CORS preflight handled by `site/worker/`. |
| React UI (`src/react/`) | `<FileTree>`, `<DirListing>` (auto-cursor-follow + default-`README.md` panel), `<TextViewer>` (Range head-fetch + load-all), `<Breadcrumb>`, `parsePath`, `makeMatcher` (substring/glob filter), `asyncBufferFromStore` (hyparquet adapter). Pluggable `markdownRenderer` + `parquetRenderer` slots; the lib doesn't bundle either dep — consumers wire their renderer of choice. |
| `<ParquetViewer>` (site-side reference impl) | `site/src/ParquetViewer.tsx`. Hyparquet-backed paginated table, fed via `asyncBufferFromStore`. Wired into both MockDemo + HttpDemo via the `parquetRenderer` prop. Adapted from nj-crashes' existing `ParquetTable`. |
| Conformance harness (`src/test/conformance.ts`) | Done. 9 tests; pluggable into any new Store impl. |
| Vitest tests | 52 passing across `test/{mock,multi,r2,s3}-store.test.ts`. MultiStore + S3Store both go through full conformance via wrapper / fake-fetch backends. |
| Demo site (`site/`) | Vite app on port 8731. Home + MockDemo + HttpDemo all wired up. |
| `site/worker/` (CFW for HttpDemo) | Done. `wrangler dev` (per-binding `remote = true`) on port 8732. `MultiStore({ demo, ctbk, crashes })` over R2 bindings; same prefix scopes as the consumer apps. |
| `file-tree-demo` R2 bucket | Done. Worker-only access. Populated with 44-file synthetic Hive-partitioned fixture via `site/worker/scripts/populate-demo-bucket.mjs`. Frozen / re-runnable. **Pending:** the script now also generates a `samples/metrics.parquet` (~5 KB, 1000 rows via `hyparquet-writer`) but it hasn't been uploaded yet — needs a re-run with `CLOUDFLARE_API_TOKEN` set or after `wrangler login`. |
| Playwright e2e | Done (chromium-only). 14 tests across `e2e/{mock,http}-demo.spec.ts`. `pnpm e2e` boots both site dev + worker via `webServer[]`. |
| `examples/s3-proxy-worker/` | Copy-pasteable CFW template for downstream consumers. Wraps `S3Store` + `createHandlers`, secrets-driven, supports R2-via-S3 endpoint override. |
| Static-bucket Stores | "Just use a native Store as a static SPA" works today (S3Store/HttpStore/etc. all browser-direct-capable). Manifest-based variant (pre-built JSON of all keys, for backends without public listing) — **TODO** v2. |
| `GitHubStore`, `GitLabStore`, `DiskTreeStore` | **TODO** — `GitHubStore` is the natural next, mirrors `S3Store` pattern (Bearer-token auth for private repos). |
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
`site/worker/` also `link:../..`. If we add more workspace children
later, may revisit — but for two children, link is still simpler.

### `R2Store` synthesizes a virtual root from scoped `prefixes`
When `R2Store(bucket, { prefixes: ['gbfs/', 'avail/'] })` is asked to
`list('')`, it now returns one synthetic dir entry per allowed prefix
(instead of throwing). Two reasons:
1. `MultiStore` lists a child as `list('')` after stripping the child
   name from the path — without this, navigating from the virtual
   multi-root into a scoped bucket immediately errors.
2. Consumer apps mounting `<FileTree routeBase="/files" />` over a
   scoped R2Store get a meaningful landing page at `/files/` instead
   of an "allowed prefix" error.
Escape-hatch `prefixes: ['']` (whole-bucket) falls through to the normal
R2 list. Covered by `test/r2-store.test.ts`.

### `MultiStore` for namespaced multi-bucket browsing
`MultiStore({ name: store, ... })` splices N stores under named
top-level virtual dirs. First path segment routes; root list synthesizes
one dir per child. Used by `site/worker/` to expose `demo` (frozen
fixture) + `ctbk` + `crashes` side-by-side, but generally useful — e.g.
crashes might later expose both `raw/` and a derived parquet bucket
through one `<FileTree>`.

### `wrangler dev` per-binding `remote = true`, **not** `--remote`
`wrangler dev --remote` (legacy) deploys the worker to a CF preview
namespace and routes R2 ops through a sandboxed preview bucket. For
buckets created during a session, this preview is empty even though the
prod bucket has data — confusing failure mode. The newer mode (`remote
= true` per binding, `wrangler dev` without `--remote`) runs the worker
locally and routes only the marked bindings through prod resources.
That's what `site/worker/` uses now. Same applies to `wrangler r2
object put`: defaults to **local** storage; pass `--remote` to write
prod (the populate script does this).

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
  invokes `runStoreConformance`. `vitest.config.ts` excludes `e2e/` so
  Playwright specs don't get scooped up by `pnpm test`.
- e2e: `playwright` against `site/` + `site/worker/`. `pnpm e2e` boots
  both via Playwright's `webServer[]`, with `reuseExistingServer: true`
  locally. Chromium-only for now.
- Ports: `site/` on 8731 (hash of "@rdub/file-tree-site" mod 1000),
  `site/worker/` on 8732. Both picked once.
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
  to the `Parsed` union and a corresponding view component, then expose a
  pluggable `{kind}Renderer` prop on `<FileTree>` (e.g. `parquetRenderer`,
  `markdownRenderer`) so the lib doesn't bundle the renderer dep.

## Suggested next steps (in priority order)

1. **`<StoreAuthForm>` + LocalStorage keys** — small React component that
   collects access keys / Bearer tokens from a user, persists to LS,
   constructs a Store. Unlocks "browse a private S3 / R2 / GH bucket
   from a static-deployed site." Demoable: a `/s3` route in `site/` that
   accepts AWS keys + bucket, mounts `<FileTree>` over `S3Store`.
2. **`GitHubStore`** — mirrors `S3Store`'s pattern (Bearer-token auth
   for private; unsigned for public). Browse any GH repo as a tree via
   the content API. Same `<StoreAuthForm>` works for it.
3. **Commit consumer integrations** in Crashes/ctbk if the user hasn't.
   ctbk can now also use `S3Store` (via the proxy worker template) for
   browsing their `s3://ctbk-data/...` snapshots alongside R2.
4. **Zip-entry preview** — port from Crashes' raw browser
   (`cells-api/src/raw.ts` has the central-directory parser).
5. **Manifest-based static Store** — `ManifestStore({ url })` fetches a
   JSON of all keys at startup, slices it for `list()`. Useful when the
   backend doesn't expose public listing (e.g. GH Pages serving a tree
   without an index). v2.
6. **Cross-browser e2e** — Playwright currently runs chromium only. Add
   firefox + webkit projects in `playwright.config.ts` once the suite
   stabilizes.

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

### Where does auth live in the lib?

Decision (taken when planning S3Store): credentials live as ctor args on
each Store (`S3Store({ accessKeyId, secretAccessKey, ... })`). UI for
collecting them goes in a separate `<StoreAuthForm>` (TBD), keeping the
storage layer free of UI concerns. LocalStorage persistence is the UI's
job, not the Store's.

OAuth is deferred until a concrete consumer needs it. Bearer-token /
access-key paste flows cover ~90% of intended use cases (browse my own
S3 buckets / GH repos), and GitHub fine-grained PATs already work as
Bearer tokens — same code path as the more-formal OAuth would use.

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

# HttpDemo backing worker (separate terminal)
cd site/worker
pnpm install
pnpm dev             # wrangler dev (per-binding remote=true) on :8732

# Re-populate the file-tree-demo bucket (idempotent, ~80s)
node scripts/populate-demo-bucket.mjs       # uses --remote

# E2E (boots both above as needed)
cd ../..  # repo root
pnpm e2e             # playwright, 11 tests
```
