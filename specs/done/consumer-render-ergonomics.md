# Consumer render-callback ergonomics

*Motivated by the jc-taxes consumer (`~/c/jc-taxes`), which browses property-tax
parquets at `jct.rbw.sh/files` and customizes the `ParquetViewer` with currency
formatting + FK links. Two wiring frictions surfaced; the callback API itself is
great (see below). Consumer code: `jc-taxes/www/src/Files.tsx`,
`jc-taxes/files/src/Browser.tsx`.*

## What already works well (don't regress)

`ParquetViewerOptions.renderCell` — `(ctx: ParquetCellCtx) => ReactNode` with
`{ value, column, row, rowIndex, defaultNode }`, keyed on `column.name`, with
`defaultNode` fallback — is exactly right. Two real features were ~5 lines each:

```tsx
function renderCell({ column, value, row, defaultNode }: ParquetCellCtx) {
  if (CURRENCY_COLS.has(column.name) && typeof value === 'number') return usd.format(value)   // $13,480.62 (also hides float noise 13480.6199…)
  if (column.name === 'Property Location') { const sel = parcelSel(row); if (sel) return <a href={`/?sel=${sel}&agg=lot`}>{defaultNode}</a> }  // FK → map
  return defaultNode
}
```

## Friction 1 — options require a wrapper component

`FileTree`'s `parquetRenderer` is typed `ComponentType<{ store, path, usePersistedState }>` —
it does **not** forward `ParquetViewerOptions`. So to pass `renderCell` you must
wrap `ParquetViewer` yourself:

```tsx
function TaxParquetViewer(props) { return <ParquetViewer {...props} renderCell={renderCell} /> }
<FileTree parquetRenderer={TaxParquetViewer} />
```

Every consumer that customizes a cell rewrites this wrapper.

**Proposal:** let `<FileTree>` accept and forward renderer options. Minimal:
a `parquetOptions?: ParquetViewerOptions` prop it spreads onto its internal
`<ParquetViewer>`. Scalable alternative: a `rendererOptions?: { parquet?: …;
json?: …; csv?: … }` bag if other renderers grow options. Start with the
targeted `parquetOptions`; keep the wrapper path working for existing consumers.

## Friction 2 — `path` is not in the cell ctx

`ParquetCellCtx` carries `{ value, column, row, rowIndex, defaultNode }` but not
`path`. To vary formatting per file you must branch on `path` — which is only on
the wrapper component, not inside `renderCell`. So a single global `renderCell`
can't dispatch by file; you're pushed back into the wrapper (friction 1) just to
capture `path`.

**Proposal:** add `path: string` to `ParquetCellCtx` (and, for symmetry,
`ParquetHeaderCtx` and the dir-listing / json ctxs where they exist). Then one
global `renderCell` can do `if (ctx.path.endsWith('payments.parquet')) …`.

## Combined target

```tsx
<FileTree parquetRenderer={ParquetViewer} parquetOptions={{ renderCell }} />
// renderCell dispatches on ctx.path + ctx.column.name — no wrapper component.
```

## Bonus observations from the same consumer

- **Theme**: the viewer is system/`color-scheme`-colored (good — it followed the
  consumer once they set `color-scheme` on the root). Worth a line in the README:
  "the table follows `color-scheme`; set it (or `data-theme` + a `color-scheme`)
  on an ancestor." jc-taxes had a light/dark bug until it drove `color-scheme`.
- **Row groups**: the "fetch = whole row group" design is right, but it makes
  writer row-group size a UX lever. jc-taxes' `payments.parquet` had ~1M-row
  groups (11MB/fetch); re-writing at 50k rows/group cut it to ~0.65MB. Maybe note
  the recommended writer `row_group_size` for browsable parquets in the README.

---

## Status: implemented (this repo)

### Friction 1 — `parquetOptions` on `<FileTree>`

Implemented as proposed, targeted rather than the `rendererOptions` bag: `FileTreeProps.parquetOptions?: ParquetViewerOptions`, spread onto `parquetRenderer` after the `{ store, path, usePersistedState }` props. `ParquetRenderer` widened to `ComponentType<{…} & ParquetViewerOptions>`; a renderer that ignores the extra props is still assignable, so existing consumers are unaffected.

`src/react/FileTree.tsx` imports `ParquetViewerOptions` **type-only**, so it erases at build and the react entry doesn't inline a second copy of the renderer — verified: no `hyparquet` in `dist/react/index.{js,cjs}`, and the emitted `.d.ts` references `'../renderers/parquet.js'` rather than restating the type.

One divergence from the spec's framing. It claims "every consumer that customizes a cell rewrites this wrapper" — not quite: `makeParquetViewer(opts)` has existed since `ac38c76` and does exactly that binding in one line. jc-taxes' `TaxParquetViewer` is hand-rolled because the factory wasn't found, not because it was missing. So `parquetOptions` was worth adding for a *different* reason than line count:

> `makeParquetViewer` mints a component **type**, so it must live at module scope — calling it in render remounts the table and drops its row-group cache. That rules out hooks closing over live state (theme, a filter, a selection). `parquetOptions` is props on a stable type, so it has no such constraint.

Precedence: factory-baked options win (`<ParquetViewer {...props} {...opts} />`), so the two compose as long as they don't set the same key. `site/src/routes/MockDemo.tsx` now uses both at once — `cellProps`/`headerProps` bound via the factory, `renderHeader` passed as `parquetOptions` — which is also what the new e2e assertion covers.

### Friction 2 — `path` in the ctxs

`path: string` added to `ParquetCellCtx` and `ParquetHeaderCtx`, and as a second argument to `ParquetColumnProps` (`(col, path) => …`) so the whole options bag is path-aware, not just the two render hooks.

Not done for the dir-listing / JSON ctxs, deliberately: `CellRenderer` already gets the `Entry` (whose `key` is the full path), and `renderJsonTree`'s `renderValue` gets the node's `path` *within the document* — adding a file path there would collide with the existing meaning of the name.

### Bonus observations

- **Theme** — README gained a `## Theming` section. Framed as "the library adopts the host's theme" rather than "set `color-scheme`": every surface is either inherited or a 50%-gray alpha, so there's nothing to configure unless your app keeps the theme in application state, in which case mirror it onto `color-scheme` as well as your own `data-theme`.
- **Row groups** — README gained "Row-group size is a browsing knob" under the timestamp-inference section, with the `row_group_size=50_000` recommendation and the jc-taxes numbers (2×11.4 MB → 35×650 KB).

### Verified

- `pnpm typecheck`, `pnpm test` (145/145), `pnpm build`, `site` build.
- e2e: new `mock-demo` case asserts the header row (`region (hooked)` — proving `path` reaches `renderHeader` *and* that `parquetOptions` is forwarded) and the first data row exactly, which pins the timestamp inference: `dt`/`event_ts` read as epochs, annotated `recorded` formatted, and `id` — a bare `INT64` deliberately inside the epoch window — left raw by the name gate.
- CIC at `localhost:8731/mock/samples/events.parquet`.

### Demo coverage

The site demo exercised only the column-styling hooks, so `renderCell` — the one this spec is actually about — had no worked example. `site/` now shows FK links (`region` → `docs/regions/*.md`), value replacement (currency, which is what suppresses float noise), row context (`id` marked from its row's `region`), and the dir-listing `renderCell`. e2e covers the FK navigation.

### Found while verifying

The parquet sticky header had a translucent background (`rgba(127,127,127,0.15)` with nothing opaque under it), so scrolled rows showed through it — visible on any file taller than the viewport. Both it and the CSV header now use `Canvas`, which is opaque and tracks `color-scheme`. Unrelated to this spec, but it's the first thing you see in the consumer's own browser.

### Follow-ups not done

- `rendererOptions` bag for json/csv/notebook. Nothing asked for it yet; `parquetOptions` can be folded into one later without a break.
- jc-taxes should repin (`pds gh file-tree`) and can then drop `TaxParquetViewer` for `parquetOptions={{ renderCell }}`, with `ctx.path` replacing the per-file wrapper it was heading toward.
