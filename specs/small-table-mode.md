# Small-table mode — sort, filter, and column controls below a threshold

*From asking why CSV columns aren't sortable. The answer is that the viewer
never holds the whole table — but that's only true above a size, and below it
a lot of table affordances become free.*

## The constraint, stated honestly

Both table viewers stream:

- **CSV** paginates by *byte ranges* (256 KB), parsing each page independently.
  It never learns the row count, which is why `rowIndex` is page-relative there.
- **Parquet** paginates by *row group*, decoding one at a time.

Sorting, global filtering, and "N rows" all need the whole table. On a 500 MB
shard that's not a trade-off, it's a hang. So the honest options are (a) never
offer them, (b) offer them always and lie about the cost, or (c) offer them when
they're actually cheap.

(c), with the threshold visible rather than silent.

## Proposal: a size threshold that switches modes

```ts
interface TableViewerOptions {
  /** Load the whole table when it's at most this many bytes, unlocking
   *  sort / filter / exact counts. Above it the viewer streams as it
   *  does today and those controls are absent — not disabled, absent.
   *  Default: ~5 MB. `0` disables; `Infinity` always loads. */
  fullLoadMaxBytes?: number
}
```

**Bytes, not rows**, as the primary knob: it's the thing both viewers know
before reading anything (`totalSize` from the store, parquet's footer), and it's
what actually predicts the cost. A row count only becomes knowable *after* the
decision. ~5 MB is roughly 50–100K rows of typical tabular data — comfortably
sortable in a browser, and small enough to fetch without thinking. Consumers who
know their shape can raise it.

**Absent, not disabled.** A greyed-out sort arrow invites a click and teaches
nothing. The header showing no control, plus a one-line note near the pager
("2.1 GB — streaming; sort and filter need the whole table"), is honest and
self-explanatory.

### What unlocks below the threshold

- **Sort** by column, asc/desc, click the header. Multi-column later, maybe.
- **Filter** — a substring box over all columns, and per-column predicates.
- **Exact row count** — CSV can't report one at all today.
- Pagination becomes purely client-side, so paging is instant.

### What's already there and shouldn't be rebuilt

The dir listing has a filter box; the JSON tree has search and jq. A table
filter should look and behave like those rather than inventing a third idiom.

## Column show/hide, and `<th>` settings

Independent of the threshold — hiding a column needs no extra data:

```ts
/** Columns to show, in order. Absent = all, in schema order. */
columns?: string[]
/** Let the reader change it, via a control on each header. */
columnPicker?: boolean
```

Worth doing because wide tables are common (ctbk's enriched shard is 33
columns) and horizontal scrolling is a bad way to read one.

This connects to the per-column format controls in
`page-level-viewer-slots.md`: a header is accumulating a sort toggle, a
visibility control, and a format control, which is at least one too many for
plain text in a `<th>`. Probably one affordance — a small chevron opening a
per-column menu — with `renderHeader` still able to replace the lot. Design that
once rather than three times.

## URL state — the answer is "opt-in, and that's right"

Asked whether pagination params are URL-bound via `use-prms` by default:
**no.** `usePersistedState` defaults to `defaultUseState`, which is plain
`useState` — ephemeral. URL binding happens only when a consumer passes
`useUrlPersistedState` from `@rdub/file-tree/url-state` (the demo does; ctbk
does).

That default is deliberate and shouldn't change: the main entry doesn't depend
on `use-prms`, and a library that rewrites the host app's URL without being
asked is badly behaved. But every *new* piece of state here (sort, filter,
visible columns) should thread through the same hook, so a consumer who opts in
gets all of it and can paste a link to a sorted, filtered, column-subset view.
That's the feature, really — the URL is the shareable artifact.

## Sequencing

1. **Column show/hide** — no threshold needed, immediately useful on wide
   tables, and forces the header-affordance design early while it's cheap to
   change.
2. **Small-table mode + sort** — the threshold, the mode switch, the note when
   streaming.
3. **Filter** — needs (2)'s full-load, and should match the dir listing's
   existing filter idiom.

## Open

- **Where does the loaded table live?** Re-fetching per sort is silly; caching
  it per `(store, path)` risks holding a 5 MB decode alive after navigation.
  Probably the viewer's own state, dropped on unmount, and accept a re-fetch on
  return.
- **Does parquet get a middle tier?** It has row-group statistics, so
  min/max-based row-group *pruning* could support filtering well above the
  threshold without decoding everything. Real, but a much bigger build, and it
  wants the simple version to exist first.
- **Sort stability and types.** CSV has no types, so sorting is lexical unless
  the consumer says otherwise — which argues for sort comparators being another
  `TableViewerOptions` hook rather than something the viewer guesses.
