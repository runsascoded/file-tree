# Making the renderers genuinely forkable

*From "are these custom renderers easily reusable/forkable/customizable by
users, or what's the best way to achieve that?" Today: customizable along the
axes we anticipated, and a cliff everywhere else.*

## The ladder, and where it breaks

There are four rungs a consumer can be on, in increasing cost:

1. **Options** — `initialOpenDepth`, `alignNumeric`, `inferTimestamps`,
   `jqDebounceMs`. Cheap, but each one is permanent API surface, and we can't
   anticipate them: `jqDebounceMs` exists because a debounce got noticed, not
   because we designed for it.
2. **Render hooks** — `renderCell` / `renderHeader` / `renderValue` /
   `renderKey` / `cellProps`. These scale well, because `defaultNode` means a
   consumer overrides a *decision* without reimplementing the thing around it.
   This is the rung that's working.
3. **Compose from parts** — build a viewer out of the library's pieces.
   **Doesn't exist.** Nothing below the top-level component is exported.
4. **Fork the file** — copy it into your app and register it via `viewers`.
   Now cheap to *wire* (that's what the registry bought), and expensive to
   *write*, because rung 3 is missing.

So the cliff is between 2 and 4. A consumer who wants something the hooks don't
reach — a different pager, virtualised rows, a column-group header, an entirely
different table — has to copy ~500 lines of parquet viewer including row-group
math, the async buffer plumbing, temporal inference wiring and pagination, to
change the twenty they cared about. And their copy then rots against ours.

## Rung 3: export the parts

Each viewer is really *plumbing* + *presentation*, and only the second is worth
forking. The plumbing is already written and tested here; a fork should be able
to import it.

**Parquet** — `asyncBufferFromStore` (already exported), plus:
- `useParquetMeta(store, path)` → `{ schema, rowGroups, totalRows, byteSize, stats }`
- `useRowGroup(store, path, index)` → the decoded rows + loading state
- `inferColumnFormats` / `formatTemporal` (already exported)
- `resolveColStyles` (already exported, on `renderers/table`)

**CSV** — `parseLine` (the quote-aware splitter), and the byte-range pager as a
hook: `useCsvPage(store, path, delimiter, page)`.

**Tree** — this is the interesting one, because the JSON tree *is* mostly
presentation. `collectMatchPaths`, `scalarNode`, `jqKeySegment`, `runJq`, and
`useOpenState` are each independently useful; `<Node>` itself is the whole
renderer minus chrome.

Exporting hooks rather than components is the right split: it keeps the
data-fetching and format decoding shared (where bugs live, and where our tests
are) and leaves markup entirely to the fork. A consumer writing a virtualised
parquet table should be able to use `useRowGroup` and never think about
`hyparquet`.

## What that costs

Every exported symbol is a compatibility promise, which is exactly why this
isn't just "export everything". Two mitigations worth deciding on:

- **A separate entry point** — `@rdub/file-tree/renderers/parquet/internals`
  (or `/unstable`), documented as semver-exempt. Honest, and it keeps the main
  subpath a small surface.
- **Or accept the promise** for the handful above and keep the rest private.
  Fewer moving parts; the risk is picking wrong and being stuck.

Leaning towards the first: the whole point is serving cases we didn't
anticipate, so pretending we can freeze the right set is the same mistake in a
new place.

## Rung 1, revisited: stop adding options

`jqDebounceMs` is fine but it's a smell — a constant someone happened to
question. The general form is that a consumer should be able to supply the
*behaviour*, not tune our constant. For the tree that would be an injectable
`runJq`, which also solves a real problem the current design has: `jq-web` is
hard-wired, so a consumer who wants `jaq`, a server-side jq, or a WASM build
they already ship has no way in.

```ts
runJq?: (value: unknown, expr: string) => Promise<unknown>
```

Same shape for the YAML parser (`parse` already does this), and it's the same
idea as `markdownRenderer` — the library ships a default and gets out of the
way. Prefer this to another option whenever the thing being configured is a
*strategy* rather than a number.

## Forkability of the demo code

Separately: `site/`'s `S2CellPreview`, `LogViewer`, `YamlViewer`,
`parquetCells`-style hooks are the most useful documentation we have, because
they're what a consumer actually writes. Worth saying so in the README and
keeping them copy-paste-able (self-contained, minimal imports) rather than
letting them grow shared helpers. ctbk independently wrote a near-identical
`S2CellTip` — that's evidence the demo should be *lifted from*, not imported.

## Sequencing

1. **Injectable strategies** where they replace anticipated-constant options —
   `runJq` first, since it's also a real limitation.
2. **Export the hooks** behind an `/internals` entry, starting with parquet's
   (`useParquetMeta`, `useRowGroup`) — the viewer with the most plumbing and the
   most likely fork.
3. **Document the ladder** in the README, so a consumer knows which rung they're
   on and what the next one costs.

## Status: implemented (`5fa1469`, `4244cc6`)

Rungs 3 and 4 exist now: `renderers/parquetData` (`useParquetMeta`,
`useRowGroup`, plus the pruning primitives), `renderers/csvData`
(`useCsvHeader`, `useCsvPage`, `parseLine`), and the tree's `useOpenState` /
`collectMatchPaths` / `jqKeySegment`. `runJq` and `parse` are injectable
strategies.

One decision reversed from the sketch: **no `/internals` entry.** These are
stable, tested surface — a semver-exempt namespace would hedge on a promise
worth making. If that proves wrong, moving them behind one is a later,
smaller break than the reverse.
