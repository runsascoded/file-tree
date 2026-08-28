// src/renderers/parquetData.ts
import { useEffect, useRef, useState } from "react";
import { parquetMetadataAsync, parquetRead, parquetSchema } from "hyparquet";

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

// src/renderers/parquetData.ts
var NUMERIC_TYPES = /* @__PURE__ */ new Set(["INT32", "INT64", "INT96", "FLOAT", "DOUBLE"]);
var RG_CACHE_SIZE = 4;
function coarseKind(physicalType) {
  if (NUMERIC_TYPES.has(physicalType)) return "number";
  if (physicalType === "BOOLEAN") return "boolean";
  if (physicalType === "BYTE_ARRAY" || physicalType === "FIXED_LEN_BYTE_ARRAY") return "string";
  return void 0;
}
function useParquetMeta(store, path) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setError(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const md = await parquetMetadataAsync(file);
        if (cancelled) return;
        const schema = parquetSchema(md).children.map((c) => {
          const el = c.element;
          const lt = el.logical_type;
          const physicalType = el.type ? String(el.type) : void 0;
          return {
            name: el.name,
            ...physicalType ? { physicalType, kind: coarseKind(physicalType) } : {},
            ...lt ? { logicalType: lt.type } : {},
            ...lt && "unit" in lt ? { timeUnit: lt.unit } : {},
            ...el.converted_type ? { convertedType: String(el.converted_type) } : {}
          };
        });
        const rowGroups = [];
        let cum = 0;
        md.row_groups.forEach((rg, i) => {
          const numRows = Number(rg.num_rows);
          const stats = /* @__PURE__ */ new Map();
          for (const chunk of rg.columns) {
            const cm = chunk.meta_data;
            const s = cm?.statistics;
            if (!cm || !s) continue;
            const min = s.min_value ?? s.min;
            const max = s.max_value ?? s.max;
            const nullCount = s.null_count != null ? Number(s.null_count) : void 0;
            if (min === void 0 && max === void 0 && nullCount === void 0) continue;
            stats.set(cm.path_in_schema.join("."), {
              ...min !== void 0 ? { min } : {},
              ...max !== void 0 ? { max } : {},
              ...nullCount !== void 0 ? { nullCount } : {}
            });
          }
          rowGroups.push({
            index: i,
            numRows,
            rowStart: cum,
            rowEnd: cum + numRows,
            uncompressedBytes: Number(rg.total_byte_size),
            compressedBytes: rg.total_compressed_size != null ? Number(rg.total_compressed_size) : null,
            stats
          });
          cum += numRows;
        });
        setMeta({ schema, totalRows: Number(md.num_rows), byteSize: file.byteLength, rowGroups });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path]);
  return { meta, error };
}
function useRowGroup(store, path, meta, index, cacheSize = RG_CACHE_SIZE) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const cache = useRef(/* @__PURE__ */ new Map());
  useEffect(() => {
    cache.current = /* @__PURE__ */ new Map();
    setRows(null);
    setError(null);
  }, [store, path]);
  useEffect(() => {
    if (!meta || meta.rowGroups.length === 0) return;
    const rgIdx = Math.min(index, meta.rowGroups.length - 1);
    const rg = meta.rowGroups[rgIdx];
    const cached = cache.current.get(rgIdx);
    if (cached) {
      cache.current.delete(rgIdx);
      cache.current.set(rgIdx, cached);
      setRows(cached);
      return;
    }
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const file = await asyncBufferFromStore(store, path);
        const out = [];
        await parquetRead({
          file,
          rowStart: rg.rowStart,
          rowEnd: rg.rowEnd,
          rowFormat: "object",
          onComplete: (data) => {
            if (Array.isArray(data)) for (const r of data) out.push(r);
          }
        });
        if (cancelled) return;
        cache.current.set(rgIdx, out);
        while (cache.current.size > cacheSize) {
          const oldest = cache.current.keys().next().value;
          if (oldest === void 0) break;
          cache.current.delete(oldest);
        }
        setRows(out);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, path, index, meta, cacheSize]);
  return { rows, error };
}
export {
  NUMERIC_TYPES,
  RG_CACHE_SIZE,
  coarseKind,
  useParquetMeta,
  useRowGroup
};
//# sourceMappingURL=parquetData.js.map