# Parquet table readability: tail-keeping elision, repeated values, page size, header weight

Handoff from mgu (`~/c/oa/marin-gcs-usage`, gcs session, 2026-09-16). Ryan read a GCS listing shard at `gcs.oa.dev/files/listing/<date>/<bucket>/shard-00-0000.parquet` (1.2M rows × 5 columns: `bucket`, `name`, `size_bytes`, `created`, `storage_class_id`) through the parquet viewer and found the rows hard to scan. Four of the six complaints are viewer-level rather than consumer-level; this spec is those four. (The consumer-level two — a human-readable `storage_class_id`, and a byte cell whose unit sits in its own slot so numbers align — landed in mgu's `renderCell`.)

## Decisions & plan (file-tree session, 2026-09-16)

Ryan's direction: **every one of these bits is configurable**, folding is **off by default**, and consumers must be able to **custom-render `<th>`s with an arbitrary fn**, distinct from cells (a separate closure per).

Ground-truth against the current code:
- The custom-`<th>` closure **already exists**: `renderHeader` (`TableHeaderRenderer` / `TableHeaderCtx`) is separate from `renderCell` and wired through all three table viewers (parquet, csv, tableBrowser). So item 4's *closure* ask is already met; only the **default `TH_STYLE`** (item 4's other half) needs a distinction bump.
- `pageSize` (item 3) is meaningful only for the row-paginating viewer (parquet). CSV pages by *bytes*, so it has no rows-per-page. Add the option format-neutrally (like `rowIndex`'s per-viewer caveat), honored where the viewer paginates by rows. Default stays **100** (configurable) — no silent behavior change.
- `ellipsis` (item 1) lands as a per-column axis on the `elide` seam. `'end'` (default) + `'start'` are pure CSS; `'middle'` needs JS measurement.
- Repeated values (item 2): `prevRow` on `TableCellCtx` is the cheap seam (enables consumer ditto); a built-in `ditto` option (per-column opt-in) and `foldConstantColumns` (**default off**, parquet-only — needs whole-file RG stats) sit on top.

Phasing (each phase updates this spec in-place + commits):
- **A** — cheap wins: item 4 default `TH_STYLE` bump; item 3 `pageSize`.
- **B** — item 1 `ellipsis: 'start'` (CSS), then `'middle'` (JS).
- **C** — item 2 `prevRow` seam + `ditto` + `foldConstantColumns`.

## 1. `ellipsis: 'middle' | 'start'` on the elide seam — ✓ Phase B

`ElideConfig` gained `ellipsis?: EllipsisMode | Partial<Record<string, EllipsisMode>> | ((column) => EllipsisMode)`, per-column, default `'end'`. Both non-default modes turned out to be **pure CSS** — no `ResizeObserver`, no binary search (the handoff's guess that `'middle'` needs measurement was wrong):

- `ellipsis: 'end'` (default) — the existing CSS clip.
- `ellipsis: 'start'` — keep the tail. `resolveColStyles` sets the cell `direction: rtl; text-align: left`; `ellipsisWrap` isolates the value in a `<bdi>` so the path's own characters keep their order. The `<td>` still overflows, so tooltip recovery is unchanged. The prefix-sharing fix, and exactly mgu's `renderCell` trick.
- `ellipsis: 'middle'` — keep both ends (`abc…xyz`). A flex `head` (clip-at-end) + a fixed last-`MIDDLE_TAIL`(=12)-char `tail`; the `…` falls between them. Only splits a **string** cell rendered by default (a `renderCell` node or non-string value falls back to `'end'`). Because the flex fits the `<td>` (so it never overflows and the clip measurement can't fire), a middle-elided cell native-titles *unconditionally* — like an interpreted (`raw`) cell, it shows less than the value. A render-prop tooltip, gated on `cellClipped(td)`, won't open on a middle cell; that's documented as the one interaction (use `'start'` if you need render-prop recovery, or open unconditionally).

Wiring: `ellipsisWrap` runs on the rendered node *before* `applyElide`, so a tooltip render-prop wraps the reshaped node. Landed as `EllipsisMode` + `MIDDLE_TAIL` + `ColStyle.ellipsis` + `applyElide`'s `ellipsis` arg; `splitMiddle` is the pure, unit-tested split.

Per column, not just global: `elide: { ellipsis: { name: 'start' } }` or a `(column) => …` — a table mixes paths (tail matters) with prose (head matters).

## 2. Repeated values: ditto marks and constant-column fold

Two shapes of the same problem, best solved separately:

- **Constant column.** `bucket` is `marin-us-east5` on every row of the file. The row-group stats already know it (`min === max` for every RG — the header title today reads `row group: = marin-us-east5`). A viewer option (`foldConstantColumns`, default on?) drops such a column from the grid and states it once in the caption / stats line: `bucket = marin-us-east5`. Zero information lost, one column of width recovered. Only sound when stats cover the whole file (all RGs' min/max agree); in streaming mode with partial stats, fold per loaded RG or not at all.
- **Runs.** Sorted or clustered columns (`created` on a listing, a `dir` column, dates) repeat the previous row's value for stretches. A `ditto` option renders a run's second-and-later cells as `"` (or `〃`, or a dimmed copy — the mark should be a rendering choice) so the eye lands on changes. Needs the previous row in `renderCell`'s context or a viewer-level pass over the page's rows before rendering; the page is already sliced (`visibleRows`), so a `prevRow` field on `TableCellCtx` is the cheap seam and lets a consumer do its own ditto styling too. Should be per-column opt-in (`ditto: ['bucket', 'created']`) — a ditto on a numeric column is wrong.

Ryan's specific ask was a `"` marker for the `bucket` column; the fold is the better answer for that column, and ditto marks are the answer for the run-shaped ones.

## 3. `pageSize` option — ✓ Phase A

`pageSize?: number` on `TableViewerOptions` (default 100, kept from the old `ROWS_PER_PAGE` constant to avoid a silent behavior change). Honored by parquet's intra-RG row pagination; ignored by CSV (byte pagination). A rows-per-page *control* is deferred — the prop is the config; the control is extra chrome.

`ROWS_PER_PAGE = 100` is a module constant. Make it an option (`pageSize`, default maybe 50 — Ryan: "should page size be configurable? default < 100?"), and consider a control next to the in-RG pager (`rows per page: 25 / 50 / 100 / 250`) bound through `usePersistedState` like the other viewer state, so a reader can widen a page for scanning or narrow it for a slow renderer.

## 4. Header row distinction — ✓ Phase A

Two parts: the *custom-`<th>` closure* and the *default styling*.
- **Closure — already present.** `renderHeader` (`TableHeaderRenderer` / `TableHeaderCtx`) is a separate closure from `renderCell`, wired through parquet, csv, and tableBrowser. Ryan's ask ("custom-render `<th>`s with an arbitrary fn, distinct from cells") is met by the existing API; nothing to add.
- **Default `TH_STYLE`** bumped: `fontWeight: 500 → 650`, `borderBottom: 1px → 2px` at higher alpha, plus a faint `rgba(127,127,127,0.06)` tint (a neutral that reads in either theme). Overridable via `headerProps`.

`TH_STYLE` is `fontWeight: 500` with a 1px bottom border, which on a dark background reads as just another row (screenshot: the header line was not visibly different from data rows). Suggest `fontWeight: 600–650`, a slightly stronger bottom border, and/or a faint background tint on `<thead>` — as the default, since the inline style can't be overridden from consumer CSS without `!important` (mgu's workaround is `headerProps.style`). If the default stays light, at least document the `headerProps` route in the README next to `elide`.

## Not asked here

- Timestamp rendering: the `created` column was all one day, so a relative or day-grouped rendering wouldn't have helped; no change proposed.
- The elide tooltip on short values: solved by `onlyWhenClipped` (mgu is still on `b64278c` and gates by a length heuristic; will pick up the measured version on its next bump).
