# `ditto` with a consumer `renderCell`

*(From jc-taxes, 2026-09-27.)*

## Problem

`ParquetViewer` / `CsvViewer` apply `ditto` only when no `renderCell` is set (`!renderCell && isDitto(…)`). A consumer that customizes *some* cells (jc-taxes formats currency columns and links addresses, returning `defaultNode` for the rest) loses ditto on every column, silently: passing `ditto: [...]` alongside `renderCell` does nothing, with no warning.

jc-taxes re-implements it in its `renderCell` (`prevRow` + `Object.is`), with a copy of the mark's styling, because `dittoMark` isn't exported (`./renderers/ditto` isn't in `exports`).

## Proposal

Either (preferred first):

1. Apply ditto *into* `defaultNode`: when a cell is a ditto cell, `ctx.defaultNode` is the ditto mark (value on `title`), and `ctx.ditto: true` tells `renderCell` so it can opt out (e.g. return its own formatting of the value). Consumers returning `defaultNode` for untouched cells then get ditto for free.
2. Or export `dittoMark` (and document `isDitto` + `prevRow` as the recipe), and warn once in dev when `ditto` and `renderCell` are both set.

## Also noticed

- `import type { Store } from '@rdub/file-tree/stores'` no longer resolves (now only from the package root). Fine if intended; worth a changelog / README line since it breaks consumer type-checks (Vite builds still pass).
- Dist `package.json` drops most `peerDependenciesMeta` (the `npm-dist` bug in `$js/npm-dist/specs/preserve-peer-dependencies-meta.md`); jc-taxes works around it with `pnpm.packageExtensions`.

## Resolution

Went more general than either option: ditto is no longer special-cased in the viewers, it's one renderer built on a general neighbor-access seam.

- **`ctx.at(dRow)`** on `TableCellCtx`: the row `dRow` positions away on the page, in display order; `undefined` past the edges. Lazy (a closure over rows already in memory), so renderers that don't call it pay nothing. `prevRow` stays as a deprecated getter over `at(-1)` (jc-taxes' current `renderCell` keeps working unchanged).
- **`repeatsAbove(ctx)`**: `Object.is` against the same column one row up.
- **`chainCellRenderers(a, b, …)`**: left-to-right composition, each stage getting the previous output as `defaultNode`; `undefined` stages skipped. Copies ctx by property descriptor so the lazy `prevRow` getter survives.
- **`dittoRenderer(cols)`** + **`dittoMark(value?)`**, exported from `@rdub/file-tree/renderers/ditto` (new subpath) and re-exported from `parquet` / `csv`. The mark carries the value on its own `title`. Empty values (`null`/`undefined`/`''`) never collapse (adopted from jc-taxes' version).
- The **`ditto` viewer option** is now sugar for `chainCellRenderers(dittoRenderer(ditto), renderCell)`, in parquet, CSV and the table browser, so it works alongside a `renderCell` (which sees the mark as `defaultNode`, and can override via `repeatsAbove`). This is option 1 of the proposal, generalized; no `ctx.ditto` flag.
- **"Custom" is per cell now:** a cell whose renderer returns `defaultNode` untouched is treated as default (native full-value `title`, string-aware `'middle'` ellipsis). Previously any `renderCell` stripped those from every cell.
- `isDitto` removed (subsumed by `repeatsAbove` + `dittoRenderer`).

jc-taxes can replace its local ditto with `renderCell: chainCellRenderers(dittoRenderer([...]), renderCell)` (or just `ditto: [...]` next to `renderCell`).

### Side notes

- `@rdub/file-tree/stores` never re-exported `Store` (checked history), but it's a natural place to look, so the barrel now re-exports the store types (type-only).
- `peerDependenciesMeta` loss is npm-dist's bug (`$js/npm-dist/specs/preserve-peer-dependencies-meta.md`), not addressed here.
