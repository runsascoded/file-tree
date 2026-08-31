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

// src/renderers/httpTableSource.ts
var httpTableSource_exports = {};
__export(httpTableSource_exports, {
  httpTableCatalog: () => httpTableCatalog
});
module.exports = __toCommonJS(httpTableSource_exports);
var ALL = {
  sort: true,
  filter: true,
  total: true,
  randomAccess: true
};
async function getJson(doFetch, url) {
  const res = await doFetch(url);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
    }
    throw new Error(detail);
  }
  return await res.json();
}
function httpTableCatalog(opts) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const capabilities = opts.capabilities ?? ALL;
  let objectsPromise = null;
  const identity = () => {
    const params = new URLSearchParams({ path: opts.path });
    if (opts.version) params.set("version", opts.version);
    return params;
  };
  return {
    objects() {
      objectsPromise ??= getJson(
        doFetch,
        `${base}/objects?${identity()}`
      ).then((r) => r.objects);
      return objectsPromise;
    },
    source(table) {
      let columnsPromise = null;
      const page = async (req) => {
        const params = identity();
        params.set("table", table);
        params.set("offset", String(req.offset));
        params.set("limit", String(req.limit));
        if (req.filter?.trim()) params.set("filter", req.filter);
        if (req.sort) {
          params.set("sort", req.sort.column);
          params.set("dir", req.sort.dir);
        }
        return getJson(doFetch, `${base}/page?${params}`);
      };
      return {
        page,
        columns() {
          columnsPromise ??= page({ offset: 0, limit: 0 }).then((r) => r.columns);
          return columnsPromise;
        },
        capabilities
      };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  httpTableCatalog
});
//# sourceMappingURL=httpTableSource.cjs.map