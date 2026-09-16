# Table viewers: tooltips only where they add information

**From:** marin-gcs-usage (cw-s3 `/files`, 2026-09-16). Screens: a parquet of 3.3M rows (`key`, `version_id`, `size`, `last_modified`). Two things read as noise:

1. **The elide tooltip fires on every scalar cell**, not just clipped ones — a 32-char `version_id` that fits its column still grows a hover panel repeating the cell verbatim. `ElideConfig`'s own doc names the missing axis: `onlyWhenClipped` ("surface the tooltip only when the value is *measured* to overflow… costs a `ResizeObserver`"). The consumer's only workaround today is a length heuristic in its `elide.tooltip` render-prop, which is wrong for narrow columns and for `maxWidth: false`.
2. **Temporal cells carry a hard-coded native `title`** (`fmtCell`: `<span title={rawText(v)}>`), independent of the `elide` config — so a consumer that opted into a rich tooltip gets *both* a floating panel and the browser's slow native one on the same cell (the "mix of react and native TTs" screenshot). It also survives `elide: { tooltip: false }`.

## Update (2026-09-16): implemented — items 1 & 2 landed; item 3 deferred

Landed entirely in `@rdub/file-tree` (`src/renderers/table.ts` + the three viewers); nothing in the consumer. Verified: 270 unit tests, 8 `/elide` e2e (incl. new clip-gate cases), CIC on the live demo.

### 1. `elide.onlyWhenClipped?: boolean` (default `true`)

New axis on `ElideConfig`/`ResolvedElide`/`ELIDE_DEFAULTS`. Measured on `mouseenter` — `td.scrollWidth > td.clientWidth` at hover time (the exported `cellClipped(el)`) — not a per-cell `ResizeObserver`: it costs nothing until a pointer arrives, and a cell that never clips never wraps.

- **`'native'` strategy — fully owned by file-tree.** `applyElide` no longer returns a static `title` for the default preset; it returns an `onMouseEnter` that sets `td.title` to the full value *iff* the cell is measured to clip, and clears it otherwise. `onlyWhenClipped: false` restores the old static-title-on-every-scalar behaviour.
- **`tooltip` render-prop — gated by the consumer, at hover.** A render-prop is invoked at *render* time, where the DOM isn't measurable, and it owns its own hover machinery (floating-ui `onOpenChange`), so file-tree can't decide clip-vs-not for it. The blessed pattern (already what the reference demo's `PathTip` does) is to call `cellClipped(td)` in the tooltip's own open handler and decline to open when it returns false. `cellClipped` is now exported precisely so a consumer drops its length heuristic for the correct measurement. **This is the one divergence from the original sketch**, which imagined file-tree passing a render-time `clipped: boolean` and skipping the render-prop call — not possible without a racy hover-remount, and unnecessary since the consumer already measures at hover.

### 2. Temporal raw-value hint routed through the seam

- `fmtCell` no longer sets its own `<span title={…}>`. Instead `ElideCtx` gains `raw?: string` — the underlying scalar as text when the cell shows a lossy *interpretation* of it (a temporal integer drawn as a date; later, a formatted number) — supplied per-cell via a new `cellRaw(value, temporal)` helper.
- The `'native'` strategy titles an *interpreted* cell (`raw` present) **unconditionally** — its tooltip shows the underlying value the cell reformatted away, information the cell never shows, clipped or not — while a *verbatim* scalar obeys `onlyWhenClipped`. Net: one tooltip system, `tooltip: false` really means none, and a rich render-prop can read `ctx.raw` to show "raw: …" itself.

### 3. Column value formatters — deferred (was "optional, not required for 1–2")

`format?: Record<string, 'bytes' | 'hexPrefix' | …>` is a separate feature (a `renderCell` convenience, not a tooltip concern) and stayed out of this pass. mgu keeps its `renderCell` for bytes/hex ids for now; revisit if a second consumer wants it.

## API summary (as shipped)

```ts
interface ElideConfig {
  maxWidth?: string | false
  tooltip?: 'native' | false | ((ctx: ElideCtx) => ReactNode)
  content?: (value) => string | undefined
  onlyWhenClipped?: boolean   // NEW, default true — native title only on clipped cells
}
interface ElideCtx {
  value; text; node; column; row; path
  raw?: string                // NEW — underlying scalar when the cell shows an interpretation
}
function cellClipped(el: HTMLElement): boolean   // NEW export — the blessed overflow measurement
```

## Consumer-side today (for reference)

`renderCell` handles bytes (`fmtBytes` + exact count on a floating tooltip), hex ids (`slice(0, 8)…` + full value on a click-to-copy tooltip), and strips the native `title` from the default temporal node via `cloneElement(defaultNode, { title: undefined })`; `elide.tooltip` only wraps when `text.length ≥ 40`. With this change, mgu can drop the `cloneElement` title-strip (item 2 removes the stray title) and replace the `length ≥ 40` heuristic with `cellClipped(td)` in its tooltip's open handler (item 1).
