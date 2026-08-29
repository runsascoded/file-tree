/** `StoreVFS` — the block cache on its own, then real SQLite through it.
 *
 *  The read counts are asserted exactly, not loosely, because they are
 *  the whole point of the class: over HTTP each one is a round-trip, and
 *  a regression that turns 3 reads into 300 is invisible to any
 *  assertion about the rows. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs'
import * as SQLite from 'wa-sqlite'
import { SQLITE_FILENAME, StoreVFS, type RangeReader } from '../src/sqlite/vfs'

const here = dirname(fileURLToPath(import.meta.url))
const DB = readFileSync(join(here, 'fixtures/sample.sqlite'))

/** A reader over a buffer that records every range asked for. */
function recordingReader(bytes: Uint8Array): RangeReader & { ranges: [number, number][] } {
  const ranges: [number, number][] = []
  return {
    size: bytes.byteLength,
    ranges,
    async read(offset: number, length: number) {
      ranges.push([offset, length])
      return bytes.subarray(offset, offset + length)
    },
  }
}

/** Unregistered, `handleAsync` is `VFS.Base`'s passthrough — it returns
 *  the promise rather than a status code, which is what makes testing
 *  the VFS without SQLite possible. Registration replaces it. */
const read = (vfs: StoreVFS, buf: Uint8Array, offset: number) =>
  vfs.xRead(0, buf, offset) as unknown as Promise<number>

const SQLITE_OK = 0
const SQLITE_IOERR_SHORT_READ = 522

describe('StoreVFS block cache', () => {
  test('one read serves every request inside the same block', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096 })

    for (const offset of [0, 100, 4000]) {
      expect(await read(vfs, new Uint8Array(16), offset)).toBe(SQLITE_OK)
    }
    expect(reader.ranges).toEqual([[0, 4096]])
    expect(vfs.stats).toEqual({ reads: 1, bytes: 4096, hits: 2, misses: 1, evictions: 0 })
  })

  test('a read spanning a block boundary fetches both and stitches them', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096, maxBlockBytes: 8192 })

    const buf = new Uint8Array(8)
    expect(await read(vfs, buf, 4092)).toBe(SQLITE_OK)
    // The second block is the one right after the first, which already
    // counts as sequential — so readahead fetches two blocks, not one.
    expect(reader.ranges).toEqual([[0, 4096], [4096, 8192]])
    expect([...buf]).toEqual([...DB.subarray(4092, 4100)])
  })

  test('sequential access doubles the block size up to the max', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096, maxBlockBytes: 16384 })

    // Walk the file a block at a time, as a scan does.
    for (let offset = 0; offset < DB.byteLength; offset += 4096) {
      expect(await read(vfs, new Uint8Array(1), offset)).toBe(SQLITE_OK)
    }
    // One block, then two, then four — capped there by `maxBlockBytes`.
    // The file's forty-three blocks arrive in twelve requests.
    expect(reader.ranges).toEqual([
      [0, 4096],
      [4096, 8192],
      [12288, 16384],
      ...Array.from({ length: 9 }, (_, i) => [28672 + i * 16384, 16384]),
    ])
  })

  test('a non-sequential read drops back to the minimum block', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096, maxBlockBytes: 16384 })

    await read(vfs, new Uint8Array(1), 0)
    await read(vfs, new Uint8Array(1), 4096)      // sequential → two blocks
    await read(vfs, new Uint8Array(1), 40000)     // a seek → back to one
    expect(reader.ranges).toEqual([[0, 4096], [4096, 8192], [36864, 4096]])
  })

  test('reads past EOF zero-fill and report a short read', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096 })

    const past = new Uint8Array(4).fill(0xff)
    expect(await read(vfs, past, DB.byteLength)).toBe(SQLITE_IOERR_SHORT_READ)
    expect([...past]).toEqual([0, 0, 0, 0])

    const straddling = new Uint8Array(4).fill(0xff)
    expect(await read(vfs, straddling, DB.byteLength - 2)).toBe(SQLITE_IOERR_SHORT_READ)
    expect([...straddling]).toEqual([...DB.subarray(DB.byteLength - 2), 0, 0])
  })

  test('the LRU evicts the oldest block and keeps the newest', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, {
      minBlockBytes: 4096, maxBlockBytes: 4096, maxCacheBytes: 8192,
    })

    for (const offset of [0, 8192, 16384]) await read(vfs, new Uint8Array(1), offset)
    expect(vfs.stats.evictions).toBe(1)

    // Block 0 is gone (re-fetched); block 16384 is still cached.
    await read(vfs, new Uint8Array(1), 16384)
    await read(vfs, new Uint8Array(1), 0)
    expect(reader.ranges).toEqual([
      [0, 4096], [8192, 4096], [16384, 4096],
      [0, 4096],
    ])
  })

  test('clearCache resets the cache and the readahead', async () => {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096, maxBlockBytes: 16384 })

    await read(vfs, new Uint8Array(1), 0)
    await read(vfs, new Uint8Array(1), 4096)      // grown to two blocks
    vfs.clearCache()
    await read(vfs, new Uint8Array(1), 0)
    expect(reader.ranges).toEqual([[0, 4096], [4096, 8192], [0, 4096]])
  })

  test('writes are refused rather than silently dropped', () => {
    const vfs = new StoreVFS(recordingReader(DB))
    expect(vfs.xWrite()).toBe(8)      // SQLITE_READONLY
    expect(vfs.xTruncate()).toBe(8)
  })
})

describe('SQLite through StoreVFS', () => {
  let sqlite3: SQLiteAPI

  beforeAll(async () => {
    const wasmBinary = readFileSync(
      join(here, '../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm'))
    sqlite3 = SQLite.Factory(await SQLiteESMFactory({ wasmBinary }))
  })

  let n = 0
  /** A fresh VFS per query, so `stats.reads` is the cold cost. */
  async function query(sql: string, opts = {}) {
    const reader = recordingReader(DB)
    const vfs = new StoreVFS(reader, { minBlockBytes: 4096, maxBlockBytes: 4096, ...opts })
    vfs.name = `test-${n++}`
    sqlite3.vfs_register(vfs, false)
    const db = await sqlite3.open_v2(SQLITE_FILENAME, SQLite.SQLITE_OPEN_READONLY, vfs.name)
    const rows: Record<string, unknown>[] = []
    try {
      for await (const stmt of sqlite3.statements(db, sql)) {
        const columns = sqlite3.column_names(stmt)
        while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          rows.push(Object.fromEntries(sqlite3.row(stmt).map((v, i) => [columns[i]!, v])))
        }
      }
    } finally {
      await sqlite3.close(db)
    }
    return { rows, reads: vfs.stats.reads }
  }

  test('lists tables and views, and their schema, in one read', async () => {
    const { rows, reads } = await query(
      "select name, type from sqlite_master where type in ('table','view') order by name")
    expect(rows).toEqual([
      { name: 'events', type: 'table' },
      { name: 'recent', type: 'view' },
      { name: 'regions', type: 'table' },
    ])
    expect(reads).toBe(1)
  })

  test('reads a small table whole', async () => {
    const { rows } = await query('select code, name from regions order by code')
    expect(rows).toEqual([
      { code: 'chi', name: 'Chicago' },
      { code: 'nyc', name: 'New York' },
      { code: 'sf', name: 'San Francisco' },
    ])
  })

  test('pages without reading the whole file', async () => {
    const { rows, reads } = await query('select id, region, note from events limit 3')
    expect(rows).toEqual([
      { id: 1, region: 'sf', note: 'note-1' },
      { id: 2, region: 'chi', note: 'note-2' },
      { id: 3, region: 'nyc', note: 'note-3' },
    ])
    // 53 248 bytes of database, three 4 KiB reads to answer.
    expect(reads).toBe(3)
  })

  test('an indexed lookup costs less than the table it searches', async () => {
    const indexed = await query(
      "select id, ts from events where region = 'sf' order by ts limit 2")
    expect(indexed.rows).toEqual([
      { id: 1, ts: 1700003600 },
      { id: 4, ts: 1700014400 },
    ])

    // `count(*)` walks the smallest covering index rather than the
    // table — still far more than the two rows an index seek touches.
    const scan = await query('select count(*) as n from events')
    expect(scan.rows).toEqual([{ n: 3000 }])

    expect(indexed.reads).toBeLessThan(scan.reads)
    expect([indexed.reads, scan.reads]).toEqual([3, 14])
  })

  test('keyset paging is flat where OFFSET is linear', async () => {
    // `order by id` to force a rowid scan: `select id from events` alone
    // is answered from the covering `(region, ts)` index, whose order is
    // not the one being demonstrated.
    const offset = await query('select id from events order by id limit 1 offset 2500')
    const keyset = await query('select id from events where id > 2500 order by id limit 1')
    expect(offset.rows).toEqual([{ id: 2501 }])
    expect(keyset.rows).toEqual([{ id: 2501 }])
    // The reason `TableSource` will want a cursor: OFFSET reads every
    // row it skips, keyset seeks straight to it.
    expect([offset.reads, keyset.reads]).toEqual([24, 3])
  })

  test('readahead cuts a full scan to a handful of reads', async () => {
    // `note` is unindexed, so this reads every page of the table — the
    // case readahead exists for.
    const SCAN = "select count(*) as n from events where note like 'note-1%'"
    const small = await query(SCAN, { minBlockBytes: 4096, maxBlockBytes: 4096 })
    const grown = await query(SCAN, { minBlockBytes: 4096, maxBlockBytes: 65536 })
    expect(small.rows).toEqual([{ n: 1111 }])
    expect(grown.rows).toEqual([{ n: 1111 }])
    expect([small.reads, grown.reads]).toEqual([28, 7])
  })
})
