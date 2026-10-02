import { expect, test } from '@playwright/test'

/** `/runs`: `ditto` run modes and `paths` elision on a `<RowsTable>`. */
test.describe('runs demo', () => {
  const table = (page: import('@playwright/test').Page) => page.getByTestId('runs-table')

  test('a sticky run is one cell, whose value floats under the header as the table scrolls', async ({ page }) => {
    await page.goto('/runs')
    const first = table(page).locator('tbody td[rowspan]').first()
    await expect(first).toHaveText('david@oa.dev')
    const rowSpan = Number(await first.getAttribute('rowspan'))
    expect(rowSpan).toBeGreaterThan(5)

    // Scroll the table's own scroller partway into the run: the value stays
    // pinned just under the sticky header.
    const scroller = table(page).locator('table').locator('..')
    const head = await table(page).locator('thead').boundingBox()
    await scroller.evaluate(el => { el.scrollTop = 120 })
    const value = await first.locator('div').boundingBox()
    expect(Math.round(value!.y)).toBe(Math.round(head!.y + head!.height))
  })

  test('tree groups rows under their parent only when sorted by path', async ({ page }) => {
    // Deep-linked unsorted: tree falls back to dim, and the header says so.
    await page.goto('/runs?p=tree')
    const chip = table(page).getByRole('button', { name: 'sort for tree' })
    await expect(chip).toHaveAttribute('title', /only when sorted by this column/)
    await expect(table(page).locator('tr[data-parent]')).toHaveCount(0)

    await chip.click()
    await expect(page).toHaveURL(/[?&]sort=path(&|$)/)
    await expect(chip).toHaveCount(0)
    await expect(table(page).locator('tr[data-parent]').first()).toHaveText('gs://marin-eu-west4/checkpoints/')
  })

  test('picking Tree sorts by path; per-column modes deep-link', async ({ page }) => {
    await page.goto('/runs?rc=note:arrow')
    await expect(table(page).locator('[aria-label="run end"]').first()).toBeVisible()
    await page.getByRole('button', { name: 'Tree' }).click()
    await expect(page).toHaveURL(/[?&]p=tree.*sort=path|sort=path.*p=tree/)
    await expect(table(page).locator('tr[data-parent]').first()).toHaveText('gs://marin-eu-west4/checkpoints/')

    // A column's ⚙️ overrides the page-wide mode, into `?rc=`.
    await table(page).getByRole('button', { name: 'owner: runs' }).click()
    await page.getByRole('menuitemradio', { name: 'Line' }).click()
    await expect(page).toHaveURL(/rc=note(:|%3A)arrow(,|%2C)owner(:|%3A)line/)
  })
})
