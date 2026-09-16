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

  test('an un-clipped cell shows no tooltip (nothing to recover)', async ({ page }) => {
    // `README.md` fits its column — no ellipsis, so the demo's tooltip
    // suppresses itself rather than repeating a fully-visible value.
    const readme = page.locator('[data-testid="elide-table"] tbody tr')
      .filter({ hasText: 'README.md' }).locator('td').first()
    expect(await isClipped(readme)).toBe(false)
    await readme.hover()
    await expect(page.getByTestId('elide-rich-tip')).toBeHidden()
  })

  test('native title mode: the zero-dependency floor', async ({ page }) => {
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    const cell = nameCell(page)
    expect(await isClipped(cell)).toBe(true)
    // `onlyWhenClipped` (default): the title is set on hover, and only
    // because the cell actually clips — nothing until a pointer arrives.
    expect(await cell.getAttribute('title')).toBeNull()
    await cell.hover()
    await expect(page.getByTestId('elide-rich-tip')).toBeHidden()  // no floating panel in this mode
    expect(await cell.getAttribute('title')).toBe(FULL_PATH)
    expect(await scrollerScrollable(page)).toBe(false)
  })

  test('native title fires only on clipped cells, unless "Always"', async ({ page }) => {
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    // `README.md` fits its column — no clip, so hovering sets no title.
    const readme = page.locator('[data-testid="elide-table"] tbody tr')
      .filter({ hasText: 'README.md' }).locator('td').first()
    expect(await isClipped(readme)).toBe(false)
    await readme.hover()
    expect(await readme.getAttribute('title')).toBe('')
    // Flip `onlyWhenClipped` off: even a fully-visible value carries a title.
    await page.getByRole('button', { name: 'Always', exact: true }).click()
    expect(await readme.getAttribute('title')).toBe('README.md')
  })

  test('wide mode drops the cap and lets the table x-scroll', async ({ page }) => {
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    await page.getByRole('button', { name: 'Wide (x-scroll)', exact: true }).click()
    const cell = nameCell(page)
    expect(await maxWidth(cell)).toBe('none')
    expect(await isClipped(cell)).toBe(false)
    expect(await scrollerScrollable(page)).toBe(true)
    // Width and tooltip stay independent axes, but nothing clips now, so
    // `onlyWhenClipped` suppresses the native title on hover.
    await cell.hover()
    expect(await cell.getAttribute('title')).toBe('')
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

  test('ellipsis "end" (default): ltr cell, no <bdi> and no split wrapper', async ({ page }) => {
    const cell = nameCell(page)
    expect(await cell.evaluate(el => getComputedStyle(el).direction)).toBe('ltr')
    await expect(cell.locator('bdi')).toHaveCount(0)
  })

  test('ellipsis "start" keeps the tail: an rtl cell wrapping the value in a <bdi>', async ({ page }) => {
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const cell = nameCell(page)
    // The cell flips to rtl so the ellipsis eats the head; a <bdi> keeps the
    // path's own characters in order.
    expect(await cell.evaluate(el => getComputedStyle(el).direction)).toBe('rtl')
    await expect(cell.locator('bdi')).toHaveText(FULL_PATH)
    // The <td> still overflows (the head is clipped), so recovery is unchanged:
    // the rich tooltip still opens.
    expect(await isClipped(cell)).toBe(true)
    await cell.hover()
    await expect(page.getByTestId('elide-rich-tip')).toHaveText(FULL_PATH)
  })

  test('ellipsis "middle": clip-head + fixed 12-char tail, native-titled unconditionally', async ({ page }) => {
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    await page.getByRole('button', { name: 'Middle', exact: true }).click()
    const cell = nameCell(page)
    // Two leaf spans: the clip-ellipsized head, then the verbatim last-12 tail.
    const leaves = await cell.evaluate(el =>
      Array.from(el.querySelectorAll('span')).filter(s => !s.querySelector('span')).map(s => s.textContent))
    expect(leaves).toEqual([FULL_PATH.slice(0, -12), FULL_PATH.slice(-12)])
    // head+tail fit the cell, so the <td> itself never overflows…
    expect(await isClipped(cell)).toBe(false)
    // …yet the hidden middle is recovered: the native title is set regardless
    // of the (non-firing) clip measurement, present before any hover.
    expect(await cell.getAttribute('title')).toBe(FULL_PATH)
  })

  // `resizableColumns` — a separate axis from `elide`: drag the header's
  // right-edge handle to pin a width, double-click it to auto-fit.
  const nameHandle = (page: Page): Locator =>
    page.locator('[data-testid="elide-table"] thead th').first().getByRole('separator')
  const width = (loc: Locator): Promise<number> =>
    loc.evaluate(el => el.getBoundingClientRect().width)

  test('dragging a header handle pins the whole column wider', async ({ page }) => {
    const th = page.locator('[data-testid="elide-table"] thead th').first()
    const w0 = await width(th)
    const box = await nameHandle(page).boundingBox()
    if (!box) throw new Error('no resize handle')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 140, cy, { steps: 5 })
    await page.mouse.up()

    const w1 = await width(th)
    expect(w1).toBeGreaterThan(w0 + 120)
    expect(w1).toBeLessThan(w0 + 160)
    // The body cells track the header — the whole column is pinned, and
    // the pin beats the 30em elide cap (w1 > 480px).
    const cellW = await width(nameCell(page))
    expect(Math.round(cellW)).toBe(Math.round(w1))
  })

  test('double-clicking a handle auto-fits the column (nothing left clipped)', async ({ page }) => {
    // Compact mode clips the long paths to start.
    expect(await isClipped(nameCell(page))).toBe(true)
    await nameHandle(page).dblclick()
    const anyClipped = await page.locator('[data-testid="elide-table"] tbody tr td:first-child')
      .evaluateAll(tds => tds.some(td => td.scrollWidth > td.clientWidth + 1))
    expect(anyClipped).toBe(false)
  })
})
