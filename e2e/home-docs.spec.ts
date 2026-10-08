import { expect, test } from '@playwright/test'

/** The landing page is `<FileTree>` over the repo's own `README.md` +
 *  `docs/` (`site/src/fixtures/docs.ts`). */
test.describe('Home (docs browser)', () => {
  test('root lists README + docs and renders the README beneath', async ({ page }) => {
    await page.goto('/')
    const rows = page.locator('table').first().locator('tbody a')
    await expect(rows).toHaveText(['📁 docs/', 'README.md'])
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: '@rdub/file-tree' })).toBeVisible()
  })

  test('README links into docs/ navigate in-app', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Tables', exact: true }).click()
    await expect(page).toHaveURL(/\/docs\/tables\.md$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tables' })).toBeVisible()
  })

  test('docs/ lists every page', async ({ page }) => {
    await page.goto('/docs/')
    await expect(page.locator('table a[href$=".md"]')).toHaveText([
      'architecture.md',
      'downloads.md',
      'exports.md',
      'navigation.md',
      'quick-start.md',
      'stores.md',
      'tables.md',
      'theming.md',
      'tree-sources.md',
      'viewers.md',
    ])
  })

  test('demo routes still win over the docs catch-all', async ({ page }) => {
    await page.goto('/fold')
    await expect(page.getByRole('heading', { name: 'Constant-column fold' })).toBeVisible()
  })
})
