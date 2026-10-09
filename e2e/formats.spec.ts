import { expect, test, type Page } from '@playwright/test'

/** Body rows of the last table on the page, as trimmed cell strings. */
async function bodyRows(page: Page, n: number): Promise<string[][]> {
  const rows = page.locator('table').last().locator('tbody tr')
  // `allTextContents` doesn't wait; the rows land after an async read.
  await expect(rows.nth(n - 1)).toBeVisible()
  const out: string[][] = []
  for (let i = 0; i < n; i++) out.push((await rows.nth(i).locator('td').allTextContents()).map(t => t.trim()))
  return out
}

async function headers(page: Page): Promise<string[]> {
  await expect(page.locator('table').last().locator('thead th').first()).toBeVisible()
  return (await page.locator('table').last().locator('thead th').allTextContents()).map(t => t.trim().replace(/[▲▼⇅↕⚙️\s]+$/u, ''))
}

test.describe('formats (MockDemo)', () => {
  test('JSONL renders as a table, nested values as compact JSON', async ({ page }) => {
    await page.goto('/mock/formats/runs.jsonl')
    await expect(page.getByRole('button', { name: 'Table', pressed: true })).toBeVisible()
    expect(await headers(page)).toEqual(['run', 'step', 'loss', 'ok', 'tags', 'config'])
    expect(await bodyRows(page, 2)).toEqual([
      ['run-a', '500', '3.2', 'true', '["baseline"]', '{"lr":0.0003,"batch":256,"warmup":1000}'],
      ['run-b', '500', '3.0739', 'true', '["sweep","lr-1"]', '{"lr":0.0001,"batch":256,"warmup":1000}'],
    ])
    await page.getByRole('button', { name: 'Text' }).click()
    await expect(page.locator('pre').first()).toContainText('{"run":"run-a","step":500,"loss":3.2,')
  })

  test('.jsonl.gz is decompressed and gets the same table', async ({ page }) => {
    await page.goto('/mock/formats/runs.jsonl.gz')
    await expect(page.getByTestId('decompressed-note')).toHaveText(/^gzip: [\d.]+ KB → [\d.]+ KB$/)
    expect(await bodyRows(page, 1)).toEqual([
      ['run-a', '500', '3.2', 'true', '["baseline"]', '{"lr":0.0003,"batch":256,"warmup":1000}'],
    ])
  })

  test('.csv.zst is decompressed into the CSV viewer', async ({ page }) => {
    await page.goto('/mock/formats/metrics.csv.zst')
    await expect(page.getByTestId('decompressed-note')).toHaveText(/^zstd: /)
    expect(await bodyRows(page, 2)).toEqual([['100', '2.500', '0.400'], ['200', '2.206', '0.425']])
  })

  test('.log.gz reaches the registry viewer for `.log`', async ({ page }) => {
    // MockDemo registers a `LogViewer` for `.log`; the decompressed bytes
    // dispatch on the inner name, so registry entries cover `.log.gz` too.
    await page.goto('/mock/formats/2026-01-08.log.gz')
    await expect(page.getByTestId('decompressed-note')).toHaveText('gzip: 86 B → 63 B')
    await expect(page.locator('pre').last()).toHaveText('INFO Rotated and gzippedINFO Opened in place, no download')
  })

  test('.tar.gz lists members; a member opens in its own viewer', async ({ page }) => {
    await page.goto('/mock/formats/bundle.tar.gz')
    await expect(page.getByRole('link', { name: 'bundle/NOTES' })).toBeVisible()
    const names = (await page.locator('tbody tr td:first-child').allTextContents()).map(t => t.trim())
    expect(names).toEqual([
      'bundle/', 'bundle/README.md', 'bundle/metrics.csv', 'bundle/config.json', 'bundle/NOTES',
    ])
    await page.getByRole('link', { name: 'bundle/metrics.csv' }).click()
    await expect(page).toHaveURL(/\/mock\/formats\/bundle\.tar\.gz!\/bundle\/metrics\.csv$/)
    await expect(page.getByTestId('tar-member-note')).toHaveText(/^member of formats\/bundle\.tar\.gz · /)
    expect(await bodyRows(page, 1)).toEqual([['100', '2.500', '0.400']])
    // The breadcrumb ends archive → member, and the archive crumb goes back.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await crumbs.getByRole('link', { name: 'bundle.tar.gz', exact: true }).click()
    await expect(page).toHaveURL(/\/mock\/formats\/bundle\.tar\.gz$/)
  })

  test(".tar.gz renders its wrapper dir's README; links open sibling members", async ({ page }) => {
    await page.goto('/mock/formats/bundle.tar.gz')
    const readme = page.locator('[data-readme-key="bundle/README.md"]')
    await expect(readme.getByRole('heading', { level: 1 })).toHaveText('bundle')
    await readme.getByRole('link', { name: 'metrics.csv' }).click()
    await expect(page).toHaveURL(/\/mock\/formats\/bundle\.tar\.gz!\/bundle\/metrics\.csv$/)
    expect(await headers(page)).toEqual(['step', 'loss', 'acc'])
  })

  test('a plain-text README.txt renders as text below the dir listing', async ({ page }) => {
    await page.goto('/mock/formats/')
    await expect(page.locator('[data-readme-key="formats/README.txt"] pre')).toHaveText(
      'Formats beyond the classic set.\n\nA plain-text README renders as text below its listing, as on GitHub.\n',
    )
  })

  test('an extension-less tar member that reads as text shows as text', async ({ page }) => {
    await page.goto('/mock/formats/bundle.tar.gz!/bundle/NOTES')
    await expect(page.getByTestId('binary-text')).toHaveText('Extension-less, but reads as text, so it renders as text.\n')
  })

  test('unknown binaries get a hexdump', async ({ page }) => {
    await page.goto('/mock/formats/blob.bin')
    const lines = (await page.getByTestId('hexdump').textContent())!.split('\n')
    expect(lines.length).toBe(40)
    expect([lines[0], lines[16], lines[17], lines[39]]).toEqual([
      '00000000  46 54 42 4c 4f 42 00 01  3a ab ac 26 af 23 1a 71  |FTBLOB..:..&.#.q|',
      '00000100  61 20 70 72 69 6e 74 61  62 6c 65 20 72 75 6e 20  |a printable run |',
      '00000110  69 6e 20 74 68 65 20 6d  69 64 64 6c 65 bc a6 8c  |in the middle...|',
      '00000270  25 a3 70 a0 5d 7a 02 eb  68 4c 08 3f 2b 0d 45 96  |%.p.]z..hL.?+.E.|',
    ])
  })

  test('Makefile is text, not a directory', async ({ page }) => {
    await page.goto('/mock/formats/Makefile')
    await expect(page.locator('pre').last()).toHaveText('demo:\n\tpnpm dev\n\ntest:\n\tpnpm test\n')
  })
})
