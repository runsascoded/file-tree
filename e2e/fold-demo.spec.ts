import { expect, test, type Locator, type Page } from '@playwright/test'

const foldTable = (page: Page): Locator => page.locator('[data-testid="fold-table"]')
const headerCells = (page: Page): Locator => foldTable(page).locator('thead th')

test.describe('FoldDemo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fold')
    await expect(page.getByRole('heading', { name: 'Constant-column fold' })).toBeVisible()
  })

  test('folds constant columns out of the grid, stating each once above it', async ({ page }) => {
    // Default on: `bucket` and `region` are constant across the file, so
    // they're dropped from the header…
    await expect(headerCells(page).filter({ hasText: 'bucket' })).toHaveCount(0)
    await expect(headerCells(page).filter({ hasText: 'region' })).toHaveCount(0)
    await expect(headerCells(page).filter({ hasText: 'name' })).toHaveCount(1)
    await expect(headerCells(page).filter({ hasText: 'size' })).toHaveCount(1)
    // …and the value appears exactly once, in the caption, not down a column.
    await expect(foldTable(page).getByText('marin-us-east5')).toHaveCount(1)
    await expect(foldTable(page).getByText('us-east5', { exact: true })).toHaveCount(1)
  })

  test('unfolding restores the constant columns to the grid', async ({ page }) => {
    await page.getByRole('checkbox').uncheck()
    await expect(headerCells(page).filter({ hasText: 'bucket' })).toHaveCount(1)
    await expect(headerCells(page).filter({ hasText: 'region' })).toHaveCount(1)
    // The caption is gone; the constant value now repeats down its column,
    // one per row (8 rows).
    await expect(foldTable(page).getByText('marin-us-east5')).toHaveCount(8)
  })
})
