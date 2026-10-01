// src/renderers/parquetCompressors.ts
import { decompress as zstdDecompress } from "fzstd";
var defaultCompressors = {
  ZSTD: (input, outputLength) => zstdDecompress(input, new Uint8Array(outputLength))
};
function withDefaultCompressors(compressors) {
  return compressors ? { ...defaultCompressors, ...compressors } : defaultCompressors;
}
export {
  defaultCompressors,
  withDefaultCompressors
};
//# sourceMappingURL=parquetCompressors.js.map