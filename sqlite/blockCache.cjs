"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/sqlite/blockCache.ts
var blockCache_exports = {};
__export(blockCache_exports, {
  cachedRangeReader: () => cachedRangeReader,
  cachedRangeReaderFromStore: () => cachedRangeReaderFromStore,
  memoryBlockCache: () => memoryBlockCache,
  workersBlockCache: () => workersBlockCache
});
module.exports = __toCommonJS(blockCache_exports);

// src/sqlite/vfs.ts
var VFS = __toESM(require("wa-sqlite/src/VFS.js"), 1);

// src/react/asyncBuffer.ts
async function asyncBufferFromStore(store, path) {
  let byteLength;
  if (typeof store.getUrl === "function") {
    try {
      const r = await fetch(store.getUrl(path), { method: "HEAD" });
      if (r.ok) {
        const cl = parseInt(r.headers.get("Content-Length") ?? "", 10);
        if (Number.isFinite(cl) && cl > 0) byteLength = cl;
      }
    } catch {
    }
  }
  if (byteLength === void 0) {
    const head = await store.get(path, { offset: 0, length: 1 });
    byteLength = head.totalSize ?? head.bytes.byteLength;
  }
  return {
    byteLength,
    async slice(start, end) {
      const e = end ?? byteLength;
      const length = e - start;
      if (length <= 0) return new ArrayBuffer(0);
      const r = await store.get(path, { offset: start, length });
      return r.bytes.buffer.slice(
        r.bytes.byteOffset,
        r.bytes.byteOffset + r.bytes.byteLength
      );
    }
  };
}

// src/sqlite/vfs.ts
async function rangeReaderFromStore(store, path) {
  const buf = await asyncBufferFromStore(store, path);
  return {
    size: buf.byteLength,
    async read(offset, length) {
      const r = await store.get(path, { offset, length });
      return r.bytes;
    }
  };
}
var DEFAULTS = {
  minBlockBytes: 8 * 1024,
  maxBlockBytes: 256 * 1024,
  maxCacheBytes: 64 * 1024 * 1024
};

// src/sqlite/blockCache.ts
var DEFAULT_BLOCK_BYTES = 64 * 1024;
function cachedRangeReader(reader, opts) {
  const block = opts.blockBytes ?? DEFAULT_BLOCK_BYTES;
  const { cache, key } = opts;
  const stats = { hits: 0, misses: 0, reads: 0, bytes: 0 };
  const size = reader.size;
  const pending = /* @__PURE__ */ new Set();
  const blockLen = (i) => Math.min(block, size - i * block);
  function write(i, bytes) {
    const p = cache.put(`${key}#${i}`, bytes).catch(() => {
    }).finally(() => {
      pending.delete(p);
    });
    pending.add(p);
  }
  async function cached(i) {
    const got = await cache.get(`${key}#${i}`).catch(() => void 0);
    return got?.byteLength === blockLen(i) ? got : void 0;
  }
  async function read(offset, length) {
    const end = Math.min(offset + length, size);
    if (end <= offset) return new Uint8Array(0);
    const first = Math.floor(offset / block);
    const last = Math.floor((end - 1) / block);
    const count = last - first + 1;
    const blocks = await Promise.all(
      Array.from({ length: count }, (_, n) => cached(first + n))
    );
    for (let n = 0; n < count; n++) {
      if (blocks[n]) {
        stats.hits++;
        continue;
      }
      let m = n;
      while (m + 1 < count && !blocks[m + 1]) m++;
      stats.misses += m - n + 1;
      const runOffset = (first + n) * block;
      const runEnd = Math.min((first + m + 1) * block, size);
      const bytes = await reader.read(runOffset, runEnd - runOffset);
      stats.reads++;
      stats.bytes += bytes.byteLength;
      for (let k = n; k <= m; k++) {
        const start = (k - n) * block;
        if (start >= bytes.byteLength) break;
        const slice = bytes.subarray(start, Math.min(start + block, bytes.byteLength));
        blocks[k] = slice;
        write(first + k, slice);
      }
      n = m;
    }
    const out = new Uint8Array(end - offset);
    for (let n = 0; n < count; n++) {
      const bytes = blocks[n];
      if (!bytes) continue;
      const blockStart = (first + n) * block;
      const from = Math.max(offset, blockStart);
      const to = Math.min(end, blockStart + bytes.byteLength);
      if (to <= from) continue;
      out.set(bytes.subarray(from - blockStart, to - blockStart), from - offset);
    }
    return out;
  }
  return {
    size,
    read,
    stats,
    async flush() {
      await Promise.all([...pending]);
    }
  };
}
var SIZE_KEY = "#size";
async function cachedRangeReaderFromStore(store, path, opts) {
  const stored = await opts.cache.get(opts.key + SIZE_KEY).catch(() => void 0);
  if (stored?.byteLength === 8) {
    const size = new DataView(stored.buffer, stored.byteOffset, 8).getFloat64(0);
    if (Number.isSafeInteger(size) && size >= 0) {
      return cachedRangeReader({
        size,
        read: (offset, length) => store.get(path, { offset, length }).then((r) => r.bytes)
      }, opts);
    }
  }
  const reader = await rangeReaderFromStore(store, path);
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, reader.size);
  await opts.cache.put(opts.key + SIZE_KEY, bytes).catch(() => {
  });
  return cachedRangeReader(reader, opts);
}
function memoryBlockCache(maxBytes = 64 * 1024 * 1024) {
  const map = /* @__PURE__ */ new Map();
  let bytes = 0;
  return {
    async get(key) {
      const got = map.get(key);
      if (got) {
        map.delete(key);
        map.set(key, got);
      }
      return got;
    },
    async put(key, value) {
      if (map.has(key)) return;
      map.set(key, value);
      bytes += value.byteLength;
      while (bytes > maxBytes && map.size > 1) {
        const [oldest, dropped] = map.entries().next().value;
        map.delete(oldest);
        bytes -= dropped.byteLength;
      }
    }
  };
}
function workersBlockCache(opts = {}) {
  const host = opts.host ?? "blocks.file-tree.invalid";
  const maxAge = opts.maxAge ?? 7 * 24 * 60 * 60;
  const cacheFor = () => opts.cache ?? caches.default;
  const url = (key) => `https://${host}/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const res = await cacheFor().match(new Request(url(key)));
      if (!res) return void 0;
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, bytes) {
      const res = new Response(bytes, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": `public, max-age=${maxAge}`
        }
      });
      const p = cacheFor().put(new Request(url(key)), res);
      opts.waitUntil?.(p);
      await p;
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cachedRangeReader,
  cachedRangeReaderFromStore,
  memoryBlockCache,
  workersBlockCache
});
//# sourceMappingURL=blockCache.cjs.map