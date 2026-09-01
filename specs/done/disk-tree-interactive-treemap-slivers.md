# Fix the interactive treemap slivers: pass `remainderTail`

Follow-up to `specs/done/disk-tree-treemap-updates.md`. That change fixed the OG **card**'s long tail (which calls `squarifyRemainder` directly). This one fixes the **interactive** `<Treemap>` — the dominant-child slivers you screenshotted at `/mock?view=tree` (`samples` dominant, the small dirs as two thin full-height strips), which the OG re-pin left unchanged.

disk-tree added a `remainderTail` prop to `<Treemap>` (I asked; they did it). It swaps the internal layout for `squarifyRemainder` at every level, so a dominated tail gets its own legible side-by-side band instead of slivers. Verified live in disk-tree's widget playground: an 8-child tail under a 98%-dominant parent renders as a labeled vertical band (each child hoverable) instead of invisible strips.

## Two steps

### 1. Re-pin `@disk-tree/react` to the dist build that has `remainderTail`

You're currently on `31e49884…` (the one with `squarifyRemainder` exported). Bump to the newer `dist` build that also has the `<Treemap remainderTail>` prop:

**Pin: `0c486606d377581411f4bf7590af77fecfa34d36`**

```bash
git ls-remote https://github.com/runsascoded/disk-tree dist   # sanity-check it's still HEAD
pnpm add github:runsascoded/disk-tree#0c486606d377581411f4bf7590af77fecfa34d36
```

### 2. Pass `remainderTail` in the wrapper

`src/renderers/treemap.tsx:95`:

```tsx
<Treemap<TreeNode> root={root} formatSize={fmtSize} remainderTail {...accessors} />
```

That's it — the dominant-child slivers in `/mock?view=tree` become a readable band. Options:
- `remainderTail` (bool) uses the default band fraction (0.14 of the long axis).
- `remainderTail={0.2}` (number) widens the band if the tail still reads thin at your sizes — worth trying, since the interactive map is bigger than the 1200×630 card.

## Notes

- Trade-off (documented on the prop): the tail draws a little larger than its exact area share, the dominant a little smaller — legibility over strict area-proportionality. That's the intended behavior for this case.
- The re-pin also carries the other `<Treemap>` improvements from the prior spec (`edgeContrast`, `dustTexture`, `foldControl`) if you hadn't already picked them up.
- CIC `/mock?view=tree` before/after to confirm, then move this to `specs/done/`.

## As implemented (file-tree side, 2026-09-01)

- **Re-pinned** `@disk-tree/react` → `0c486606` (`0.1.0-dist.e758294`),
  root + site.
- **`src/renderers/treemap.tsx`** passes `remainderTail={0.2}` **and
  `minCellSide={24}`** to `<Treemap>`. The default sliver cutoff (7px) is
  below the mock's ~10–15px tail columns, so `remainderTail` alone fell
  back to plain squarify (no change). Raising `minCellSide` catches them;
  with `remainderTail` on the widget skips its own thin-fold, so this only
  widens the band — it hides nothing. **Verified in Chrome**
  (`/mock?view=tree`): the tail (`data`/`docs`/`logs`/`config.*`/`README.md`)
  now renders as a labeled right-hand band instead of full-height slivers.
