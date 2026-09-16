# Table viewers: tooltips only where they add information

**From:** marin-gcs-usage (cw-s3 `/files`, 2026-09-16). Screens: a parquet of 3.3M rows (`key`, `version_id`, `size`, `last_modified`). Two things read as noise:

1. **The elide tooltip fires on every scalar cell**, not just clipped ones — a 32-char `version_id` that fits its column still grows a hover panel repeating the cell verbatim. `ElideConfig`'s own doc names the missing axis: `onlyWhenClipped` ("surface the tooltip only when the value is *measured* to overflow… costs a `ResizeObserver`"). The consumer's only workaround today is a length heuristic in its `elide.tooltip` render-prop, which is wrong for narrow columns and for `maxWidth: false`.
2. **Temporal cells carry a hard-coded native `title`** (`fmtCell`: `<span title={rawText(v)}>`), independent of the `elide` config — so a consumer that opted into a rich tooltip gets *both* a floating panel and the browser's slow native one on the same cell (the "mix of react and native TTs" screenshot). It also survives `elide: { tooltip: false }`.

## Proposal

- **`elide.onlyWhenClipped?: boolean`** (default `true` once implemented; `false` = today's every-scalar behaviour). Measure on `mouseenter` — `td.scrollWidth > td.clientWidth` at hover time — rather than a `ResizeObserver` per cell: it costs nothing until a pointer arrives, and a cell that isn't clipped simply never wraps. Applies to `'native'` (only set `title` when clipped) and to the render-prop (pass `clipped: boolean` in `ElideCtx`, and skip calling it when not clipped and `onlyWhenClipped` is on).
- **Route the temporal raw-value hint through the same seam.** Drop the unconditional `title` in `fmtCell`; instead `ElideCtx` gains `raw?: string` (the underlying scalar when the shown text is an interpretation — temporal, and in future any formatted number), and the `'native'` strategy sets `title` to `raw ?? text` only under the clipped/interpreted rule. A consumer's rich tooltip can then show "raw" when it wants to. Net: one tooltip system, and `tooltip: false` really means none.
- **Optional, same seam: column value formatters.** `format?: Record<string, 'bytes' | 'hexPrefix' | ((v) => ReactNode)>` keyed by column name (or a predicate) — `bytes` renders `1.2 TiB` with the exact count as `raw`; `hexPrefix` shows the first 8 chars with the full id as `text`. Both are things every consumer of a storage/inventory parquet re-implements in `renderCell`; not required for 1–2.

## Consumer-side today (for reference)

`renderCell` handles bytes (`fmtBytes` + exact count on a floating tooltip), hex ids (`slice(0, 8)…` + full value on a click-to-copy tooltip), and strips the native `title` from the default temporal node via `cloneElement(defaultNode, { title: undefined })`; `elide.tooltip` only wraps when `text.length ≥ 40`. Works, but each is a workaround for one of the items above.
