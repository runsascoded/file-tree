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

// src/url-state/index.ts
var url_state_exports = {};
__export(url_state_exports, {
  useUrlPersistedState: () => useUrlPersistedState
});
module.exports = __toCommonJS(url_state_exports);
var import_use_prms = require("use-prms");
var useUrlPersistedState = (key, defaultValue) => {
  if (typeof defaultValue === "number") {
    return (0, import_use_prms.useUrlState)(key, (0, import_use_prms.intParam)(defaultValue));
  }
  return (0, import_use_prms.useUrlState)(key, (0, import_use_prms.defStringParam)(defaultValue));
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  useUrlPersistedState
});
//# sourceMappingURL=index.cjs.map