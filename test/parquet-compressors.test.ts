/** Parquet decompressors: the viewer's reads decode ZSTD out of the box
 *  (`defaultCompressors`, via `fzstd`), a consumer's set merges over it, and
 *  the option is genuinely threaded to hyparquet. Fixtures come from
 *  `test/fixtures/gen-parquet.py` (pyarrow; same table in zstd + snappy, two
 *  row groups of 2 + 1 rows). */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { decompress } from 'fzstd'
import { readParquetRows, withDefaultCompressors } from '../src/renderers/parquetData'
import { MockStore } from '../src/stores/mock'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
const store = MockStore({
  'zstd.parquet': fixture('sample-zstd.parquet'),
  'snappy.parquet': fixture('sample-snappy.parquet'),
})

const ROWS = [
  { path: '.', size: 3n, kind: 'dir' },
  { path: 'a', size: 2n, kind: 'dir' },
  { path: 'a/b', size: 1n, kind: 'file' },
]

describe('parquet compressors', () => {
  for (const codec of ['zstd', 'snappy']) {
    it(`${codec}: decodes the whole file with the defaults`, async () => {
      expect(await readParquetRows(store, `${codec}.parquet`, { compressors: withDefaultCompressors() })).toEqual(ROWS)
    })

    it(`${codec}: decodes each row group (the per-page path)`, async () => {
      const compressors = withDefaultCompressors()
      expect(await readParquetRows(store, `${codec}.parquet`, { rowStart: 0, rowEnd: 2, compressors })).toEqual(ROWS.slice(0, 2))
      expect(await readParquetRows(store, `${codec}.parquet`, { rowStart: 2, rowEnd: 3, compressors })).toEqual(ROWS.slice(2))
    })
  }

  it('without a ZSTD decompressor, zstd fails (so the option is really threaded)', async () => {
    await expect(readParquetRows(store, 'zstd.parquet', { compressors: {} }))
      .rejects.toThrow(new Error('parquet unsupported compression codec: ZSTD'))
  })

  it('a consumer ZSTD wins over the default', async () => {
    const ZSTD = vi.fn((input: Uint8Array, outputLength: number) => decompress(input, new Uint8Array(outputLength)))
    expect(await readParquetRows(store, 'zstd.parquet', { compressors: withDefaultCompressors({ ZSTD }) })).toEqual(ROWS)
    // One call per compressed page: pyarrow dictionary-encodes, so each of the
    // 3 columns × 2 row groups has a dictionary page + a data page.
    expect(ZSTD).toHaveBeenCalledTimes(12)
  })

  it('snappy never touches the ZSTD decompressor', async () => {
    const ZSTD = vi.fn()
    expect(await readParquetRows(store, 'snappy.parquet', { compressors: withDefaultCompressors({ ZSTD }) })).toEqual(ROWS)
    expect(ZSTD).toHaveBeenCalledTimes(0)
  })
})
