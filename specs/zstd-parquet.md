# Parquet viewer: decode zstd (hyparquet `compressors`)

From the disky session (spec `specs/listing-slim.md` in `~/c/disky`), 2026-09-29.

## Problem

`hyparquet` decodes only Snappy (and uncompressed) natively. Anything else throws `parquet unsupported compression codec: ZSTD` unless the caller passes `compressors`. The parquet viewer's reads in `src/renderers/parquetData.ts` (`useRowGroup` and `useAllRows`, both `parquetRead({ file, … })`) pass none, so a zstd file shows a decode error. The metadata read (`parquetMetadataAsync`) is fine, because the footer is never compressed.

disky wants to write its layer-2 listings and index parquet as zstd (≈ 35 % of the Snappy size on its fixtures). Its site mounts this viewer at `/files`, so the switch is held off (`$DISK_TREE_PARQUET_CODEC` stays `snappy`) until this lands.

## Where disky uses the viewer

- `~/c/disky/site/src/FilesPage.tsx`: `makeParquetViewer({ ...viewerOpts, renderCell })` (the `elide`, `headerProps`, `resizableColumns` options), handed to `<FileTree>` over `HttpStore('/v1/files')`.
- disky's Workers already decode zstd with `fzstd` (pure JS, no wasm): `site/functions/_lib/zstd.ts`:

  ```ts
  import { decompress } from 'fzstd'
  import type { Compressors } from 'hyparquet'
  export const compressors: Compressors = {
    ZSTD: (input: Uint8Array, outputLength: number) => decompress(input, new Uint8Array(outputLength)),
  }
  ```

## API

1. **A `compressors` option on `ParquetViewerOptions`** (so `makeParquetViewer({ compressors })` and `<ParquetViewer compressors={…}>` work), typed as hyparquet's `Compressors`. Thread it to **every** hyparquet decode call: `useRowGroup`, `useAllRows`, and any future `parquetRead`/`parquetReadObjects`/`parquetQuery`. The hooks take it as a trailing optional argument (`useRowGroup(store, path, index, meta, cacheSize?, compressors?)`, `useAllRows(…, enabled, compressors?)`), so consumers of the headless hooks get it too. Add it to their effect dependency lists, or document that it must be stable (a module-level constant, like disky's).
2. **A default that decodes zstd out of the box** (recommended): when `compressors` is not given, use a built-in `{ ZSTD }` backed by `fzstd`. It is small, pure JS and safe in Workers/SSR. Make `fzstd` a regular dependency, or an optional peer that is imported lazily inside the decompressor, so Snappy-only consumers don't pay for it. A consumer-supplied `compressors` is merged over the default (`{ ...defaultCompressors, ...opts.compressors }`), so passing `hyparquet-compressors`' full set (brotli, gzip, lz4) also works.
3. Export the default (`defaultCompressors` from `renderers/parquet`) so consumers doing their own reads can reuse it.

`parquetMetadataAsync` needs no change: footers are uncompressed.

## Tests

- **Fixtures**, written with pyarrow and checked in under `test/fixtures/`, with a small `gen.py` beside them:

  ```python
  import pyarrow as pa, pyarrow.parquet as pq
  t = pa.table({'path': ['.', 'a', 'a/b'], 'size': pa.array([3, 2, 1], pa.int64()), 'kind': ['dir', 'dir', 'file']})
  pq.write_table(t, 'sample-zstd.parquet', compression='zstd', compression_level=3, row_group_size=2)
  pq.write_table(t, 'sample-snappy.parquet', compression='snappy', row_group_size=2)
  ```

  Use two row groups so the per-group read path (`useRowGroup`) runs alongside the whole-file one (`useAllRows`).
- **Unit** (vitest, like `test/row-group-pruning.test.ts`): through a mock/local `Store`:
  - Both fixtures decode to exactly the same rows via each hook (or the underlying read helper, if you factor one out).
  - With `compressors: {}` explicitly and no default, the zstd fixture fails with `parquet unsupported compression codec: ZSTD`. This pins that the option is actually threaded.
  - A custom `ZSTD` passed in wins over the default (a spy decompressor gets called).
- **Regression**: the Snappy fixture decodes as before (same rows, no decompressor calls).
- Optional e2e: the example site renders `sample-zstd.parquet` in the table viewer.

## Done when

A file-tree release (dist branch or npm) that disky's `site/` can pin, after which disky flips `$DISK_TREE_PARQUET_CODEC` to `zstd` (or makes it the default).
