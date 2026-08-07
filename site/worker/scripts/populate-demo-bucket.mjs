#!/usr/bin/env node
/** Populate the `file-tree-demo` R2 bucket via wrangler.
 *
 *  Idempotent — re-running overwrites keys byte-identically (fixture
 *  is deterministic). Sibling script `site/scripts/populate-demo-gcs-bucket.mjs`
 *  writes the same fixture to a GCS bucket via gcloud.
 *
 *  Usage (from `site/worker/`):
 *      node scripts/populate-demo-bucket.mjs            # all files
 *      node scripts/populate-demo-bucket.mjs --dry-run  # print plan only
 */
import { spawnSync } from 'node:child_process'
import { buildFixture } from '../../scripts/demo-fixture.mjs'

const BUCKET = 'file-tree-demo'
const dryRun = process.argv.includes('--dry-run')

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
