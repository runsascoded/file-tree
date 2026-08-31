# ⌘K path search: `@rdub/file-tree` × `use-kbd`

A pluggable omnibar seam so a consumer can add ⌘K fuzzy-search over the
paths in a `<FileTree>` — scoped to the current subtree, optionally
reaching into ancestor trees (down-scored). Bare `<FileTree>` stays free
of `use-kbd`; a consumer opts in with one adapter, the same way it opts
into URL state with `useUrlPersistedState`.

## Why this falls out of `TreeSource`

The search index is a `TreeSource`. `walkTreeSource` already materializes
every descendant path — that's the corpus that fills `DirListing`'s
recursive sizes and drives the treemap. A ⌘K over "paths under the
current tree" is the *same* set of nodes, reached through the *same*
seam:

```
Store (bytes + one-level listing)
  └─ TreeSource (recursively-sized tree)
       ├─ DirListing   → dir sizes
       ├─ Treemap      → area viz         (renderers/treemap)
       └─ use-kbd ⌘K   → path search      (this spec)
```

So this is not a new data source — it's a third *reader* of the one
`<FileTree treeSource>` already takes. A page that wires a `treeSource`
for dir sizes gets the search corpus for free; the only new dependency
is `use-kbd`, and only for the consumer who wants the omnibar.

## `use-kbd`'s seam: the omnibar endpoint (grounded)

`use-kbd@0.13` (`~/c/js/use-kbd`) already has the exact extension point.
`useOmnibar({ endpointsRegistry })` merges local actions with remote
**endpoints**; an endpoint is:

```ts
// use-kbd/src/types.ts
interface OmnibarEndpointConfigBase {
  group?: string; priority?: number; minQueryLength?: number
  enabled?: boolean; pageSize?: number
  pagination?: 'scroll' | 'buttons' | 'none'
}
interface OmnibarEndpointAsyncConfig extends OmnibarEndpointConfigBase {
  fetch: (query: string, signal: AbortSignal, p: EndpointPagination) => Promise<EndpointResponse>
}
interface OmnibarEndpointSyncConfig extends OmnibarEndpointConfigBase {
  filter: (query: string, p: EndpointPagination) => EndpointResponse   // skips debounce
}
interface EndpointResponse { entries: OmnibarEntry[]; total?: number; hasMore?: boolean }
interface OmnibarLinkEntry {  // OmnibarEntry = link | action
  id: string; label: string; description?: string
  group?: string; keywords?: string[]; href: string
}
interface EndpointPagination { offset: number; limit: number }
```

A `TreeSource` maps onto this almost 1:1 — `children`/paths → entries,
`EndpointPagination` → a slice, `priority`/`group` → scope ordering. So
the file-tree side is a small builder, not a new omnibar.

## The file-tree seam: `treePathEndpoint`

Ship an optional subpath `@rdub/file-tree/omnibar` exporting a builder
that turns a `TreeSource` into an `OmnibarEndpointConfig`:

```ts
export interface TreePathEndpointOptions {
  /** Route base the hrefs resolve against — the `<FileTree routeBase>`. */
  routeBase: string
  /** Root prefix the tree is mounted under — the `<FileTree rootPrefix>`,
   *  so node paths map back into the browser's splat space. */
  rootPrefix?: string
  /** Group label + ordering. Default `{ group: 'Files', priority: 50 }`. */
  group?: string
  priority?: number
  /** Restrict to files, dirs, or both (default both). */
  kinds?: ReadonlyArray<'file' | 'dir'>
}
export function treePathEndpoint(
  source: TreeSource,
  opts: TreePathEndpointOptions,
): OmnibarEndpointConfig
```

Each match becomes an `OmnibarLinkEntry`:

- `id` = `node.path` (stable, unique within the tree).
- `label` = `node.name` (basename — what the eye scans for).
- `description` = `node.path` (the full relative path, for disambiguation).
- `href` = `${routeBase}/${keyToSplat(node.path, rootPrefix)}` (+ trailing
  slash for dirs) — the *same* href construction `DirListing` and
  `Breadcrumb` already use, so a hit navigates exactly where a click
  would.
- `keywords` = path segments, so a query matches an interior segment even
  when it isn't a contiguous substring of the basename.
- `group` from opts; a dir might carry its rolled-up size in `description`
  (it's already on the node) so the omnibar can show "src/ — 84.7 KB".

The consumer wires it into their own `useOmnibar`/`HotkeysProvider` and
renders `<Omnibar>` (or use-kbd's SpeedDial ⌘K button). **Core
`<FileTree>` never imports `use-kbd`** — `treePathEndpoint` lives only in
the opt-in subpath, with `use-kbd` an *optional peer* (the same treatment
`@disk-tree/react` gets for the treemap: static import in the subpath,
marked `external`, lazy-loaded by the consumer).

## Sync vs async: matched to the source's `lazy` capability

`TreeSourceCapabilities.lazy` already tells us which endpoint kind to
build — no new flag:

- **Materialized (`lazy: false`, or a walk that's been drilled)** → a
  **sync** endpoint (`filter`): the whole path set is in hand, so filter
  in memory and skip debouncing for instant results. `walkTreeSource`
  after a root walk is exactly this.
- **Lazy / remote (`snapshotTreeSource`, `httpTreeSource`,
  `diskTreeTreeSource`)** → an **async** endpoint (`fetch`): debounced,
  `AbortSignal`-aware, paginated against the backend's own search (or a
  ranged scan of the snapshot parquet). The disk-tree Flask API can grow
  a `/api/search?q=` that returns `Row`s; until then the adapter can page
  `children` breadth-first, but a real search endpoint is the scalable
  answer.

`treePathEndpoint` picks the variant off `source.capabilities.lazy`; the
consumer writes the same one line either way.

### Corpus enumeration (the one real cost)

A sync endpoint needs the path set enumerated. `walkTreeSource` holds it
in its `levels` cache *after* a walk, but nothing exposes it. Options,
in order of preference:

1. **A first async query that materializes, then flips to sync.** The
   endpoint's first `fetch` triggers a bounded full walk
   (`source.children({})` recursing, reusing the existing cache), builds
   an in-memory path list, and answers subsequent queries synchronously.
   No `TreeSource` change; degrades to `TreeTooLargeError` → the endpoint
   reports "tree too large to index; search a snapshot instead," same
   honesty as the size-fill.
2. **An optional `TreeSource.paths?()` / `entries?()` iterator.** A
   capability a materialized source can implement cheaply (walk yields
   it) and a lazy one omits (falls back to async search). Cleaner, but
   adds surface — defer until a second consumer wants it.

Start with (1): zero interface change, and it reuses the walk cache.

## Ancestor trees, down-scored

The ask: search the current subtree first, then ancestor trees, with a
penalty. Two mountable shapes, both native to `use-kbd`'s registry:

- **One endpoint per scope, decreasing `priority`.** Register the current
  subtree at `priority: 50`, each ancestor scope lower (`40`, `30`, …),
  each with its own `group` label ("This tree", "Parent: data/", …).
  `useOmnibar` orders groups by priority — so current-tree hits sit
  above ancestor hits automatically, and the labels make the scope
  legible. This is the recommended shape: the down-scoring is just the
  registry's own ordering, no custom scorer.
- **One endpoint, distance-scored entries.** A single endpoint that
  searches all scopes and sorts entries by `matchScore − k·depthFromHere`.
  Fewer groups, but the ranking logic moves into file-tree. Prefer the
  multi-endpoint shape unless a consumer wants a single flat list.

"Ancestor trees" presumes a `TreeSource` rooted above the current
prefix (or several mounted stores). `treePathEndpoint` is
per-`(source, rootPrefix)`, so a consumer with a parent-scoped source
registers a second endpoint against it — file-tree supplies the builder,
the consumer decides how many scopes to mount.

## Ranking

`src/react/match.ts`'s `makeMatcher` is substring/glob — right for the
dir filter, too blunt for ⌘K, which wants a *scored* subsequence match
(contiguous-run bonus, basename-hit bonus, segment-boundary bonus) so the
best path floats up. Add a small scored matcher next to it (or extend
it), used by the sync endpoint's `filter` and the async fallback's local
re-rank. Keep it dependency-free; it's ~30 lines and file-tree already
owns the "match a path" concern.

## Routing: hrefs vs SPA navigation

`OmnibarLinkEntry.href` is a URL; use-kbd's `<Omnibar>` navigates on
select. file-tree is a react-router SPA, so a raw `window.location` set
would full-reload. Confirm how use-kbd's Omnibar performs navigation —
if it hard-navigates, either (a) file-tree emits `OmnibarActionEntry`
with a `handler` that calls the consumer's `navigate`, or (b) the
consumer passes a navigate override to `<Omnibar>`. Prefer link entries
(middle-click, cmd-click, crawlable, Vimium hints) with an SPA-aware
navigate — mirror how the treemap's `cellHref` keeps native affordances
while an SPA intercepts the plain click. Nail this down against use-kbd's
Omnibar before building.

## use-prms, the third leg

The omnibar's own ephemeral state (open flag, last query, active scope)
can persist through the same `usePersistedState` seam `<FileTree>`
already threads — so a consumer using `useUrlPersistedState` gets a
shareable `?omnibar=…&oq=…` for free, and the three libraries compose:
`use-prms` carries page state, `TreeSource` carries the corpus, `use-kbd`
carries search + keyboard-nav. All three opt-in, none in the core
bundle.

## Plug-and-play summary

| Concern | Bare `<FileTree>` | Opted-in |
| --- | --- | --- |
| URL state (filter/sort/page/`?view`) | in-memory `useState` | `useUrlPersistedState` (`use-prms`) |
| Recursive dir sizes | `—` | `treeSource` |
| Treemap view | (absent) | `treemapRenderer` (`@disk-tree/react`) |
| ⌘K path search | (absent) | `treePathEndpoint` + `useOmnibar` (`use-kbd`) |

Each row is one prop/one adapter, each dependency an optional peer in its
own subpath. The library a consumer doesn't use, they don't bundle; the
one I reach for every day, I wire in four small pieces.

## Open questions

- **use-kbd Omnibar navigation** — link `href` vs `handler`; does it
  support an SPA navigate override? (Blocks the entry shape above.)
- **A disk-tree `/api/search?q=`** for the async endpoint at scale, vs
  paging `children`. Belongs in the disk-tree integration spec's Layer 2.
- **Whether `TreeSource` should grow a `paths?()` iterator** (corpus
  option 2) once a second consumer needs enumeration.
- **Fuzzy scorer**: extend `makeMatcher` vs a sibling `scorePath` — keep
  the dir filter's semantics unchanged either way.

## Status

**Design only.** No code. Grounded against `use-kbd@0.13`'s real omnibar
endpoint API (`useOmnibar`, `OmnibarEndpointConfig`, `OmnibarLinkEntry`,
`EndpointResponse`) and file-tree's existing `TreeSource` seam +
href/splat construction. Sequenced after the treemap wrapper (built);
independent of Layers 1–2, though a lazy/remote source makes the async
endpoint scale. Companion seams:
`specs/tree-sources-and-treemap.md`, `specs/url-state-opt-in.md` (done).
