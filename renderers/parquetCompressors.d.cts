import { Compressors } from 'hyparquet';

/** Decompressors used when a caller passes none. hyparquet decodes only
 *  Snappy (and uncompressed) natively; this adds ZSTD via `fzstd` (pure JS,
 *  no wasm, safe in Workers/SSR). Exported for consumers doing their own
 *  hyparquet reads. */
declare const defaultCompressors: Compressors;
/** `defaultCompressors` with a consumer's set merged over it, so passing e.g.
 *  `hyparquet-compressors`' full set (brotli, gzip, lz4) adds codecs, and a
 *  custom `ZSTD` replaces the built-in one. */
declare function withDefaultCompressors(compressors?: Compressors): Compressors;

export { defaultCompressors, withDefaultCompressors };
