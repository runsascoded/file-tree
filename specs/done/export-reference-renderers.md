# Spec: export reference renderers (ParquetViewer, MarkdownRenderer, …) from the lib

> Status: **done** (2026-05-27). Landed in one pass: all six site/ refs
> (parquet, markdown, csv, notebook, code, json) moved under
> `src/renderers/`, exposed via `@rdub/file-tree/renderers/<name>`
> sub-paths, with optional peer deps (`hyparquet`, `react-markdown`,
> `remark-gfm`, `highlight.js`). Site/ migrated to the new imports —
> doubles as the integration test (vite build + manual CIC of mock
> demo confirmed markdown / json / code renderers still wire end-to-end).

## Problem

`@rdub/file-tree` ships pluggable renderer slots for `.parquet`,
`.md`, `.csv`, `.ipynb`, code highlight, JSON pretty-printing — each
via a `ParquetRenderer`-style optional prop on `<FileTree>`. **None of
the reference implementations are exported from the published package.**

Today's "wire parquet preview" flow for a consumer:

1. Read the reference impl at `site/src/ParquetViewer.tsx` (the demo
   site, not the published `src/`).
2. Copy 166 lines into the consumer's tree (e.g. `oa/tomat` just
   landed exactly this).
3. Add `hyparquet` to consumer's dep tree (already a transitive dep
   for many; explicit add otherwise).
4. Pass through to `<FileTree parquetRenderer={ParquetViewer}>`.

That's the same workflow `ctbk.dev`, `nj-crashes`, and now `tomat`
have all followed. The reference impl has non-trivial logic (paginated
row-range reads, schema disclosure, sticky-header table, sticky range
read on page change). Copy-pasting it means:

- every consumer drifts independently when the reference improves
- bug fixes in the reference don't propagate
- consumers without parquet needs still see "ParquetViewer not
  yet supported" in the renderer slot (which is correct, but it's
  surprising in a lib that *does* have the renderer just sitting
  next door in `site/`)

The reasoning in `FileTree.tsx`'s comment is good ("pluggable so the
lib doesn't bundle `hyparquet`"), but the conclusion — making every
consumer copy the file — is wrong. The hyparquet-bundling concern is
solvable with a sub-path export.

## Proposal

Add an optional sub-path export per renderer that depends on a heavy
external (today: parquet, csv, markdown, code highlight). Consumers
opt in by importing from the sub-path; the corresponding heavy dep
becomes an optional peer.

```ts
// Consumer code, today:
import { ParquetViewer } from './ParquetViewer'  // 166-line copy

// Consumer code, after this spec:
import { ParquetViewer } from '@rdub/file-tree/renderers/parquet'
```

### Implementation

1. **Move `site/src/ParquetViewer.tsx` → `src/renderers/parquet.tsx`**
   (same module, same exported `ParquetViewer`, no API changes).
2. **`package.json` exports**: add a sub-path:
   ```json
   "exports": {
     ".": "./dist/index.js",
     "./react": "./dist/react/index.js",
     "./stores/*": "./dist/stores/*.js",
     "./renderers/parquet": "./dist/renderers/parquet.js"
   }
   ```
3. **`peerDependencies`**: add `hyparquet` as `peerDependenciesMeta`
   optional. Consumers importing `./renderers/parquet` will see a
   missing-peer warning at install time; consumers who don't import
   it pay nothing.
4. **Demo site (`site/`)**: replace its inlined `ParquetViewer.tsx`
   with `import { ParquetViewer } from '../../src/renderers/parquet'`
   (or the published path if testing prod). Demo stays a 1-line
   integration, doubles as the canonical test of the new export.

### Same pattern for other renderers

The reference impls in `site/` for `MarkdownRenderer`, `csvRenderer`,
`notebookRenderer`, `codeRenderer` (when they exist) move under
`src/renderers/` too. Each gets its own optional peer:

| sub-path | optional peer |
|---|---|
| `./renderers/parquet` | `hyparquet` |
| `./renderers/markdown` | `react-markdown` (or `marked` — whichever the impl uses) |
| `./renderers/csv` | (none — pure JS today) |
| `./renderers/notebook` | TBD |
| `./renderers/code` | `shiki` / `highlight.js` (TBD) |

The bundle stays slim for consumers who don't need any of them.

## Migration impact

For consumers already copy-pasting the reference impl:

```diff
- import { ParquetViewer } from './ParquetViewer'
+ import { ParquetViewer } from '@rdub/file-tree/renderers/parquet'
- // 166 lines of copied code
```

No API changes; the prop signature
(`ComponentType<{ store: Store; path: string }>`) is preserved.

## Out of scope

- Building richer parquet renderers (charts, schema-aware faceting,
  etc.). The exported reference stays the canonical "good enough"
  default; consumers who want fancier behavior still write their own.
- Bundling hyparquet *into* the main `@rdub/file-tree` entry. The
  optional-peer + sub-path design keeps the default install slim.

## Consumers

- `ctbk.dev` — copied reference
- `nj-crashes` — copied reference (the original source per the spec
  header in `site/src/ParquetViewer.tsx`)
- `tomat.oa.dev` — copied reference (just landed; this spec was
  filed during that integration)

After the change, all three update to a one-line import.

## Divergences from the v1 draft

- Also moved `json.tsx` (not in the spec's table). Same rationale —
  consumers were copying it; pure JS, no peer dep cost.
- Notebook viewer kept its hard import of `./markdown` rather than
  taking an optional `markdownRenderer` prop. Notebooks are markdown +
  code; a notebook viewer that can't render markdown isn't useful, so
  the coupling earned its keep. Consumers who want notebook get
  `react-markdown` + `remark-gfm` transitively (same as today).
- `highlight.js` lives at `peerDependencies: ^11` rather than left to
  bundler-discovery — it's how the CSS side-effecting import resolves
  in the consumer's tree. Same shape for `hyparquet`, `react-markdown`,
  `remark-gfm` (all flagged `optional: true` in `peerDependenciesMeta`).
- tsup `external` was extended with the four heavy peers so the lib's
  emitted JS leaves the import paths intact (consumer bundler resolves).
