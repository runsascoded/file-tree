# Extend the render-hook pattern to parquet table cells (+ HR timestamp inference)

Source: ctbk session, 2026-08-16. Trigger: browsing `ctbk.dev/files/avail-v6/3m/8d/2026-04-25.parquet`, where the `dt` column renders as raw `1777075200000` on every row — correct, unreadable, and the most-scanned column in these files.

**Status: implemented 2026-08-16.** Both asks landed; inference lives in a standalone `src/renderers/temporal.ts` (pure, 23 unit tests) rather than inside the renderer. See "Implementation notes" at the bottom for where it diverged from this spec.

## Current state

The render-hook pattern already exists here, in two places:

- `renderCell` (`CellRenderer`, `src/react/DirListing.tsx:35`) — ctx `{ entry, column, prefix, href, defaultNode }`, threaded through `FileTree` → `Body` → `DirListing`. Applies to the **directory listing** table (name / size / mtime).
- `renderValue` (`JsonValueRenderer`, `src/renderers/json.tsx`) — ctx `{ key, value, defaultNode }`, wired via `makeJsonTreeRenderer({ renderValue })`. Applies to JSON scalars.

What's missing is the same hook for **table cells inside a rendered parquet**. `src/renderers/parquet.tsx:285` calls a value-only helper:

```ts
{fmtCell(r[c.name])}          // line 285
function fmtCell(v: unknown): ReactNode   // line 356
```

No column, no schema, no row, no override point. So the file-listing table is themeable and JSON scalars are themeable, but the parquet grid — the one showing `dt` — is not.

## Ask 1: `renderValue`-shaped hook for the parquet renderer

Mirror the JSON precedent rather than inventing a new shape:

```ts
export interface ParquetCellCtx {
  value: unknown
  column: { name: string; physicalType: string; logicalType?: string | null; convertedType?: string | null }
  row: Record<string, unknown>
  rowIndex: number
  defaultNode: ReactNode
}
export type ParquetCellRenderer = (ctx: ParquetCellCtx) => ReactNode
```

Threaded the way `makeJsonTreeRenderer({ renderValue })` already is, so a consumer overrides the columns it cares about and returns `defaultNode` for the rest. The `column` descriptor is the part that doesn't exist today and is the prerequisite for everything below; it's already in hand where the schema is read.

Worth the same treatment on the CSV renderer eventually — same table, same problem, no schema to infer from.

## Ask 2: make the default smarter for timestamps

A hook alone means every consumer re-implements epoch formatting. Signals, strongest first, stop at first hit:

**(a) Parquet logical type** — `TIMESTAMP(unit, isAdjustedToUTC)` / `DATE` are unambiguous. Correct primary signal, free.

**⚠️ It will not fire on the files that motivated this.** From a real ctbk shard:

```
cell       physical=BYTE_ARRAY logical=String  converted=UTF8
dt         physical=INT64      logical=None    converted=NONE
count_sum  physical=DOUBLE     logical=None    converted=NONE
```

The pyramid engine writes epoch millis as a bare `INT64` with no annotation. So (b) and (c) are load-bearing, not nice-to-haves — logical-type inference alone leaves the motivating case exactly as broken as today.

**(b) Value-range heuristic** on INT64/DOUBLE. The renderer already holds a page of rows; require *all* sampled values to agree on one unit:

| unit | plausible window (~1990–2100) |
|---|---|
| s | 6.3e8 – 4.1e9 |
| ms | 6.3e11 – 4.1e12 |
| µs | 6.3e14 – 4.1e15 |
| ns | 6.3e17 – 4.1e18 |

Windows are ~3 orders of magnitude apart, so cross-unit confusion isn't a real risk. The real risk is a non-temporal integer landing in a window — hence:

**(c) Name as a gate, not a trigger.** Require a temporal-looking name before applying (b): `dt`, `ts`, `time`, `timestamp`, `date`, or `_at` / `_time` / `_ts` suffix, case-insensitive. A large-integer `id` column must never become a date. Name alone should never trigger — a `date` column of strings is already fine.

When (b) and (c) disagree, render raw. A silently mis-rendered timestamp is worse than a visible integer.

## Rendering

- UTC with an explicit marker — these are analytical files; local-time coercion invents a timezone the data doesn't carry: `2026-04-25 00:00:00Z`.
- Elide sub-second precision when all sampled values are second-aligned (all of ctbk's are), so the common case reads `2026-04-25 00:00Z` rather than a wall of zeros.
- Keep the raw value reachable via `title` so it stays copyable.
- Preserve `fontVariantNumeric: tabular-nums`.

## Suggested escape hatch

A per-column override in URL state (alongside the existing `use-prms` params) — e.g. `?fmt=dt:ms,foo:raw` — lets someone force or suppress interpretation without code. Not required for a first cut; noted because the inference is heuristic and an override is the honest complement to a guess.

## Acceptance

- Parquet with annotated `TIMESTAMP` columns renders them human-readably (signal a).
- `ctbk.dev/files/avail-v6/3m/8d/2026-04-25.parquet` renders `dt` as `2026-04-25 00:00Z`-style, not `1777075200000` (signals b+c — the motivating case).
- An INT64 column named `id` / `count` / `size` whose values land in an epoch window renders **raw** (name gate holds).
- A consumer passing the hook overrides one column and inherits defaults elsewhere.
- Mixed-unit or out-of-window integer columns render raw rather than guessing.

## Note for ctbk

ctbk's `www` pins `@rdub/file-tree` at `5731bbe`, which predates both `4406f5b` (`renderCell`/`renderCrumb`) and `7f7b893` (`renderValue`). It needs a re-pin to pick up any of this.

## Not in scope

- Timezone selection UI.
- Duration/interval columns (`duration_sum` in ctbk's shards is seconds-as-double) — no reliable signal beyond the name, much easier to get wrong.

## Implementation notes

Landed as `renderCell` on the parquet viewer plus `src/renderers/temporal.ts`. Where it diverged from the spec above:

- **Threading is a factory, not a prop.** `parquetRenderer` is already a component slot on `<FileTree>`, so there's nowhere for a `renderCell` prop to sensibly live. `makeParquetViewer({ renderCell, inferTimestamps })` mirrors `makeJsonTreeRenderer` instead. The bound wrapper delegates to a stable top-level `ParquetViewer`, so options can't accidentally remount the table.
- **`column` is flat, not a nested descriptor.** `{ name, physicalType, logicalType, timeUnit, convertedType }` — all strings, so hyparquet's `LogicalType` union doesn't leak into the public API. `timeUnit` is broken out because the unit is the one parameter a consumer actually needs.
- **A fourth signal was needed.** hyparquet resolves annotated `TIMESTAMP`/`DATE` columns to JS `Date` before the renderer sees them, so signal (a) can be invisible in the schema yet already applied in the data. A `Date` in the sample is treated as unambiguous and skips the name gate. In practice hyparquet-writer's `TIMESTAMP` round-trips as `converted_type: TIMESTAMP_MILLIS` and arrives as bigint in Node but as `Date` in the browser — both paths are handled, and both are covered by tests.
- **Precision has four tiers, not two.** `day` (for `DATE`) / `min` / `sec` / `ms`, picked as the coarsest that loses nothing across the sample. The spec's example output `2026-04-25 00:00Z` implies eliding *seconds* as well as sub-seconds, which one tier can't express.
- **Sampling is capped** at 10k rows per column (`SAMPLE_LIMIT`), so "all sampled values agree" is a guarantee over that prefix, not the whole row group. Bounds the cost on a pathological RG.
- **Range heuristic is `INT64`/`DOUBLE` only**, per the spec. `INT32` can only reach the seconds window, where it's indistinguishable from an ordinary counter.
- **The escape hatch is code-level, not URL-level.** `makeParquetViewer({ inferTimestamps: false })` suppresses the guess while leaving annotated columns formatted. The `?fmt=dt:ms,foo:raw` URL param is still unbuilt — the schema panel labelling guesses as `(inferred)` covers the "is it lying to me?" case, which was the honest motivation.

### Verified

Against the live ctbk bucket at `localhost:8731/http/ctbk/avail/agg=1d/cons=1d/2026-05-03.parquet` (2,407 rows, 17 columns): `dt` renders `2026-05-03 00:00Z` and is labelled `INT64 · epoch seconds (inferred)` — note **seconds**, not the millis of the spec's example shard, read off the data rather than assumed. The other 16 columns (`*_n`, `*_sum`, `*_sum_sq`) are untouched — no false positives.

`site/src/fixtures/parquet.ts` generates a mock-store fixture covering all four cases in one file (bare-INT64 day-aligned, bare-INT64 second-aligned, annotated `TIMESTAMP`, and an `id` column deliberately inside the epoch window that must stay raw), browsable at `/mock/samples/events.parquet`.

### Follow-ups not done

- **CSV renderer** — same table, same problem, and with no schema to infer from it's signals (b)+(c) only. `temporal.ts` is renderer-agnostic and takes a plain `{ name, physicalType? }`, so wiring it up is small.
- **ctbk repin** — `www` still pins `5731bbe`. This work is on `main` past `7f7b893`.
