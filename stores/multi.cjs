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

// src/stores/multi.ts
var multi_exports = {};
__export(multi_exports, {
  MultiStore: () => MultiStore
});
module.exports = __toCommonJS(multi_exports);

// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};

// src/stores/multi.ts
function MultiStore(children) {
  const names = Object.keys(children);
  for (const n of names) {
    if (n === "" || n.includes("/")) {
      throw new Error(`MultiStore: invalid child name ${JSON.stringify(n)} (must be non-empty, no '/')`);
    }
  }
  const sortedNames = [...names].sort();
  function split(path) {
    const slashIdx = path.indexOf("/");
    const name = slashIdx < 0 ? path : path.slice(0, slashIdx);
    const child = children[name];
    if (!child) return null;
    const rest = slashIdx < 0 ? "" : path.slice(slashIdx + 1);
    return { name, child, rest };
  }
  return {
    async list(prefix, opts = {}) {
      if (prefix === "" || prefix === "/") {
        return {
          entries: sortedNames.map((name2) => ({ key: `${name2}/`, isDir: true }))
        };
      }
      const split1 = split(prefix.replace(/\/+$/, ""));
      if (!split1) {
        return { entries: [] };
      }
      const { name, child, rest } = split1;
      const childPrefix = rest === "" ? "" : rest.endsWith("/") ? rest : `${rest}/`;
      const r = await child.list(childPrefix, opts);
      const entries = r.entries.map((e) => ({ ...e, key: `${name}/${e.key}` }));
      const out = { entries };
      if (r.cursor) out.cursor = r.cursor;
      return out;
    },
    async get(path, range) {
      const s = split(path);
      if (!s) throw new NotFoundError(path);
      return s.child.get(s.rest, range);
    },
    capabilities: {
      range: names.length > 0 && names.every((n) => children[n].capabilities?.range === true)
    },
    // Only expose `getUrl` if *every* child can produce one — that way
    // the UI's "is download supported here?" check is a simple
    // `typeof store.getUrl === 'function'` instead of a per-path probe.
    ...names.length > 0 && names.every((n) => typeof children[n].getUrl === "function") ? {
      getUrl(path) {
        const s = split(path);
        if (!s) throw new Error(`MultiStore.getUrl: no child for ${JSON.stringify(path)}`);
        return s.child.getUrl(s.rest);
      }
    } : {}
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MultiStore
});
//# sourceMappingURL=multi.cjs.map