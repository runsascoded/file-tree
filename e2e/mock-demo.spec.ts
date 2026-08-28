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

  test('expands to a chosen depth', async ({ page }) => {
    await page.goto('/mock/config.json')
    // All-or-nothing is the wrong shape for a big document: "expand" is
    // unusable and "collapse" hides everything, while the level you
    // want is usually 2 or 3.
    await page.getByTitle('Expand to depth 2').click()
    expect(await jsonTree(page)).toBe(
      '▾{"version": "0.0.1","demo": true,"server": ▾{"host": "localhost","tls": ▸{ 2 keys }}}',
    )
    await page.getByTitle('Expand to depth 3').click()
    expect(await jsonTree(page)).toBe(
      '▾{"version": "0.0.1","demo": true,"server": ▾{"host": "localhost",'
      + '"tls": ▾{"enabled": false,"ciphers": ▸[ 2 items ]}}}',
    )
  })

  test('renders yaml as a tree, not highlighted text', async ({ page }) => {
    await page.goto('/mock/config.yaml')
    // YAML routes through the JSON tree via the registry, so it gets the
    // same collapsible nodes, search, depth controls and jq — the parser
    // is lazily imported, hence the retrying assertion.
    await expect(page.locator('.rdub-file-tree-json-tree')).toBeVisible()

    // Anchors/aliases are resolved (`servers` carries the merged
    // `defaults`), block scalars keep their newlines, and — the point —
    // comments survive. `yaml.parse()` drops them, so the renderer walks
    // the document and puts them back via `renderKey`.
    expect(await jsonTree(page)).toBe(
      '▾{'
      + '# Demo config — the tree viewer parses this, so YAML gets the same collapsible nodes,'
      + ' search, depth controls and jq as JSON. — inline comments attach to the line above them'
      + '"version": "0.0.1",'
      + '"demo": true,'
      + '# Anchors let a block be named once and reused. `defaults` is the anchor;'
      + ' the two servers below alias it.'
      + '"defaults": ▸{ 2 keys },'
      + '"servers": ▸[ 2 items ],'
      + '# Block scalars keep newlines (|) or fold them (>).'
      + '"notes": "A literal block. Newlines are preserved. ",'
      + '# a native date, not a string'
      + '"released": "2026-04-25",'
      + '"sources": ▸[ 2 items ]}',
    )

    // Depth 2 resolves the anchor: `defaults` is `&defaults`, and both
    // `servers` entries merged it (the second has 3 keys, having
    // overridden `timeout`).
    await page.getByTitle('Expand to depth 2').click()
    const at2 = await jsonTree(page)
    // Both servers have 3 keys: `<<: *defaults` merged `retries` and
    // `timeout` in, and the second overrode `timeout`. Merge keys are a
    // YAML 1.1 feature, so this needs `merge: true` — without it `<<`
    // stays a literal key and the anchor is *not* applied.
    expect(at2.slice(at2.indexOf('"defaults"'), at2.indexOf('# Block'))).toBe(
      '"defaults": ▾{"retries": 3,"timeout": 30},"servers": ▾[▸{ 3 keys },▸{ 3 keys }],',
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

    await expect(page.getByText('240 rows · 7 columns · 1 row group · 6.4 KB')).toBeVisible()

    // Header names, with the per-column raw/formatted toggle stripped —
    // `renderHeader` is gated on `path`, so this is also the assertion
    // that `path` reaches the ctx.
    expect((await parquetRow(page, 'header')).map(h => h.replace(/⌗|raw$/, '').trim())).toEqual([
      'dt', 'event_ts', 'recorded', 'id', 'region', 's2_cell', 'value',
    ])

    // `dt` / `event_ts` are bare INT64s read as epochs; `recorded` is
    // annotated. `id` stays a *number* — it's a bare INT64 sitting
    // inside the epoch window, and only the name gate keeps it from
    // being read as a date. Its `◆` and the `$` on `value` come from
    // the demo's `renderCell`, so this row pins the hook too.
    expect(await parquetRow(page, 0)).toEqual([
      '2026-04-25 00:00Z', '2026-04-25 00:00:00Z', '2026-04-25 00:00:00Z',
      '◆ 1777075200000', 'nyc', '89c259c413', '$0.00',
    ])
  })

  test('the raw/formatted toggle survives paging, and does not remount', async ({ page }) => {
    await page.goto('/mock/samples/events.parquet')
    const pager = page.getByText(/^rows /)

    await page.getByRole('button', { name: '\u203a', exact: true }).first().click()
    await expect(pager).toHaveText('rows 100\u2013200 / 240 \u00b7 page 2/3 of RG')

    // `dt` renders as an inferred epoch; the toggle puts the integer back.
    await page.getByTitle('show raw dt').click()
    expect((await parquetRow(page, 0))[0]).toBe('1777420800000')

    // The point of `parquetOptions`: options arrive as props on a stable
    // component type, so flipping one re-renders the table rather than
    // remounting it. A remount would reset the pager to page 1/3 and
    // drop the row-group cache.
    await expect(pager).toHaveText('rows 100\u2013200 / 240 \u00b7 page 2/3 of RG')

    // Only the toggled column changes — `event_ts` is still formatted.
    expect((await parquetRow(page, 0))[1]).toBe('2026-04-25 01:01:40Z')
  })

  test('an s2_cell renders a locator preview, portalled out of the table', async ({ page }) => {
    await page.goto('/mock/samples/events.parquet')

    // A cell can be a whole widget: the token is unreadable alone, so
    // hovering draws its footprint over the region's points. No tiles —
    // the SVG is built from the fixture, so this asserts no network.
    await page.locator('table').last().locator('tbody tr').first()
      .locator('td').nth(5).getByText('89c259c4').hover()

    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    expect((await tip.innerText()).split('\n')).toEqual([
      'token', '89c259c4', 'level', 'L13', '~edge', '1.1 km',
    ])
    await expect(tip.getByRole('img', { name: 'location of 89c259c4' })).toBeVisible()

    // Portalled: an absolutely-positioned child would be clipped by the
    // table's scroll container, so the preview must not live inside it.
    expect(await tip.evaluate(el => el.closest('table') === null)).toBe(true)
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

  test('the same renderCell serves the csv viewer', async ({ page }) => {
    await page.goto('/mock/data/2024/q1.csv')

    // `renderMoney` is written once against the format-neutral
    // `TableCellCtx` and passed to both viewers — the `value` column
    // formats here exactly as it does in the parquet table, even though
    // CSV hands it over as a string.
    const rows = page.locator('tbody tr')
    expect(await rows.first().locator('td').allTextContents()).toEqual(['2024-01-01', '$100.00'])
    expect(await rows.nth(1).locator('td').allTextContents()).toEqual(['2024-02-01', '$150.00'])
  })

  test('a consumer-registered viewer handles a format the library lacks', async ({ page }) => {
    await page.goto('/mock/logs/2026-01-01.log')

    // `.log` has no `kind` in `parsePath` and no `*Renderer` prop — it
    // reaches the page only through `<FileTree viewers>`, lazily. Without
    // the registry this renders as plain `<pre>` text, so the split
    // level/message structure is what proves the viewer ran.
    // Retrying form, deliberately: the viewer is behind `React.lazy`
    // *and* an async read, so a one-shot read races the chunk.
    const lines = page.locator('pre > div')
    await expect(lines).toHaveText([
      'INFO System started',
      'DEBUG Connected to db',
    ])
    await expect(lines.first().locator('span')).toHaveText('INFO')
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

  test('jq filters the parsed document', async ({ page }) => {
    // Regression: `jq.wasm` resolved against the *page* URL, so it
    // 404'd into the SPA fallback on every route and jq never worked at
    // all. Nothing asserted it, so it stayed broken.
    await page.goto('/mock/config.json?jq=.server.tls')
    // Retrying: jq is a ~2.8 MB wasm module fetched on first use.
    await expect.poll(() => jsonTree(page)).toBe('▾{"enabled": false,"ciphers": ▸[ 2 items ]}')
  })

  test('jq works on yaml, over the merged document', async ({ page }) => {
    // Second regression: the jq effect ran before the *async* YAML parse
    // resolved and never retried, so every YAML filter failed with
    // "Unsupported data type". Both `servers` show 3 keys because
    // `<<: *defaults` merged — which needs `merge: true`, off by default
    // in YAML 1.2.
    await page.goto('/mock/config.yaml?jq=.servers')
    await expect.poll(() => jsonTree(page)).toBe('▾[▸{ 3 keys },▸{ 3 keys }]')
  })

  test('search opens only what it needs, and closes as it narrows', async ({ page }) => {
    await page.goto('/mock/config.json')
    const search = page.getByRole('searchbox')

    // A one-character prefix matches deep in the tree...
    await search.fill('e')
    await expect.poll(() => jsonTree(page)).toBe(
      // "e" reaches "enabled", "ciphers" and "aes" — so the whole
      // spine down to the ciphers array opens.
      '▾{"version": "0.0.1","demo": true,"server": ▾{"host": "localhost",'
      + '"tls": ▾{"enabled": false,"ciphers": ▾["aes","chacha"]}}}',
    )

    // ...and narrowing has to *undo* that. One-way opening leaves
    // everything the early prefix touched hanging open.
    await search.fill('demo')
    await expect.poll(() => jsonTree(page)).toBe(
      '▾{"version": "0.0.1","demo": true,"server": ▸{ 2 keys }}',
    )
  })

  test('shows error for non-existent path', async ({ page }) => {
    await page.goto('/mock/missing.md')
    await expect(page.getByText(/^error:.*NotFoundError/)).toBeVisible()
  })
})
