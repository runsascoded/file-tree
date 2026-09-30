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
