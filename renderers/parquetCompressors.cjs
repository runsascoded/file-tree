"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/renderers/parquetCompressors.ts
var parquetCompressors_exports = {};
__export(parquetCompressors_exports, {
  defaultCompressors: () => defaultCompressors,
  withDefaultCompressors: () => withDefaultCompressors
});
module.exports = __toCommonJS(parquetCompressors_exports);
var import_fzstd = require("fzstd");
var defaultCompressors = {
  ZSTD: (input, outputLength) => (0, import_fzstd.decompress)(input, new Uint8Array(outputLength))
};
function withDefaultCompressors(compressors) {
  return compressors ? { ...defaultCompressors, ...compressors } : defaultCompressors;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  defaultCompressors,
  withDefaultCompressors
});
//# sourceMappingURL=parquetCompressors.cjs.map