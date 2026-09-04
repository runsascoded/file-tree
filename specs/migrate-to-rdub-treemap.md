# Migrate the treemap dep: `@disk-tree/react` → `@rdub/treemap`

disk-tree split its widget package: the **treemap core** (which is all file-tree
uses) now ships as **`@rdub/treemap`** from its own dist branch, and
`@disk-tree/react` is now just disk-flavored widgets (StalenessScatter,
AgeHistograms, TimeSeries) that re-export the core. Nothing file-tree imports
moved *out* of reach — it's a rename + re-pin — and it unblocks the `ring` +
`onCellHover` work.

The old pin (`@disk-tree/react#b7d3f71`) still resolves (that branch was renamed
`dist` → `dist/react` but SHA pins are immutable), so there's no rush; do this
when picking up the brushing integration below.

## 1. Dependency rename + re-pin

`@disk-tree/react` appears in **three** places in `package.json` — map each to
`@rdub/treemap`:

| section | before | after |
|---|---|---|
| `peerDependencies` | `"@disk-tree/react": "*"` | `"@rdub/treemap": "*"` |
| `peerDependenciesMeta` | `"@disk-tree/react": { "optional": true }` | `"@rdub/treemap": { "optional": true }` |
| `devDependencies` | `"@disk-tree/react": "github:runsascoded/disk-tree#b7d3f71…"` | `"@rdub/treemap": "github:runsascoded/disk-tree#b047e3754dd1d49dc8bfcbc2d45998b10b2753fc"` |

- The pin is the head of disk-tree's new **`dist/treemap`** branch:
  `b047e3754dd1d49dc8bfcbc2d45998b10b2753fc` (packs `@rdub/treemap@0.1.0-dist.25f3dc0`,
  `dependencies: {}`, exports `.` / `./styles.css` / `./voronoi` — self-contained).
- Same repo, so the `github:runsascoded/disk-tree#<sha>` form is unchanged; only
  the SHA and the resolved package name differ.
- Then `pnpm install`.

**BIC for file-tree's own consumers:** the optional peer's *name* changes, so an
app wiring `<TreeMapView>` must now provide `@rdub/treemap` instead of
`@disk-tree/react`. Note it in file-tree's changelog/README.

## 2. Import rename

Two value imports (the rest are doc comments — update those too for accuracy):

- `src/renderers/treemap.tsx:28`
  `import { Treemap, type CellStyle } from '@disk-tree/react'` → `from '@rdub/treemap'`
- `src/og/card.ts:21`
  `import { squarifyRemainder, DEFAULT_PALETTE } from '@disk-tree/react'` → `from '@rdub/treemap'`

All four names (`Treemap`, `CellStyle`, `squarifyRemainder`, `DEFAULT_PALETTE`)
are core exports of `@rdub/treemap`. Comment mentions to sweep:
`src/renderers/treemap.tsx:1,10,13`, `src/og/card.ts:8,17,58`,
`src/react/FileTree.tsx:55,142`.

## 3. Land the brushing integration (now unblocked)

The new pin carries both treemap features file-tree was waiting on:

- **`onCellHover(node, path)`** — the outward hover signal (disk-tree
  `78f1fc2`). Wire the remaining **`onHoverPath`** (map→table hover) so brushing
  is bidirectional.
- **`CellStyle.ring`** — a per-cell emphasis border honored in **both** tiling
  modes (spec: disk-tree `specs/done/treemap-cell-brush-style.md`). So:
  - **Drop the workarounds**: remove the forced `tiling="shared"` and the
    `borderWidth` bump; return the map to default `gaps` (keep the gap gutters).
  - `emphasize()` returns `ring: { color, width }` (white for hovered, a thicker
    blue for selected) alongside the existing `bg` fill + `ink` — border becomes
    the primary cue, fill secondary, at any tile density in either mode.
    `ring` is `string | { color; width?; inset? }` (default width 2, inset true);
    it stacks over the structural gutter and follows the cell's corner radius.

## Verify

- `pnpm typecheck` + `pnpm build`, and the split view at
  `/mock/samples?view=split` (or `/mock/logs`): hovering a row rings the matching
  map cell (and vice-versa) in the default `gaps` tiling — no forced `shared`.
- Once green, this spec → `specs/done/`.
