#!/usr/bin/env node
/** Embed `catalog.sqlite` into `catalog.ts` as base64.
 *
 *  The parquet fixture next door is generated in the browser, which is
 *  nicer — but there's no writer for SQLite that runs there, so the
 *  bytes are built by the `sqlite3` CLI and committed. `catalog.sql` is
 *  the source of truth; this turns its output into a module. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/fixtures')
const bytes = readFileSync(join(dir, 'catalog.sqlite'))
const b64 = bytes.toString('base64')
const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16)

const lines = b64.match(/.{1,100}/g) ?? []
writeFileSync(join(dir, 'catalog.ts'), `/** The \`/mock\` demo's SQLite database, base64-encoded.
 *
 *  Generated — edit \`catalog.sql\` and run \`node tools/embed-sqlite.mjs\`.
 *
 *  Committed rather than built at load time because, unlike parquet,
 *  there is no SQLite writer that runs in a browser. ${(b64.length / 1024).toFixed(0)} KiB of
 *  base64 for a ${(readFileSync(join(dir, 'catalog.sqlite')).byteLength / 1024).toFixed(0)} KiB database. */
const BASE64 = [
${lines.map(l => `  '${l}',`).join('\n')}
].join('')

export const CATALOG_SQLITE: Uint8Array = Uint8Array.from(
  atob(BASE64), c => c.charCodeAt(0))

/** Content hash, for the remote engine's block cache.
 *
 *  A real deployment sends an etag, or the \`lastModified\` the file
 *  listing already carries; a fixture compiled into the bundle has
 *  neither, so its digest stands in. The point is the same either way:
 *  the key names these bytes, so re-generating the fixture cannot be
 *  served out of the previous one's pages. */
export const CATALOG_VERSION = '${version}'
`)
console.log(`catalog.ts: ${(b64.length / 1024).toFixed(1)} KiB base64`)
