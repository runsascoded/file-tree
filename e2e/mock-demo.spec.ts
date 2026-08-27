import { expect, test, type Page } from '@playwright/test'

/** One row of the parquet table as its cell strings. `which` picks the
 *  header row or a 0-indexed body row. */
async function parquetRow(page: Page, which: 'header' | number): Promise<string[]> {
  const table = page.locator('table').last()
  const row = which === 'header' ? table.locator('thead tr') : table.locator('tbody tr').nth(which)
  return (await row.locator(which === 'header' ? 'th' : 'td').allTextContents()).map(t => t.trim())
}

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
    await expect(page.getByRole('link', { name: /^📁\s*regions\/$/ })).toBeVisible()
    await expect(page.getByText('3 entries')).toBeVisible()

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

  test('renders a parquet file, with inferred timestamps and column hooks', async ({ page }) => {
    await page.goto('/mock/samples/events.parquet')

    await expect(page.getByText('240 rows · 6 columns · 1 row group · 5.4 KB')).toBeVisible()

    // `region` picks up `renderHeader` — and the hook is gated on `path`,
    // so this is also the assertion that `path` reaches the ctx.
    expect(await parquetRow(page, 'header')).toEqual([
      'dt', 'event_ts', 'recorded', 'id', 'region (hooked)', 'value',
    ])

    // `dt` / `event_ts` are bare INT64s read as epochs; `recorded` is
    // annotated. `id` stays a *number* — it's a bare INT64 sitting
    // inside the epoch window, and only the name gate keeps it from
    // being read as a date. Its `◆` and the `$` on `value` come from
    // the demo's `renderCell`, so this row pins the hook too.
    expect(await parquetRow(page, 0)).toEqual([
      '2026-04-25 00:00Z', '2026-04-25 00:00:00Z', '2026-04-25 00:00:00Z',
      '◆ 1777075200000', 'nyc', '$0.00',
    ])
  })

  test('a parquet cell can link to another file in the tree', async ({ page }) => {
    await page.goto('/mock/samples/events.parquet')

    // `renderCell` turns `region` into an FK: the first row is `nyc`,
    // and the link resolves within the same `<FileTree>` route rather
    // than reloading the app.
    const cell = page.locator('table').last().locator('tbody tr').first().locator('td').nth(4)
    await cell.getByRole('link').click()

    await expect(page).toHaveURL(/\/mock\/docs\/regions\/nyc\.md$/)
    await expect(page.getByRole('heading', { name: 'NYC' })).toBeVisible()
  })

  test('decorates directory-listing cells', async ({ page }) => {
    await page.goto('/mock/data/2024')

    // `renderCell` (dir listing) appends a label derived from the key,
    // wrapping the node the listing would have rendered — so the link
    // itself still reads as the bare filename.
    const names = await page.locator('tbody tr td:first-child').allTextContents()
    expect(names.map(t => t.replace(/\s+/g, ' ').trim())).toEqual([
      'q1.csv Q1 2024',
      'q2.csv Q2 2024',
    ])
    // The label is appended *around* the default node, so the link is
    // still just the filename — decorating, not replacing.
    await expect(page.getByRole('link', { name: 'q1.csv', exact: true })).toBeVisible()
  })

  test('shows error for non-existent path', async ({ page }) => {
    await page.goto('/mock/missing.md')
    await expect(page.getByText(/^error:.*NotFoundError/)).toBeVisible()
  })
})
