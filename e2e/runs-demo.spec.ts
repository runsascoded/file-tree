import { expect, test } from '@playwright/test'

/** `/runs`: `ditto` run modes, `paths` elision and row `groups` on a
 *  `<RowsTable>`, all state in (golfed) URL params. */
test.describe('runs demo', () => {
  const table = (page: import('@playwright/test').Page) => page.getByTestId('runs-table')

  /** The merged cell's value box stays pinned under the header once the
   *  table scrolls partway into the run. */
  async function expectFloats(page: import('@playwright/test').Page) {
    // ahmed's batch: the fixture's first long run.
    const cell = table(page).locator('tbody td[rowspan]', { hasText: 'ahmed@oa.dev' }).first()
    expect(Number(await cell.getAttribute('rowspan'))).toBeGreaterThan(10)
    const head = await table(page).locator('thead').boundingBox()
    // Scroll the table's own scroller until the run's top is 120px above the header.
    await cell.evaluate(td => {
      const sc = td.closest('table')!.parentElement!
      const thead = td.closest('table')!.querySelector('thead')!
      sc.scrollTop += td.getBoundingClientRect().top - thead.getBoundingClientRect().bottom + 120
    })
    const value = await cell.locator('div').boundingBox()
    expect(Math.round(value!.y)).toBe(Math.round(head!.y + head!.height))
  }

  for (const [mode, ch, aria] of [['sticky', 's', null], ['mark', 'm', 'ditto'], ['line', 'l', 'run line'], ['arrow', 'a', 'run arrow']] as const) {
    test(`a ${mode} run is one merged cell whose value floats`, async ({ page }) => {
      await page.goto(`/runs?r=${ch}`)
      if (aria) await expect(table(page).locator('tbody td[rowspan]', { hasText: 'ahmed@oa.dev' }).first().getByLabel(aria).first()).toBeAttached()
      await expectFloats(page)
    })
  }

  test('a path tree needs the page sorted by path; its chip sorts', async ({ page }) => {
    await page.goto('/runs?g=p')
    const chip = table(page).getByRole('button', { name: 'sort for tree' })
    await expect(chip).toHaveAttribute('title', /only when sorted by this column/)
    await expect(table(page).locator('tr[data-group]')).toHaveCount(0)

    await chip.click()
    await expect(page).toHaveURL(/[?&]s=p(&|$)/)
    await expect(chip).toHaveCount(0)
    await expect(table(page).locator('tr[data-group]').first()).toHaveText('▾gs://marin-eu-west4/')
  })

  test('groups nest and collapse; the fold deep-links', async ({ page }) => {
    await page.goto('/runs')
    await page.getByRole('button', { name: 'Path tree' }).click()
    await expect(page).toHaveURL(/[?&]g=p/)
    await expect(page).toHaveURL(/[?&]s=p/)
    const step = table(page).locator('tr[data-group$="dclm-baseline-1b-i30/step-1000/"]')
    await expect(step).toHaveAttribute('data-depth', '3')
    const rowsBefore = await table(page).locator('tbody tr').count()
    await step.getByRole('button', { name: 'collapse' }).click()
    await expect(step).toContainText('· 4 rows')
    await expect(table(page).locator('tbody tr')).toHaveCount(rowsBefore - 4)
    await expect(page).toHaveURL(/[?&]f=[0-9a-z]{4}(&|$)/)

    await page.reload()
    await expect(table(page).locator('tr[data-group$="dclm-baseline-1b-i30/step-1000/"]')).toContainText('· 4 rows')
  })

  test('per-column modes from each header\'s ⚙️ deep-link as `?c=`', async ({ page }) => {
    await page.goto('/runs?c=na')
    await expect(table(page).getByLabel('run arrow').first()).toBeAttached()
    await table(page).getByRole('button', { name: 'owner: runs' }).click()
    await page.getByRole('menuitemradio', { name: 'Line' }).click()
    await expect(page).toHaveURL(/[?&]c=naol(&|$)/)
  })

  test('runGroups heads each run of a column', async ({ page }) => {
    await page.goto('/runs?g=w')
    await expect(table(page).locator('tr[data-group]').first()).toHaveText('▾david@oa.dev')
  })
})
