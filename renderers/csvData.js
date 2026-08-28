// src/renderers/csvData.ts
import { useEffect, useState } from "react";
var PAGE_BYTES = 256 * 1024;
var HEADER_PROBE_BYTES = 32 * 1024;
function parseLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
      } else {
        cur += c;
        i++;
      }
    } else {
      if (c === delimiter) {
        out.push(cur);
        cur = "";
        i++;
      } else if (c === '"' && cur === "") {
        inQuotes = true;
        i++;
      } else {
        cur += c;
        i++;
      }
    }
  }
  out.push(cur);
  return out;
}
function useCsvHeader(store, path, delimiter) {
  const [header, setHeader] = useState(null);
  const [total, setTotal] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setHeader(null);
    setTotal(null);
    setError(null);
    store.get(path, { offset: 0, length: HEADER_PROBE_BYTES }).then((r) => {
      if (cancelled) return;
      const text = new TextDecoder().decode(r.bytes);
      const nl = text.indexOf("\n");
      if (nl < 0) {
        setError(`no newline in first ${HEADER_PROBE_BYTES} bytes \u2014 not a CSV?`);
        return;
      }
      setHeader(parseLine(text.slice(0, nl).replace(/\r$/, ""), delimiter));
      const ts = r.totalSize;
      if (ts == null) {
        setError("CSV viewer needs total file size; store did not report it");
        return;
      }
      setTotal(ts);
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, delimiter]);
  return { header, total, error };
}
function useCsvPage(store, path, delimiter, page, total) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (total === null) return;
    let cancelled = false;
    setRows(null);
    const offset = page * PAGE_BYTES;
    const length = Math.min(PAGE_BYTES, total - offset);
    if (length <= 0) {
      setRows([]);
      return;
    }
    store.get(path, { offset, length }).then((r) => {
      if (cancelled) return;
      const text = new TextDecoder().decode(r.bytes);
      let lines = text.split("\n");
      lines = lines.slice(1);
      const atEof = offset + length >= total;
      if (!atEof && lines.length > 0) lines = lines.slice(0, -1);
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      setRows(lines.map((line) => parseLine(line.replace(/\r$/, ""), delimiter)));
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, delimiter, page, total]);
  return { rows, error };
}
function useAllCsvRows(store, path, delimiter, enabled) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!enabled) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    setError(null);
    store.get(path).then((r) => {
      if (cancelled) return;
      const lines = new TextDecoder().decode(r.bytes).split("\n");
      lines.shift();
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      setRows(lines.map((line) => parseLine(line.replace(/\r$/, ""), delimiter)));
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [store, path, delimiter, enabled]);
  return { rows, error };
}
export {
  HEADER_PROBE_BYTES,
  PAGE_BYTES,
  parseLine,
  useAllCsvRows,
  useCsvHeader,
  useCsvPage
};
//# sourceMappingURL=csvData.js.map