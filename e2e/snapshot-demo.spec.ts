import { expect, test } from '@playwright/test'

/** `/snapshots`: `snapshotTreeSource` over an in-browser disk-tree
 *  snapshot library (`site/src/fixtures/snapshots.ts`), in a `MockStore`. */
test.describe('snapshot demo', () => {
  const sizeOf = (page: import('@playwright/test').Page, dir: string) =>
    page.getByRole('row').filter({ hasText: new RegExp(`📁\\s*${dir}/`) }).getByRole('cell').nth(1)

  test('dir sizes come from the snapshot, and follow the picked one', async ({ page }) => {
    await page.goto('/snapshots')
    // The newest scan *is* the `/mock` tree, so its precomputed rollups
    // agree with what `walkTreeSource` computes live there (4.8 KB).
    await expect(sizeOf(page, 'docs')).toHaveText('4.8 KB')
    await expect(sizeOf(page, 'logs')).toHaveText('4.4 KB')

    // The older scan: a shorter intro, three logs not yet written.
    await page.getByTestId('snapshot-pick').selectOption('11')
    await expect(sizeOf(page, 'docs')).toHaveText('4.5 KB')
    await expect(sizeOf(page, 'logs')).toHaveText('3.5 KB')
    // The (split-view) map reads the snapshot, not the store: the older
    // scan's since-deleted `tmp/` is a tile there, though the live
    // listing has no such row.
    const tmpTile = page.locator('.dt-treemap-cell', { hasText: 'tmp' })
    await expect(tmpTile.first()).toContainText('4.0 KB')
    await expect(page.getByRole('row').filter({ hasText: /📁\s*tmp\// })).toHaveCount(0)
    await page.getByTestId('snapshot-pick').selectOption('')
    await expect(tmpTile).toHaveCount(0)
  })

  test('diff() between the two scans, at the root', async ({ page }) => {
    await page.goto('/snapshots')
    const rows = page.getByTestId('snapshot-diff').locator('tbody tr')
    await expect(rows).toHaveCount(9)
    const cells = await rows.evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent)))
    expect(cells).toEqual([
      ['README.md', 'unchanged', '267 B', '267 B'],
      ['config.json', 'unchanged', '187 B', '187 B'],
      ['config.yaml', 'unchanged', '665 B', '665 B'],
      ['data/', 'unchanged', '209 B', '209 B'],
      ['docs/', 'changed', '4.5 KB', '4.8 KB'],
      ['formats/', 'unchanged', '10.5 KB', '10.5 KB'],
      ['logs/', 'changed', '3.5 KB', '4.4 KB'],
      ['samples/', 'changed', '78.4 KB', '84.7 KB'],
      ['tmp/', 'removed', '4.0 KB', '—'],
    ])
  })
})
