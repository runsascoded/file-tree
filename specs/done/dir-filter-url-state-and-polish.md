# Spec: dir filter URL state, parquet pagination URL state, render polish

> Status: **done** (2026-05-27). Three commits, matching the suggested
> split: `657e007` (items 1+4 — filter reset + placeholder),
> `f61a19f` (item 2 — null cell rendering), `491d436` (item 3 —
> `use-prms` URL state, which superseded the explicit reset from #1).

Four small `<FileTree>` / reference-renderer items, filed together
because they all touch dir-listing UX and the parquet viewer that
tomat just started consuming via `@rdub/file-tree/renderers/parquet`.

Filed by `oa/tomat`. Item-by-item:

## 1. Clear `DirListing` filter on `prefix` change

**Bug.** Type "80k" in `/files/runs/` → matches a folder → click into
it → land on `/files/runs/<folder>/` showing "no entries match 80k".
The filter input persisted across the dir→dir navigation because
`DirListing`'s `qInternal` is a `useState('')` whose initializer doesn't
re-run when `prefix` changes; React reuses the same component instance.

**Fix.** Reset on `prefix` change. Either:

```ts
useEffect(() => {
  if (qExternal === undefined) setQInternal('')
}, [prefix, qExternal])
```

or — if items 1 + 3 land together — move the filter input to URL
state so `prefix` change implicitly clears via route change.

If the dir filter ever becomes URL-controlled (item 3), the explicit
reset can be dropped. Until then, the `useEffect` is the minimal fix.

## 2. Parquet viewer: render `null` cells visibly distinct from `''`

**Symptom.** A run's `raw.parquet` has all-optional columns; some rows
(lifecycle events, eval rows mid-train) populate only `_step` +
`_timestamp` + a single `lifecycle/*` column. Today's `fmtCell`
returns `''` for null/undefined — empty `<td>`s for every column that
scrolls off-screen. Visually indistinguishable from a string-typed
column that legitimately stored an empty string, or from a row whose
data we failed to read.

**Fix.** Render null/undefined as a faded `·` (or italic `null`), so
an empty cell shows positive evidence of "this column had no value at
this row" — distinct from an explicit empty string.

```ts
function fmtCell(v: unknown): ReactNode {
  if (v === null || v === undefined) {
    return <span style={{ opacity: 0.3 }}>·</span>
  }
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
```

The signature widens from `string → ReactNode`, but the cell's
`<td>{fmtCell(r[c.name])}</td>` already accepts both.

**Make this configurable.** Some consumers may prefer the existing
empty-string rendering (e.g. exporting the rendered table verbatim,
or matching upstream parquet UIs that render null as blank). Add a
`nullRenderer?: (col: string) => ReactNode` prop to the parquet
renderer's props (and surface it through `<FileTree>`'s
`parquetRenderer` slot — easiest is to wrap the renderer with
`<ParquetViewer nullRenderer={…} />` when the consumer wants a
non-default). Or a simpler API: `renderNullCells?: boolean | ReactNode`
— `false` keeps today's empty string, `true` uses the default `·`,
a `ReactNode` is used verbatim.

Recommend defaulting `renderNullCells: true` (the new behavior) — the
existing UX is misleading more often than it's correct, and "I want
nulls hidden" is the niche case.

(The viewer also surfaces byte size in the page header via the
conditional `fmtSize(byteSize)` at `parquet.tsx:84`. Per the tomat
screenshot it does render — `57.1 KB`. This sub-item is "verify still
working after other changes" only.)

## 3. URL state for dir filter + parquet pagination via `use-prms`

**Today.** Both the dir-listing filter (`q`) and the parquet viewer's
`page` are `useState` — lost on reload, not shareable, not in
back/forward history.

**Want.** Both surfaced as URL query params so a user can paste/share
`/files/runs/?q=80k` or `/files/runs/<run>/raw.parquet?page=5` and
land on the same view.

**Approach.** Add `use-prms` (https://github.com/runsascoded/use-prms,
`@rdub/use-prms` on npm) as an optional peer / direct dep, depending
on how heavy you want the lib base to be.

In `DirListing.tsx`:

```ts
import { useStringParam } from '@rdub/use-prms'  // or whatever the API is
// …
const [qUrl, setQUrl] = useStringParam('q', { default: '' })
// when qExternal is undefined, route q through the URL instead of
// internal state
const q = qExternal ?? qUrl
const setQ = setQExternal ?? setQUrl
```

In `renderers/parquet.tsx`:

```ts
const [page, setPage] = useNumberParam('page', { default: 0 })
```

Open questions for the implementer:

- **Param scoping**: if a user has TWO `<FileTree>` instances on one
  page, the `q` param collides. Either accept that (FT is "one per
  page" in practice) or namespace via a `paramPrefix` prop.
- **Default elision**: `?q=` and `?page=0` clutter the URL. use-prms
  has elide-on-default; turn it on.
- **Optional vs required dep**: `use-prms` is small (it's just React +
  URLSearchParams), unlike `hyparquet`. Probably a direct dep, not a
  peer. But if you want the lib base lean, you can make it a peer +
  fall back to `useState` when missing — costs ~20 LOC of branching.

## 4. Overridable filter placeholder text

**Today.** `DirListing.tsx:88` hard-codes
`placeholder="filter (e.g. NewJersey* or pedestr)"` — these are
crashes-project nouns, not generic. Stale for every other consumer.

**Fix.** Either:

(a) Generic default: `placeholder="filter (e.g. *.parquet)"` (or
just `"filter"` — clean, no embedded examples).

(b) Prop-overridable: add `filterPlaceholder?: string` to
`FileTreeProps` and `DirListingProps`. Each consumer site sets their
own (e.g. tomat → `"filter (e.g. train-* or eval)"`).

Recommend doing **both**: change the default to something generic like
`"filter"` (no project-specific noun), and add the override prop for
consumers who want to be more helpful.

## Suggested commit shape

One commit per item is fine, but #1 + #4 are tiny and could share a
commit ("DirListing: reset filter on dir change + overridable
placeholder"). #2 stands alone. #3 is its own change (adds a dep).

## Implementation notes (post-landing)

- **Open question resolutions**:
  - Param scoping (multi-`<FileTree>` per page): deferred. Accepted "one
    FT per page" — neither current consumer (ctbk/crashes/tomat)
    embeds two. Easy to add a `paramPrefix` prop later if it comes up.
  - Default elision: `defStringParam('')` + `intParam(0)` both omit
    their defaults from the URL — clean `?q=foo` / `?page=3`, no clutter.
  - Optional vs required dep: `use-prms` lives in `dependencies` (not
    peer). It's ~10 KB minified + zero runtime deps; not worth the
    branching cost of making it optional.
- **Verified in browser** (mock demo): typing in the filter writes
  `?q=…`; reload restores it; clicking into a sub-dir clears the URL
  (`<Link>`s build hrefs without a query) → filter clears implicitly.
  Item #1's `useEffect` reset from `657e007` was deleted in `491d436`
  in favor of the URL-state semantics.
- **Parquet `?page=N` not exercised in mock** (fixture has no parquet
  files). Wiring is identical to `?q=` — same `useUrlState` shape,
  same Param semantics. Will be exercised end-to-end on tomat (the
  consumer that filed the spec) once it bumps the file-tree pin.
