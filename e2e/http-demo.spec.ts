/** HttpDemo e2e — exercises the FileTree UI against the `site/worker/`
 *  Cloudflare Worker, which exposes ctbk + nj-crashes via MultiStore.
 *
 *  Asserts navigation invariants, not specific data. The buckets are
 *  live production data; file names shift daily, but the bucket → prefix
 *  → date-shard structure is stable.
 */
import { expect, test } from '@playwright/test'

test.describe('HttpDemo', () => {
  test('virtual root lists demo/, ctbk/, and crashes/', async ({ page }) => {
    await page.goto('/http')

    await expect(page.getByRole('heading', { name: 'R2 browser' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*demo\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*ctbk\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*crashes\/$/ })).toBeVisible()
    await expect(page.getByText('3 entries')).toBeVisible()
  })

  test('navigates into demo/ — Hive-partitioned synthetic fixture', async ({ page }) => {
    await page.goto('/http/demo/')

    // Top-level dirs (alphabetical from R2 delimited list).
    await expect(page.getByRole('link', { name: /^📁\s*data\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*docs\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*logs\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*schemas\/$/ })).toBeVisible()

    // Top-level files (frozen fixture; safe to assert exact names).
    await expect(page.getByRole('link', { name: 'README.md', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'LICENSE', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'config.yaml', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'pipeline.toml', exact: true })).toBeVisible()

    await expect(page.getByText('8 entries')).toBeVisible()
  })

  test('opens demo/README.md as rendered markdown', async ({ page }) => {
    await page.goto('/http/demo/')
    await page.getByRole('link', { name: 'README.md', exact: true }).click()
    await expect(page).toHaveURL(/\/http\/demo\/README\.md$/)

    // Rendered as real DOM, not `<pre>` plaintext.
    await expect(page.getByRole('heading', { name: 'file-tree-demo' })).toBeVisible()
    await expect(page.getByText('Hive-partitioned')).toBeVisible()
  })

  test('renders demo/README.md inline below the demo/ listing', async ({ page }) => {
    await page.goto('/http/demo/')
    const readmePanel = page.locator('.rdub-file-tree-default-readme')
    await expect(readmePanel).toBeVisible()
    await expect(readmePanel.getByRole('heading', { name: 'file-tree-demo' })).toBeVisible()
  })

  test('virtual-root copy explains the bucket layout', async ({ page }) => {
    await page.goto('/http')
    // Aside-only on virtual root; explains the multi-bucket setup.
    await expect(page.getByText('Each top-level entry above is a separate R2 bucket')).toBeVisible()
  })

  test('navigates into a deep Hive partition', async ({ page }) => {
    await page.goto('/http/demo/data/year=2025/month=03/')

    // 5 days/month in the fixture.
    await expect(page.getByRole('link', { name: 'day=01.csv', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'day=05.csv', exact: true })).toBeVisible()
    await expect(page.getByText('5 entries')).toBeVisible()

    // Breadcrumb spans the full Hive path.
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb).toContainText('demo')
    await expect(breadcrumb).toContainText('year=2025')
    await expect(breadcrumb).toContainText('month=03')
  })

  test('navigates ctbk/ → its allowed prefixes', async ({ page }) => {
    await page.goto('/http')
    await page.getByRole('link', { name: /^📁\s*ctbk\/$/ }).click()
    await expect(page).toHaveURL(/\/http\/ctbk\/?$/)

    await expect(page.getByRole('link', { name: /^📁\s*gbfs\/$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^📁\s*avail\/$/ })).toBeVisible()
    await expect(page.getByText('2 entries')).toBeVisible()

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'root', exact: true })).toBeVisible()
    await expect(breadcrumb).toContainText('ctbk')
  })

  test('navigates crashes/ → raw/', async ({ page }) => {
    await page.goto('/http')
    await page.getByRole('link', { name: /^📁\s*crashes\/$/ }).click()
    await expect(page).toHaveURL(/\/http\/crashes\/?$/)

    await expect(page.getByRole('link', { name: /^📁\s*raw\/$/ })).toBeVisible()
    await expect(page.getByText('1 entries')).toBeVisible()
  })

  test('navigates two levels deep into ctbk/gbfs/', async ({ page }) => {
    await page.goto('/http/ctbk/gbfs/')

    // gbfs has multiple sub-prefixes (heartbeat/info/stations/status/avail).
    // Don't assert exact set — just that several dirs are visible.
    const dirLinks = page.getByRole('link', { name: /^📁\s*[a-z]+\/$/ })
    await expect(dirLinks.first()).toBeVisible()
    expect(await dirLinks.count()).toBeGreaterThanOrEqual(2)
  })

  test('breadcrumb hops back to virtual root', async ({ page }) => {
    await page.goto('/http/ctbk/gbfs/')
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await breadcrumb.getByRole('link', { name: 'root', exact: true }).click()
    await expect(page).toHaveURL(/\/http\/?$/)
    await expect(page.getByRole('link', { name: /^📁\s*ctbk\/$/ })).toBeVisible()
  })

  test('shows error for non-existent file path', async ({ page }) => {
    await page.goto('/http/ctbk/gbfs/does-not-exist.json')
    await expect(page.getByText(/^error:/)).toBeVisible()
  })
})
