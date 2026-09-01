# Tree sources, and the treemap they feed

*A third source seam — recursive sizes over a scanned tree — and the disk-tree
viz that renders it. The seam is the reason the viz is worth doing carefully.*

## The gap, stated plainly

A directory row in the listing shows `—` for its size (`DirListing.tsx:204`,
`e.isDir ? '—' : fmtSize(e.size)`). It has to: `Store.list(prefix)` returns a
prefix's immediate children and *their own* sizes, and file-tree never holds
more than the level you're looking at. A subtree total is not knowable from a
lazy, ranged, one-level-at-a-time `Store` without walking the whole subtree —
which is a **scan**, a distinct thing with its own cost, storage, and lifetime.

That single missing number — a directory's recursive size — is the whole
difference between the browser we have and a treemap. A treemap is nothing but
recursive sizes laid out as nested rectangles; give the dir view access to them
and the map falls out, and the `—` cells fill in as a side effect.

## The two halves already exist, in two repos, unjoined

**disk-tree** (`~/c/disk-tree`, "DT") is the scan half. A Python engine walks a
filesystem or bucket, rolls sizes up bottom-up (one row per file *and per
directory*, the directory rows carrying the recursive totals), stores each scan
as a timestamped parquet blob with a SQLite metadata row, and serves subtrees,
history and diffs over HTTP. It already ships the viz half too: `@disk-tree/react`
is a **chart-lib-free, accessor-based** React widget library whose `<Treemap>`
is generic over an opaque node type `T` — "marin's dense per-path node and
disk-tree's `{path,size,kind,children}` node share this component"
(`packages/react/src/Treemap.tsx:7-12`).

**marin-gcs-usage** (`~/c/oa/marin-gcs-usage`, the `gcs`/`cw-s3` branches) already
runs *both* libraries — DT's `<Treemap>` as its dashboard, and our `<FileTree>`
(pinned `#5709d4e`) as the raw scan browser at `/files`. But they sit side by
side sharing only a bucket and a `← treemap` link. The treemap reads
`/api/subtree` + snapshot JSON; the file browser reads `/v1/files` via
`createHandlers` over an `S3Store`. Nothing connects "the directory I'm browsing"
to "the rectangle in the treemap." Closing that gap — for marin, and for the
~dozen other consumers who today get only the browser — is what this spec is for.

## Prior art we're deliberately reusing, not rebuilding

`@disk-tree/react`'s `<Treemap>` is already the component we'd otherwise write,
and it's already shaped for a foreign data source:

- Generic `TreemapProps<T>` (`Treemap.tsx:31-222`): every field is reached
  through an accessor — `getSize`, `getChildren`, `getLabel`, `hasChildren`,
  `loadChildren(n, path) => Promise<T[]>`, `cellHref`, `onCellClick`,
  `onPathChange`, `renderTooltip`, `formatSize`, plus `colorForCell`/`lens`
  hooks (which is how DT paints its diff view).
- Lazy drill is built in: `hasChildren` + `loadChildren` (one fetch per drill,
  cached by `getId`), so a source that answers a bounded depth serves deep trees
  without shipping them whole (`Treemap.tsx:51-74`, `:462-511`).
- It is **dependency-free** (React + local modules only); the d3 peers are for
  the separate `@disk-tree/react/voronoi` subpath and are optional.

So we do **not** vendor a treemap. We wrap this one, adapt our neutral node to
its accessors, and pin it — which also makes the DT⇄FT relationship
bidirectional (they get our browser; we get their map). Packaging caveat in
[§ Depending on `@disk-tree/react`](#depending-on-disk-treereact).

## The seam: `TreeSource`, a third sibling to `Store` and `TableSource`

file-tree already has two source abstractions, and this is the third:

| seam | answers | impls |
| --- | --- | --- |
| `Store` | "list a prefix, read bytes `[o,o+n)`" | R2, S3, GCS, HTTP, Mock, Multi |
| `TableSource` | "give me rows `[o,o+n)`, sorted/filtered" | sqlite, http |
| **`TreeSource`** | "a recursively-sized tree, over time, diffable" | **walk, snapshot, http, disk-tree** |

Why its own interface, and not either existing one:

- **Not a `Store` capability.** Hard rule (`CLAUDE.md`): backend-specific and
  view concerns stay off `Store`; the `Store` interface is all the UI/server
  know. Recursive sizes are not something every store can produce — they require
  an external, expensive, *stateful* scan. Bolting `stat`/`tree` onto `Store`
  would force every backend to answer a question most can't, and would smuggle a
  view concern into the storage layer. `TreeSource` is a *separate* thing a
  consumer wires up when they have a scan, exactly as they wire a `Store` when
  they have a bucket.
- **Not a `TableSource`.** A scan's rows *are* a table (they're literally a
  parquet of `path,size,parent,depth,…`), and a "flat table of the scan" is a
  fine bonus view — but `TableSource.page(offset,limit,sort,filter)` is flat
  pagination, the wrong shape for **hierarchical drill**. And a tree has two
  axes a table doesn't: a **time axis** (snapshots) and a **diff**. Different
  capabilities, different access pattern. Sibling, not subtype. (A
  `treeSourceAsTable(src)` adapter can expose the rows through `TableSource` for
  the flat view; that's additive.)

The family philosophy carries over intact: **capability-gated chrome** (hide a
control rather than offer one that lies), **local/remote symmetry** (the same
viewer over a browser walk or an HTTP endpoint), and **one wire protocol** with
matched client/server halves — the three properties the SQLite work established.

## The interfaces

Field names are camelCase in TS; the wire and DT's parquet use snake_case
(`n_desc`, `n_children`, `mtime_mean`), so the http/snapshot/disk-tree impls map
at the boundary — the same snake→camel hop DT's own `buildDTNodes` does
(`ScanDetails.tsx:641-653`).

```ts
/** One node in a scanned tree. A file, or a directory whose `size` is the
 *  recursive subtree total. Mirrors disk-tree's `Row`
 *  (storage/base.py columns: path,size,mtime,kind,parent,uri,n_desc,n_children,depth). */
export interface TreeNode {
  /** Key relative to the tree's root. `''` is the root itself. */
  path: string
  /** Basename, for labels. Derived from `path` when a source doesn't send it. */
  name: string
  kind: 'file' | 'dir'
  /** Bytes. For a `dir`, the recursive total; `null` when a partial scan
   *  couldn't compute it (DT's `scan_status: 'partial'`). */
  size: number | null
  /** Immediate children count. `> 0` on a dir is the "drillable" signal. */
  nChildren?: number
  /** Descendant count (files + dirs). Tooltip/label material. */
  nDesc?: number
  /** Newest descendant mtime, epoch seconds. Age/staleness lens input. */
  mtime?: number | null
  /** Size-weighted mean mtime (DT `--mean-mtime` scans). Preferred age signal. */
  mtimeMean?: number | null
}

/** What a source can do, so the viewer renders only chrome that works — the
 *  same discipline as `TableSourceCapabilities`. */
export interface TreeSourceCapabilities {
  /** More than one snapshot may exist; `snapshots()` is meaningful. */
  history: boolean
  /** `diff()` is supported. */
  diff: boolean
  /** `scan()` can dispatch a fresh scan. */
  scan: boolean
  /** `children({depth})` can fetch a bounded subtree lazily. `false` means the
   *  whole tree arrived in one `children()` and drill is in-memory. */
  lazy: boolean
}

/** A point in a tree's history. `id` is opaque (DT: a scan id or ISO time). */
export interface Snapshot { id: string; time: string; size?: number | null }

/** One level of the tree: the viewed node and its immediate children. */
export interface TreeLevel {
  node: TreeNode
  children: readonly TreeNode[]
  /** Which snapshot answered, when the source has history. */
  snapshot?: string
}

export interface ChildrenRequest {
  /** The node to expand. Absent ⇒ root. */
  path?: string
  /** Prefetch this many levels below `path` (treemap wants ~1–2). Default 1. */
  depth?: number
  /** Read this snapshot rather than the newest. */
  snapshot?: string
}

/** A diffed node. `status` is DT's enum verbatim. */
export interface TreeDiffNode {
  path: string
  name: string
  kind: 'file' | 'dir'
  status: 'added' | 'removed' | 'changed' | 'touched' | 'unchanged'
  sizeA: number | null
  sizeB: number | null
  nDescA?: number | null
  nDescB?: number | null
}

export interface ScanJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Items found so far / throughput, when the backend streams progress. */
  itemsFound?: number
  error?: string | null
}

export interface TreeSource {
  readonly capabilities: TreeSourceCapabilities
  /** The viewed node + its immediate children (optionally deeper). This is
   *  the one method every source implements; it is exactly `<Treemap>`'s
   *  `loadChildren` need. */
  children(req?: ChildrenRequest): Promise<TreeLevel>
  /** Timestamped scans, newest first. `[]` (and `history:false`) when the
   *  source has no history. */
  snapshots?(): Promise<readonly Snapshot[]>
  /** Diff two snapshots under `path`. */
  diff?(req: { a: string; b: string; path?: string; depth?: number }): Promise<{
    node: TreeDiffNode
    children: readonly TreeDiffNode[]
  }>
  /** Dispatch a scan; poll `scanStatus`. What this *does* is the impl's
   *  business — POST to a Flask server, enqueue a Queue, `workflow_dispatch`
   *  a GH Action — the viewer never learns which. */
  scan?(req?: { path?: string }): Promise<ScanJob>
  scanStatus?(id: string): Promise<ScanJob>
}
```

One tree = one `TreeSource`. There is no `TreeCatalog`: a bucket has one tree,
and a second independently-scanned root is simply a second source. (Contrast
`TableCatalog`, which exists because one `.db` file holds many tables.)

## Three implementations, mirroring the three SQLite modes

### 1. `walkTreeSource(store, opts?)` — Layer 0, no new infrastructure

Recursively `list()` a `Store` and roll sizes up in JS. Powers the treemap for
small/medium trees with **zero Python and zero backend** — the tier that makes
this a drop-in for every current `<FileTree>` consumer.

The honest tension: cheap lazy listing gives you tree *shape* per level, but a
directory's recursive *size* needs the whole subtree walked. So Layer 0 walks
the subtree under the viewed node once, caches it, and serves levels from
memory — bounded by `maxNodes` / `maxBytesListed` (default e.g. 50k nodes).
Above the cap it declines with a typed "too big to walk live — point me at a
snapshot" error, the same honesty as CSV's `fullLoadMaxBytes`. `capabilities:
{ history:false, diff:false, scan:false, lazy:true }` (lazy per drilled subtree).

### 2. `snapshotTreeSource({ store, path } | { baseUrl, path })` — Layer 1

Read precomputed rollup rows from a bucket — DT's `snapshots/<id>/tree.parquet`
(or a `tree.json`). History + diff, **no live compute**; this is the mode
marin-gcs already runs by hand. DT's parquet is *built* for this: sorted
`(depth,path)` in 64K-row groups with `path_prefix_bounds` giving "descendant of"
as a min/max-prunable range predicate (`storage/base.py:20-29`). So `children()`
is a depth==d + path-prefix predicate over the parquet — readable with hyparquet
row-group pruning, or (nicely) by pointing our own `TableSource`/SQLite VFS at it
and reusing the block cache from `specs/sqlite-and-table-sources.md`. `snapshots()`
reads a `snapshots.json` index; `diff()` reads `diffs/<a>-<b>.parquet`.
`capabilities: { history:true, diff: <diffs present>, scan:false, lazy:true }`.

### 3. `httpTreeSource({ baseUrl })` + `createTreeHandlers(...)` — Layer 2

The remote protocol, symmetric to `createTableHandlers`. Client `httpTreeSource`
speaks our neutral endpoints; `createTreeHandlers(source, opts)` mounts them in a
Worker/Node beside `createHandlers`. Endpoints (all GET, JSON):

```
/children?path=&depth=&snapshot=   → TreeLevel
/snapshots                          → { snapshots: Snapshot[] }
/diff?a=&b=&path=&depth=            → { node, children }
/scan            (POST) ?path=      → ScanJob
/scan/status?id=                    → ScanJob
```

`createTreeHandlers` wraps *any* `TreeSource`, so the server can sit over a
`snapshotTreeSource` (serve a bucket's snapshots), a `walkTreeSource` (walk R2 in
the Worker), or a scan dispatcher. `scan()` dispatch is a consumer-provided
`scanner(path) => Promise<jobId>` + `status(jobId)` callback — file-tree never
learns the backend, exactly as it never learns a `Store`'s.

### 3′. `diskTreeTreeSource({ baseUrl })` — the existing-DT adapter

DT's live Flask server already exposes a near-complete `TreeSource`: `/api/scan?
uri=&depth=N` returns `{root, children, rows}` of `Row`s, `/api/scans/history`,
`/api/compare`, `/api/scan/start` + `/api/scan/status/<id>` + the SSE progress
stream. Rather than make DT reimplement our protocol, ship a thin client that
maps DT's endpoints onto `TreeSource` (snake→camel, `uri`→drill key, scan-id/ISO
→ `Snapshot.id`). This is what lets marin-gcs and any live DT server light up
with **no server change** — the FT-native `createTreeHandlers` protocol is for
new backends that don't already have DT's API.

## The treemap renderer + FileTree integration

The treemap is a **directory-level alternate view**, not a `Parsed` file kind.
It hangs off `Body`'s `case 'dir'` (`FileTree.tsx:213`).

**`renderers/treemap.tsx`** — `<TreemapView source, path, usePersistedState>`,
lazy-loaded (its own chunk, like the sqlite/parquet viewers), wrapping
`@disk-tree/react`'s `<Treemap<TreeNode>>`. Accessor mapping:

| `<Treemap>` prop | our wiring |
| --- | --- |
| `getSize` | `n => n.size ?? 0` |
| `getChildren` | `n => n.__children` (cached level, if prefetched) |
| `hasChildren` | `n => n.kind === 'dir' && (n.nChildren ?? 0) > 0` |
| `loadChildren` | `n => source.children({ path: n.path, snapshot }).then(l => l.children)` |
| `getLabel` | `n => n.name` |
| `formatSize` | `fmtSize` (our existing `react/fmt`) |
| `cellHref` | `n => \`${routeBase}/${keyToSplat(n.path)}\`` — drilling the map navigates the browser |
| `renderTooltip` | size · nDesc · mtime |
| `colorForCell`/`lens` | age lens (mtime) and, in diff mode, the diverging status color |

**`FileTree` gains `treeSource?: TreeSource | ((prefix: string) => TreeSource)`.**
When present, the dir view gets:

- **Real dir sizes.** `DirListing` fills its `—` cells from
  `source.children(prefix)` rollups (one call per directory shown, or a single
  `children({depth:1})` for the whole level).
- **A list↔treemap toggle** in the dir header, URL-persisted (`?view=treemap`),
  the same shape as the sqlite demo's engine toggle.
- **Snapshot / compare / rescan chrome**, capability-gated: a snapshot dropdown
  only if `capabilities.history`; a compare toggle only if `diff`; a "rescan"
  button (calls `scan()`, polls `scanStatus`, shows progress) only if `scan`.

Nothing above imports a storage backend or a scan engine — `TreeSource` is the
only thing the dir view knows, mirroring how `Store` is the only thing the
listing knows.

## The deployment reality (say it in the spec, not around it)

"One-click deploy DT's scan infra" is true only at Layers 1–2, which are Python.
Be honest about the tiers:

- **Layer 0** (walk): zero Python, works today for every consumer, bounded to
  trees small enough to walk live. The "dozens of apps for free" tier.
- **Layer 1** (snapshot): a scan job — cron, GH Action, GCP Batch, a Fly machine
  — publishes `snapshots/<id>/{tree,diffs,snapshots.json}` to the same bucket the
  `Store` already serves. FT reads them; no live Python at request time. Big
  trees, history, diff.
- **Layer 2** (dispatch): the rescan button wired to whatever the consumer has.
  Full DT power (attribution, staleness, monoid sums) lives in DT proper.

FT owns the interface, the walk/snapshot/http impls, `createTreeHandlers`, and
the treemap wiring. DT owns the scan engine and the reference snapshot format.
They meet at `TreeSource` + the parquet rollup contract.

## Depending on `@disk-tree/react`

`@disk-tree/react` is **source-only** today: `main`/`types` → `./src/index.ts`,
no build/dist, `files: [src]`, ESM (`packages/react/package.json`). A consumer's
Vite compiles the TS fine, but that shape doesn't pin cleanly for a `tsup`-built
library like ours. Plan:

- Treat it as an **optional peer** (like `wa-sqlite`, `hyparquet`, `jq-web`):
  `renderers/treemap` is `external`, in its own chunk, imported only when opened.
  Add it as a devDependency so our own typecheck/build of the wrapper resolves.
- Ask DT to publish a **dist branch via `npm-dist`** (the standard tool), so
  external consumers — us, and anyone — pin by SHA the way they pin every other
  `@rdub` dep. Recorded as Half C of the DT spec. Until then, consumers who want
  the treemap install `@disk-tree/react` from its repo directly.
- `<Treemap>` itself pulls no d3; only `@disk-tree/react/voronoi` does, and we
  don't use it. So the treemap chunk stays dependency-light.

## Demo + testing

- **Demo** (`site/`): `walkTreeSource` over the existing mock fixture tree, with
  the list↔treemap toggle — proving Layer 0 with no backend, the same way the
  SQLite viewer proved itself before any consumer touched it. Then a committed
  snapshot fixture for Layer 1, and the dev-middleware `createTreeHandlers` for
  Layer 2 (mirroring the sqlite engine toggle).
- **`runTreeSourceConformance(makeSource)`** — a harness beside the `Store` one
  (`src/test/conformance.ts`). The canonical `CONFORMANCE_FIXTURE` tree has
  *known* recursive sizes, so a walk/snapshot/http source is asserted against
  exact rollups (per the testing rules: parse to structure, compare equality —
  no substring checks). Every new `TreeSource` adds a one-line vitest file, same
  contract as new `Store`s.

## Non-goals / guardrails

- No recursive-size or scan capability on `Store`. `TreeSource` is separate.
- Don't vendor a treemap; wrap `@disk-tree/react`.
- `e instanceof Error && e.name === '…'` for the "too big to walk" / "no such
  snapshot" typed errors — never `instanceof`, per the subpath-bundle rule.
- The flat "table of the scan" view is a `treeSourceAsTable` bonus, not core.

## Open questions

- **Snapshot identity across sources.** DT keys scans by `(path, time)` and by
  integer id. Is `Snapshot.id` the id, the ISO time, or a content digest? A
  digest would let the Layer-1 reader reuse the block cache's version keying
  (`specs/sqlite-and-table-sources.md`) for free; DT emits ids/times. Probably:
  `id` opaque, `time` for display, and the http/snapshot impls pass `id` as the
  cache version.
- **How much of the level to prefetch.** `children({depth:2})` cuts drill
  latency but inflates the first payload. DT defaults `depth=2`; adopt that and
  expose it.
- **Diff rendering.** Reuse `<Treemap>` + a diverging `lens` (DT's CompareView
  does exactly this), or a dedicated side-by-side? Start with the lens — it's
  one source swap and one color function.
- **Does the `—` fill want its own capability?** Filling dir sizes calls
  `children()` per level even when the user never opens the map. Cheap for a
  snapshot/http source, a full walk for Layer 0. Maybe gate the auto-fill behind
  `lazy===false || capabilities.history` and otherwise fill on demand.

## Status

**Built — the interface, Layer 0, and the dir-size fill:**

- `src/renderers/treeSource.ts` — the seam: `TreeNode`, `TreeSource`,
  `TreeSourceCapabilities`, `Snapshot`, `TreeLevel`, `TreeDiffNode`, `ScanJob`,
  and `TreeTooLargeError` (name-based, per the subpath-bundle rule).
- `src/renderers/walkTreeSource.ts` — Layer 0. Recursively walks a `Store`,
  rolls sizes/mtime up in JS, caches each walked subtree *and* every descendant
  dir (so drills are cache hits), coalesces concurrent walks, and throws
  `TreeTooLargeError` past `maxNodes` (default 50k) without caching the partial.
  `capabilities: { history:false, diff:false, scan:false, lazy:true }`.
- `src/test/treeConformance.ts` — `runTreeSourceConformance`, ground truth by
  independent prefix-sum over `CONFORMANCE_FIXTURE` (can't share a bug with the
  walk). Every future `TreeSource` adds a one-line vitest file.
- `<FileTree treeSource>` fills `DirListing`'s `—` cells with recursive sizes
  (`useDirSizes`), keyed by store key via `keyToSplat`; a `TreeTooLargeError` or
  any failure silently keeps the `—`. File sizes still come from the store.
- Exports (`/react` re-exports `walkTreeSource` + the types; subpaths
  `./renderers/treeSource`, `./renderers/walkTreeSource`, `./test/treeConformance`),
  tsup entries, tests: 233 unit (+12), 45 e2e (+1, asserts a dir's rolled-up
  size renders). Demo: `walkTreeSource(store)` over the mock fixture — verified
  in-browser, dir rows show recursive totals (`docs/` = 459 B = 120+207+132).

**Built — the `<Treemap>` wrapper + list↔treemap toggle:**

- `src/renderers/treemap.tsx` — `<TreeMapView source={TreeSource}>` wraps
  `@disk-tree/react`'s generic `<Treemap<TreeNode>>` through a handful of
  accessors + a `path → children` cache that `getChildren` reads synchronously
  as `loadChildren` fills it; the map drives its own lazy drill (click a dir
  tile to descend), so it needs no router. `@disk-tree/react` is an *optional
  peer*, statically imported here and marked `external`, so it never lands in
  the main bundle — a consumer installs it and lazy-loads this subpath.
- `<FileTree treemapRenderer={…} treeSource={…}>` gains a **list / map / split**
  toggle in the dir view (`DirView`/`ViewToggle`), persisted to `?view=tree` /
  `?view=split` via the same `usePersistedState` everything else uses.
  `treemapRenderer` is pluggable (like `parquetRenderer`) so the core never
  imports the peer. `split` stacks the listing above a shorter (`45vh`) map off
  the one shared `treeSource` — `TreemapRendererProps` grew an optional `height`
  for that. (Cross-highlight "scrub" between the two panes — hover a row → light
  its tile — is a natural follow-up; `<Treemap>` already exposes hover.)
- The pin that unblocked this: `@disk-tree/react` is now git-pinnable at the
  dist-branch root — DT added an npm-dist `package_dir` input that flattens
  `packages/react` to the branch root, so
  `github:runsascoded/disk-tree#<dist-sha>` resolves `@disk-tree/react`
  directly (was a nested workspace before). file-tree + site pin
  `#bdfe23ac…` (`0.1.0-dist.6ed3eed`); `--frozen-lockfile` CI resolves it.
- Exports: subpath `./renderers/treemap`, `/react` re-exports the
  `TreemapRenderer`/`TreemapRendererProps` types (not the component — it pulls
  the peer). Demo passes `treemapRenderer={TreeMapView}`; e2e asserts the
  toggle renders the map, drills `samples`→`catalog.sqlite`, and restores the
  list. 233 unit, 35 e2e (+1 treemap), verified in-browser.

**Not built yet (in priority order):**

- **Layers 1 & 2** — `snapshotTreeSource` (read DT's rollup parquet; can reuse
  the SQLite block cache), `httpTreeSource` + `createTreeHandlers`, and the
  `diskTreeTreeSource` adapter over DT's existing Flask API.
- **Snapshot / diff / rescan chrome**, capability-gated, once a source with
  `history`/`diff`/`scan` exists to drive it.

Companion: `~/c/disk-tree/specs/file-tree-integration.md` (the reciprocal half —
DT adopts `<FileTree>`, publishes the snapshot contract, ships the
`@disk-tree/react` dist branch). That session is reading it now.
