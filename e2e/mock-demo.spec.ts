import { expect, test, type Page } from '@playwright/test'

/** Whole JSON tree as one normalized line — carets included, so
 *  open/closed state is part of the assertion. Collapsed containers
 *  show as `{ N keys }` / `[ N items ]`. */
async function jsonTree(page: Page): Promise<string> {
  const text = await page.locator('.rdub-file-tree-json-tree').textContent()
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

test.describe('MockDemo', () => {
  test('lists root entries', async ({ page }) => {
    await page.goto('/mock')

    await expect(page.getByRole('heading', { name: 'MockStore demo' })).toBeVisible()

    await expect(page.getByRole('link', { name: 'README.md', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'config.json', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'config.yaml', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*docs\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*data\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*logs\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*samples\/$/ })).toBeVisible()

    await expect(page.getByText('7 entries')).toBeVisible()
  })

  test('navigates into a directory', async ({ page }) => {
    await page.goto('/mock')
    await page.getByRole('link', { name: /^📁\s*docs\/$/ }).click()
    await expect(page).toHaveURL(/\/mock\/docs\/?$/)

    await expect(page.getByRole('link', { name: 'intro.md', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*guide\/$/ })).toBeVisible()
    await expect(page.getByText('2 entries')).toBeVisible()

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'root', exact: true })).toBeVisible()
    await expect(breadcrumb).toContainText('docs')
  })

  test('filters entries', async ({ page }) => {
    await page.goto('/mock')
    await expect(page.getByText('7 entries')).toBeVisible()

    const filter = page.getByRole('searchbox')
    await filter.fill('config')

    await expect(page.getByRole('link', { name: 'config.json', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'config.yaml', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'README.md', exact: true })).toHaveCount(0)
    await expect(page.getByText('2 / 7')).toBeVisible()

    await page.getByRole('button', { name: 'clear' }).click()
    await expect(filter).toHaveValue('')
    await expect(page.getByText('7 entries')).toBeVisible()
    await expect(page.getByRole('link', { name: 'README.md', exact: true })).toBeVisible()
  })

  test('opens README.md as rendered markdown', async ({ page }) => {
    await page.goto('/mock')
    await page.getByRole('link', { name: 'README.md', exact: true }).click()
    await expect(page).toHaveURL(/\/mock\/README\.md$/)

    // markdownRenderer (react-markdown) turns the README into real
    // headings + inline code, not a `<pre>` plaintext blob.
    await expect(page.getByRole('heading', { name: '@rdub/file-tree demo' })).toBeVisible()
    await expect(page.locator('code').filter({ hasText: 'MockStore' }).first()).toBeVisible()
  })

  test('renders a README.md inline below the directory listing', async ({ page }) => {
    await page.goto('/mock')
    // README is in the root listing AND rendered as a panel below.
    const readmePanel = page.locator('.rdub-file-tree-default-readme')
    await expect(readmePanel).toBeVisible()
    await expect(readmePanel.getByRole('heading', { name: '@rdub/file-tree demo' })).toBeVisible()
  })

  test('opens config.json with only the root expanded', async ({ page }) => {
    await page.goto('/mock/config.json')
    // `initialOpenDepth` defaults to 1: root open, every child closed.
    expect(await jsonTree(page)).toBe(
      '▾{"version": "0.0.1","demo": true,"server": ▸{ 2 keys }}',
    )
  })

  test('expand-all reaches every level in one click', async ({ page }) => {
    await page.goto('/mock/config.json')
    await page.getByTitle('Expand all').click()
    // Regression: nodes that mount *because of* the expand used to
    // ignore it, so this took one click per level of nesting.
    expect(await jsonTree(page)).toBe(
      '▾{"version": "0.0.1","demo": true,"server": ▾{"host": "localhost",'
      + '"tls": ▾{"enabled": false,"ciphers": ▾["aes","chacha"]}}}',
    )
  })

  test('collapse-all closes the root', async ({ page }) => {
    await page.goto('/mock/config.json')
    await page.getByTitle('Collapse all').click()
    expect(await jsonTree(page)).toBe('▸{ 3 keys }')
  })

  test('shows error for non-existent path', async ({ page }) => {
    await page.goto('/mock/missing.md')
    await expect(page.getByText(/^error:.*NotFoundError/)).toBeVisible()
  })
})
