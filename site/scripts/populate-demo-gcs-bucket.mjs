#!/usr/bin/env node
/** Populate the file-tree GCS demo bucket via gcloud.
 *
 *  Same deterministic fixture as the R2 demo (`site/worker/scripts/
 *  populate-demo-bucket.mjs`), so `/http` (R2-backed via worker) and
 *  `/gcs` (browser-direct) show byte-identical trees.
 *
 *  Idempotent — re-uploading is a no-op on unchanged bytes; fixture is
 *  deterministic so re-runs never churn the bucket.
 *
 *  Prereqs (one-time, see README below the script body):
 *      gcloud storage buckets create gs://file-tree-demo-gcs …
 *      gcloud storage buckets update gs://file-tree-demo-gcs --cors-file=cors.json
 *      gcloud storage buckets add-iam-policy-binding gs://file-tree-demo-gcs \\
 *          --member=allUsers --role=roles/storage.objectViewer
 *
 *  Usage (from `site/`):
 *      node scripts/populate-demo-gcs-bucket.mjs                     # all files
 *      node scripts/populate-demo-gcs-bucket.mjs --dry-run           # plan only
 *      BUCKET=my-other-bkt node scripts/populate-demo-gcs-bucket.mjs # override
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFixture } from './demo-fixture.mjs'

const BUCKET = process.env.BUCKET ?? 'file-tree-demo-gcs'
const dryRun = process.argv.includes('--dry-run')

/** gcloud storage cp reads from stdin only with `-` as the source, but
 *  can't take a Content-Type on stdin uploads. Simpler: stage each blob
 *  to a temp file, upload it, delete. */
function put(tmpDir, key, content, contentType) {
  process.stderr.write(`  ${key} (${content.length}B${contentType ? `, ${contentType}` : ''})\n`)
  if (dryRun) return
  const local = join(tmpDir, key.replace(/\//g, '_'))
  writeFileSync(local, content)
  const args = ['storage', 'cp', local, `gs://${BUCKET}/${key}`, '--quiet']
  if (contentType) args.push(`--content-type=${contentType}`)
  const r = spawnSync('gcloud', args, { stdio: ['ignore', 'ignore', 'inherit'] })
  if (r.status !== 0) throw new Error(`failed to upload ${key}: exit ${r.status}`)
}

const fixture = buildFixture()
process.stderr.write(`Populating gs://${BUCKET} (${fixture.length} files)${dryRun ? ' [DRY RUN]' : ''}:\n`)
const tmpDir = dryRun ? '' : mkdtempSync(join(tmpdir(), 'ft-gcs-'))
const start = Date.now()
try {
  for (const [key, content, ct] of fixture) put(tmpDir, key, content, ct)
} finally {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1)
process.stderr.write(`Done in ${elapsed}s.\n`)
