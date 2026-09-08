import { expect, test, type Locator, type Page } from '@playwright/test'

/** The first row's `name` in the ElideDemo fixture — a checkpoint-shard
 *  path long enough to clip at the 30em cap. Asserted verbatim so a
 *  regression in the full-value recovery fails loudly. */
const FULL_PATH = 'checkpoints/adam-lr1.00e-2-128B/step-042000/shard-00000-of-00016.safetensors'

/** The first body cell of the demo table (the `name` column). */
function nameCell(page: Page): Locator {
  return page.locator('[data-testid="elide-table"] table tbody tr').first().locator('td').first()
}

/** Whether a cell's text is clipped by its column (rendered wider than it
 *  shows), i.e. the ellipsis is doing something. */
function isClipped(cell: Locator): Promise<boolean> {
  return cell.evaluate(el => el.scrollWidth > el.clientWidth + 1)
}

function maxWidth(cell: Locator): Promise<string> {
  return cell.evaluate(el => getComputedStyle(el).maxWidth)
}

/** Whether the viewer's own `overflowX:auto` scroller can scroll — the
 *  observable proof that wide mode lets the table reveal full columns. */
function scrollerScrollable(page: Page): Promise<boolean> {
  return page.locator('[data-testid="elide-table"] div[style*="overflow"]').first()
    .evaluate(el => el.scrollWidth > el.clientWidth + 1)
}

test.describe('ElideDemo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/elide')
    await expect(page.getByRole('heading', { name: 'Elidable cells' })).toBeVisible()
    await expect(nameCell(page)).toHaveText(/^checkpoints\/adam-lr1\.00e-2-128B/)
  })

  test('opens in rich-tooltip mode: a floating panel, not a native title', async ({ page }) => {
    const cell = nameCell(page)
    // The default recovery is the floating-ui render-prop — no native title.
    expect(await isClipped(cell)).toBe(true)
    expect(await cell.getAttribute('title')).toBeNull()
    const tip = page.getByTestId('elide-rich-tip')
    await expect(tip).toBeHidden()

    await cell.hover()
    await expect(tip).toBeVisible()
    await expect(tip).toHaveText(FULL_PATH)
    expect(await tip.getAttribute('role')).toBe('tooltip')
  })

  test('native title mode: the zero-dependency floor', async ({ page }) => {
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    const cell = nameCell(page)
    expect(await isClipped(cell)).toBe(true)
    expect(await cell.getAttribute('title')).toBe(FULL_PATH)
    // No floating panel in this mode, even on hover.
    await cell.hover()
    await expect(page.getByTestId('elide-rich-tip')).toBeHidden()
    expect(await scrollerScrollable(page)).toBe(false)
  })

  test('wide mode drops the cap and lets the table x-scroll', async ({ page }) => {
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    await page.getByRole('button', { name: 'Wide (x-scroll)', exact: true }).click()
    const cell = nameCell(page)
    expect(await maxWidth(cell)).toBe('none')
    expect(await isClipped(cell)).toBe(false)
    expect(await scrollerScrollable(page)).toBe(true)
    // Width and tooltip are independent axes — the title survives the change.
    expect(await cell.getAttribute('title')).toBe(FULL_PATH)
  })

  test('tooltip "none" leaves the value clipped and unrecoverable', async ({ page }) => {
    await page.getByRole('button', { name: 'None', exact: true }).click()
    const cell = nameCell(page)
    expect(await isClipped(cell)).toBe(true)
    expect(await cell.getAttribute('title')).toBeNull()
    // Neither affordance: no native title, and no floating panel on hover.
    await cell.hover()
    await expect(page.getByTestId('elide-rich-tip')).toBeHidden()
  })
})
