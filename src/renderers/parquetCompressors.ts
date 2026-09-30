/** ZSTD-capable decompressors for hyparquet, React-free so non-UI
 *  readers (`snapshotTreeSource`, server handlers) can use them without
 *  pulling in `parquetData`'s hooks. Re-exported from `./parquetData`. */
import { decompress as zstdDecompress } from 'fzstd'
import type { Compressors } from 'hyparquet'

/** Decompressors used when a caller passes none. hyparquet decodes only
 *  Snappy (and uncompressed) natively; this adds ZSTD via `fzstd` (pure JS,
 *  no wasm, safe in Workers/SSR). Exported for consumers doing their own
 *  hyparquet reads. */
export const defaultCompressors: Compressors = {
  ZSTD: (input, outputLength) => zstdDecompress(input, new Uint8Array(outputLength)),
}

/** `defaultCompressors` with a consumer's set merged over it, so passing e.g.
 *  `hyparquet-compressors`' full set (brotli, gzip, lz4) adds codecs, and a
 *  custom `ZSTD` replaces the built-in one. */
export function withDefaultCompressors(compressors?: Compressors): Compressors {
  return compressors ? { ...defaultCompressors, ...compressors } : defaultCompressors
}
