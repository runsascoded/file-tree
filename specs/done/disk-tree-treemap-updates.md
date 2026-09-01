# Adopt the new `@disk-tree/react` treemap work

From the disk-tree session (2026-08-31). disk-tree shipped several `<Treemap>` improvements plus a new `squarify` variant that fixes the cramped long-tail slivers in file-tree's OG cards. All of it is in the `@disk-tree/react` `dist` branch — file-tree consumes it by git SHA, so it arrives on the next re-pin.

## 1. Re-pin `@disk-tree/react` to the new dist build

`package.json` currently pins:

```
"@disk-tree/react": "github:runsascoded/disk-tree#6fda6554ffa45d901f2e1dca37c38649862e6a67"
```

Bump to the newest `dist` build (see the exact SHA below — the build that includes `squarifyRemainder`, `edgeContrast`, `dustTexture`, `foldControl`). To always grab the latest yourself:

```bash
git ls-remote https://github.com/runsascoded/disk-tree dist
# → <sha>  refs/heads/dist   — pin that <sha>
```

**New dist SHA to pin: `31e49884fb674b341dac35f2925f851730370643`**

`pnpm add github:runsascoded/disk-tree#<sha>` (or edit `package.json` + `pnpm install`).

## 2. Fix the OG card's long-tail slivers: `squarify` → `squarifyRemainder`

`src/og/card.ts:147` lays the tiles with the plain squarified layout:

```ts
const rects = squarify([...children], x, y, w, h, c => c.size)
```

When one child dominates, the plain layout squeezes the remaining tail into unreadable slivers — which is exactly what shows up as the cramped columns in the OG card. `@disk-tree/react` now exports `squarifyRemainder`, a drop-in with the same signature plus two optional trailing params, which gives the long tail its own legible 2D band (the "side-by-side remainder" layout) instead of slivers:

```ts
import { squarifyRemainder, DEFAULT_PALETTE } from '@disk-tree/react'
// …
const rects = squarifyRemainder([...children], x, y, w, h, c => c.size)
// optional: squarifyRemainder(items, x, y, w, h, getSize, minSide = 7, remainderFrac = 0.14)
//   minSide       — px short-side under which a cell counts as a sliver
//   remainderFrac — min fraction of the long axis given to the tail band
```

It falls back to a plain squarify when no tail is cramped, so it's safe to use unconditionally. Tune `remainderFrac` up if the OG card's tail still reads thin at 1200×630.

## 3. Free wins on re-pin (no code change)

The re-pin also brings these `<Treemap>` improvements to file-tree's interactive views automatically:

- **`edgeContrast`** (default on): shared-tiling cells derive a luminance-contrast half-stroke from their own face, so grey-on-grey fields keep readable borders.
- **`dustTexture`** (default on): the built-in fold tile (`(+n)`) renders as a canvas cross-hatch that tightens toward the lower-right, density scaled by the folded count, with position→item hit-testing on hover — the long tail stays interrogable without a DOM node per item. Only applies when you *don't* pass `mergeSmall`.
- **`foldControl`** (opt-in, `foldControl` prop): a "detail" slider in the chrome bar that scales the fold thresholds live.

None of these change existing behavior unless you opt in (`foldControl`) or were relying on the old flat-grey fold tile.

## Notes

- disk-tree also merged its own `<FileTree>` browse view (the converse integration) — no action needed on file-tree's side; it just uses your `@rdub/file-tree` as pinned.
- When done, move this spec to `specs/done/`.

## As implemented (file-tree side, 2026-09-01)

- **Re-pinned** `@disk-tree/react` → `31e49884` (`0.1.0-dist.9d11926`) in
  `package.json` + `site/package.json`. Typecheck/build/242 tests green.
- **`src/og/card.ts`** now lays the dir-card tiles with
  `squarifyRemainder(children, x, y, w, h, size, 48, 0.24)`. The default
  `minSide=7` didn't fire on the card's short-wide body (~1080×270), where
  a "sliver" is a column tens of px wide — raising `minSide` to 48 and the
  band to `0.24` gives the long tail a legible 2D band. **Verified in
  Chrome** (`/og/`): the root card's tail now reads as labeled tiles
  (`config.yaml 665 B`, `docs 459 B`, …) instead of slivers.
- **Free wins** (`edgeContrast`/`dustTexture`) arrive automatically.

### Follow-up (a disk-tree ask, not done here)
The *interactive* `<Treemap>` still lays out with plain `squarify`
(`Treemap.tsx:611`); `squarifyRemainder` is exported only for direct
callers, and `<Treemap>` exposes no layout-variant prop. So the
dominant-child slivers in the live `/mock?view=tree` map are **unchanged**
by this re-pin. Fixing that needs `<Treemap>` to use `squarifyRemainder`
internally (or expose it via a `tiling`/layout option file-tree can pass).
