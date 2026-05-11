#!/usr/bin/env node
/** Populate `file-tree-demo` R2 bucket with a synthetic real-shaped fixture.
 *
 *  Idempotent: re-running overwrites existing keys. Call from
 *  `site/worker/`:
 *      node scripts/populate-demo-bucket.mjs            # all files
 *      node scripts/populate-demo-bucket.mjs --dry-run  # print plan only
 *
 *  Fixture is ~44 small files (<5 KB total) covering:
 *    - top-level mix (README/LICENSE/config/pipeline)
 *    - Hive-partitioned data tree (`data/year=YYYY/month=MM/day=DD.csv`)
 *    - docs hierarchy + a couple of log + schema files
 *  Goal: stress dir grouping, deep nesting, multi-bucket browsing,
 *  and `parsePath`'s `.csv`/`.md`/`.json`/`.yaml`/`.toml` text dispatch.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetWriteBuffer } from 'hyparquet-writer'

const BUCKET = 'file-tree-demo'
const dryRun = process.argv.includes('--dry-run')

/** Generate fixture as a list of [key, content, contentType?] triples. */
function buildFixture() {
  const out = []

  out.push(['README.md', `# file-tree-demo

Synthetic, frozen fixture for the [\`@rdub/file-tree\`][1] demo site.

## Layout

- \`data/year=YYYY/month=MM/day=DD.csv\` — Hive-partitioned daily metrics
- \`docs/\` — markdown documentation tree
- \`logs/\` — monthly logs
- \`schemas/\` — JSON schema files

This bucket is read-only via the [HttpDemo][2] worker; writes happen
only through \`scripts/populate-demo-bucket.mjs\`.

[1]: https://github.com/runsascoded/file-tree
[2]: https://localhost:8731/http
`, 'text/markdown'])

  out.push(['LICENSE', `MIT License

Copyright (c) 2026 Ryan Williams

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`, 'text/plain'])

  out.push(['config.yaml', `version: 1
demo: true
partitioning:
  layout: hive
  keys: [year, month, day]
sources:
  - name: synthetic
    rows_per_day: 24
`, 'application/yaml'])

  out.push(['pipeline.toml', `[meta]
name = "file-tree-demo"
version = "1.0.0"

[stages]
ingest = { schema = "schemas/dimension.json" }
emit = { schema = "schemas/metric.json" }
`, 'application/toml'])

  // Hive-partitioned data: 2024 (Jan, Feb) + 2025 (Jan-Apr), 5 days/month.
  const partitions = [
    [2024, 1], [2024, 2],
    [2025, 1], [2025, 2], [2025, 3], [2025, 4],
  ]
  for (const [year, month] of partitions) {
    for (let day = 1; day <= 5; day++) {
      const mm = String(month).padStart(2, '0')
      const dd = String(day).padStart(2, '0')
      const key = `data/year=${year}/month=${mm}/day=${dd}.csv`
      const lines = ['hour,region,value']
      for (let h = 0; h < 24; h++) {
        const region = ['nyc', 'sfo', 'lax'][h % 3]
        const v = (year * 100 + month) * 1000 + day * 100 + h
        lines.push(`${String(h).padStart(2, '0')},${region},${v}`)
      }
      out.push([key, lines.join('\n') + '\n', 'text/csv'])
    }
  }

  out.push(['docs/intro.md', `# Introduction

\`@rdub/file-tree\` is a storage-agnostic file/directory tree browser.
This demo bucket exercises the React UI against a realistic shape.
`, 'text/markdown'])

  out.push(['docs/guide/setup.md', `# Setup

1. Add the package: \`pnpm add @rdub/file-tree\`
2. Plug a \`Store\` (\`R2Store\`, \`HttpStore\`, \`MockStore\`, …) into \`<FileTree>\`
3. Mount the route: \`<Route path="/files/*" element={<FileTree …/>}/>\`
`, 'text/markdown'])

  out.push(['docs/guide/usage.md', `# Usage

\`<FileTree store={store} routeBase="/files" />\` reads the URL splat after
\`routeBase\` and dispatches to a directory listing or text/binary view.
`, 'text/markdown'])

  out.push(['docs/guide/advanced.md', `# Advanced

- \`extraTexty\`: register additional file extensions for text preview.
- \`rootPrefix\`: scope the browser to a sub-tree of the store.
- \`MultiStore\`: splice N stores into one virtual namespace.
`, 'text/markdown'])

  out.push(['docs/api/reference.md', `# API reference

## \`Store\`

\`\`\`ts
interface Store {
  list(prefix: string, opts?: ListOptions): Promise<ListResult>
  get(path: string, range?: Range): Promise<GetResult>
  capabilities?: { range: boolean }
}
\`\`\`
`, 'text/markdown'])

  out.push(['logs/2025-01.log', logBlock('2025-01-01', 50), 'text/plain'])
  out.push(['logs/2025-02.log', logBlock('2025-02-01', 50), 'text/plain'])
  out.push(['logs/2025-03.log', logBlock('2025-03-01', 50), 'text/plain'])

  out.push(['schemas/metric.json', JSON.stringify({
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Metric',
    type: 'object',
    properties: {
      hour: { type: 'integer', minimum: 0, maximum: 23 },
      region: { type: 'string', enum: ['nyc', 'sfo', 'lax'] },
      value: { type: 'number' },
    },
    required: ['hour', 'region', 'value'],
  }, null, 2) + '\n', 'application/json'])

  out.push(['schemas/dimension.json', JSON.stringify({
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Dimension',
    type: 'object',
    properties: {
      year: { type: 'integer' },
      month: { type: 'integer', minimum: 1, maximum: 12 },
      day: { type: 'integer', minimum: 1, maximum: 31 },
    },
    required: ['year', 'month', 'day'],
  }, null, 2) + '\n', 'application/json'])

  // A synthetic parquet to exercise the `parquetRenderer` slot.
  // 1000 rows, same hour/region/value shape as the CSV partitions but
  // with deterministic values so the file content is byte-stable across
  // re-runs.
  const N = 1000
  const hours = new Int32Array(N)
  const regions = new Array(N)
  const values = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    hours[i] = i % 24
    regions[i] = ['nyc', 'sfo', 'lax'][i % 3]
    values[i] = Math.round(((i * 37) % 1000) * 100) / 100
  }
  const parquetBuf = parquetWriteBuffer({
    columnData: [
      { name: 'hour', data: hours, type: 'INT32' },
      { name: 'region', data: regions, type: 'STRING' },
      { name: 'value', data: values, type: 'DOUBLE' },
    ],
  })
  out.push(['samples/metrics.parquet', new Uint8Array(parquetBuf), 'application/vnd.apache.parquet'])

  return out
}

function logBlock(startDate, n) {
  const lines = []
  for (let i = 0; i < n; i++) {
    const level = ['INFO', 'INFO', 'DEBUG', 'WARN'][i % 4]
    lines.push(`[${level}] ${startDate}T${String(i % 24).padStart(2, '0')}:00:00Z event=${i}`)
  }
  return lines.join('\n') + '\n'
}

function put(key, content, contentType) {
  const args = ['exec', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote', '--pipe']
  if (contentType) args.push('--content-type', contentType)
  process.stderr.write(`  ${key} (${content.length}B${contentType ? `, ${contentType}` : ''})\n`)
  if (dryRun) return
  const r = spawnSync('pnpm', args, {
    input: content,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
  if (r.status !== 0) throw new Error(`failed to upload ${key}: exit ${r.status}`)
}

const fixture = buildFixture()
process.stderr.write(`Populating ${BUCKET} (${fixture.length} files)${dryRun ? ' [DRY RUN]' : ''}:\n`)
const start = Date.now()
for (const [key, content, ct] of fixture) put(key, content, ct)
const elapsed = ((Date.now() - start) / 1000).toFixed(1)
process.stderr.write(`Done in ${elapsed}s.\n`)
