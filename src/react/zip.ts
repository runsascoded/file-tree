/** Client-side zip browsing helpers — used by the lib's default
 *  `<ZipEntryList>` / `<ZipEntryPreview>` when the underlying `Store`
 *  doesn't provide `getZipEntries` / `getZipEntry` overrides.
 *
 *  Reads only the central-directory trailer (~64 KB) for listing and
 *  the per-entry local-header + compressed data for previewing. Inflate
 *  uses the platform's `DecompressionStream('deflate-raw')` (Chrome
 *  103+, Firefox 113+, Safari 16.4+, modern Workers) — no JS deflate
 *  dependency.
 *
 *  Zip64 is intentionally not supported here; archives ≥4 GB (or with
 *  ≥65535 entries) need a server-side fast path via `Store.getZipEntries`.
 */
import type { GetResult, Store, ZipEntriesResult, ZipEntry } from '../types'

// Constant signatures from the PKZIP APPNOTE.
const SIG_EOCD = 0x06054b50          // End of Central Directory
const SIG_CENTRAL_DIR = 0x02014b50   // Central Directory File Header
const SIG_LOCAL_FILE = 0x04034b50    // Local File Header

const EOCD_MIN_SIZE = 22
// The EOCD record is the last thing in a zip but a comment of up to
// 64 KiB can follow its fixed fields. Probe at least that much.
const EOCD_PROBE_BYTES = 64 * 1024 + EOCD_MIN_SIZE

/** Read the central directory of a zip and return all entries.
 *  Uses two range reads: one for the EOCD trailer and one for the
 *  central directory block it points at. */
export async function readZipEntries(store: Store, path: string): Promise<ZipEntriesResult> {
  // Resolve total size. The EOCD-probe range must be capped at the
  // file size; we learn that from a 1-byte GET (or `getUrl` HEAD via
  // `asyncBufferFromStore`-style trick if needed).
  const sizeProbe = await store.get(path, { offset: 0, length: 1 })
  let total = sizeProbe.totalSize
  if (total == null) {
    // Fallback: HEAD via getUrl (same workaround as asyncBuffer; some
    // stores strip Content-Range under CORS).
    if (typeof store.getUrl === 'function') {
      const r = await fetch(store.getUrl(path), { method: 'HEAD' })
      if (r.ok) {
        const cl = parseInt(r.headers.get('Content-Length') ?? '', 10)
        if (Number.isFinite(cl) && cl > 0) total = cl
      }
    }
  }
  if (total == null) throw new Error(`zip: can't determine size of ${path}`)

  const probeLen = Math.min(EOCD_PROBE_BYTES, total)
  const probeOffset = total - probeLen
  const probe = await store.get(path, { offset: probeOffset, length: probeLen })
  const eocd = findEocd(probe.bytes)
  if (!eocd) throw new Error(`zip: end-of-central-directory record not found in last ${probeLen} bytes of ${path}`)

  const cdSize = eocd.cdSize
  const cdOffset = eocd.cdOffset
  const cdEntries = eocd.cdEntries

  // Central directory may be inside the probe we just read; only
  // fetch separately if it isn't.
  let cdBytes: Uint8Array
  if (cdOffset >= probeOffset && cdOffset + cdSize <= probeOffset + probeLen) {
    const start = cdOffset - probeOffset
    cdBytes = probe.bytes.subarray(start, start + cdSize)
  } else {
    const r = await store.get(path, { offset: cdOffset, length: cdSize })
    cdBytes = r.bytes
  }

  const entries: ZipEntry[] = []
  let totalSize = 0
  let totalCompressed = 0
  let off = 0
  for (let i = 0; i < cdEntries; i++) {
    const e = parseCentralDirectoryEntry(cdBytes, off)
    entries.push(e.entry)
    totalSize += e.entry.size
    totalCompressed += e.entry.compressedSize
    off = e.nextOffset
  }
  return { entries, totalSize, totalCompressed }
}

/** Fetch and inflate one entry's bytes. Honors `opts.max` by truncating
 *  the inflate stream once that many output bytes are produced. */
export async function readZipEntry(
  store: Store,
  path: string,
  entryName: string,
  opts: { max?: number } = {},
): Promise<GetResult> {
  // Need the local-header offset; cheapest path is to read the central
  // directory again. Could be cached by callers if they prefer.
  const dir = await readZipEntries(store, path)
  const found = dir.entries.find(e => e.name === entryName)
  if (!found) throw new Error(`zip: entry not found: ${entryName}`)

  // Local file header has variable-length name + extra fields whose
  // sizes appear inside the header itself. Read the fixed 30-byte
  // prefix, then re-fetch the data after we know exactly where it
  // starts.
  const LFH_FIXED = 30
  const head = await store.get(path, { offset: found.localHeaderOffset, length: LFH_FIXED })
  const v = new DataView(head.bytes.buffer, head.bytes.byteOffset, head.bytes.byteLength)
  if (v.getUint32(0, true) !== SIG_LOCAL_FILE) {
    throw new Error(`zip: bad local-file-header signature for ${entryName}`)
  }
  const fileNameLen = v.getUint16(26, true)
  const extraLen = v.getUint16(28, true)
  const dataOffset = found.localHeaderOffset + LFH_FIXED + fileNameLen + extraLen

  const r = await store.get(path, { offset: dataOffset, length: found.compressedSize })

  let out: Uint8Array
  if (found.method === 0) {
    // Stored — bytes are the file as-is.
    out = opts.max != null && r.bytes.byteLength > opts.max
      ? r.bytes.subarray(0, opts.max)
      : r.bytes
  } else if (found.method === 8) {
    out = await inflateDeflateRaw(r.bytes, opts.max)
  } else {
    throw new Error(`zip: unsupported compression method ${found.method} for ${entryName}`)
  }
  const result: GetResult = { bytes: out, totalSize: found.size }
  return result
}

/** Walk `bytes` from the end backwards looking for the EOCD signature.
 *  Returns the offsets we need + the parsed central-directory location. */
function findEocd(bytes: Uint8Array): { cdSize: number; cdOffset: number; cdEntries: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // EOCD's fixed part is 22 bytes; scan from `len - 22` down to 0.
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (v.getUint32(i, true) !== SIG_EOCD) continue
    const cdEntries = v.getUint16(i + 10, true)
    const cdSize = v.getUint32(i + 12, true)
    const cdOffset = v.getUint32(i + 16, true)
    return { cdSize, cdOffset, cdEntries }
  }
  return null
}

function parseCentralDirectoryEntry(bytes: Uint8Array, offset: number): { entry: ZipEntry; nextOffset: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset)
  if (v.getUint32(0, true) !== SIG_CENTRAL_DIR) {
    throw new Error(`zip: bad central-directory-header signature at offset ${offset}`)
  }
  const method = v.getUint16(10, true)
  const dosTime = v.getUint16(12, true)
  const dosDate = v.getUint16(14, true)
  const compressedSize = v.getUint32(20, true)
  const size = v.getUint32(24, true)
  const fileNameLen = v.getUint16(28, true)
  const extraLen = v.getUint16(30, true)
  const commentLen = v.getUint16(32, true)
  const localHeaderOffset = v.getUint32(42, true)
  const fixedSize = 46
  const nameBytes = bytes.subarray(offset + fixedSize, offset + fixedSize + fileNameLen)
  const name = new TextDecoder('utf-8').decode(nameBytes)
  const entry: ZipEntry = {
    name,
    size,
    compressedSize,
    method,
    localHeaderOffset,
    lastModified: dosTimeToIso(dosDate, dosTime),
  }
  return { entry, nextOffset: offset + fixedSize + fileNameLen + extraLen + commentLen }
}

function dosTimeToIso(dosDate: number, dosTime: number): string | undefined {
  if (dosDate === 0 && dosTime === 0) return undefined
  const year = ((dosDate >> 9) & 0x7f) + 1980
  const month = (dosDate >> 5) & 0x0f
  const day = dosDate & 0x1f
  const hour = (dosTime >> 11) & 0x1f
  const minute = (dosTime >> 5) & 0x3f
  const second = (dosTime & 0x1f) * 2
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`
}

async function inflateDeflateRaw(input: Uint8Array, max?: number): Promise<Uint8Array> {
  // `DecompressionStream` is in Chrome 103+ / Firefox 113+ / Safari
  // 16.4+ / Workers — well within our target range. We bail with a
  // clear message on older runtimes instead of bundling a JS fallback.
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!DS) throw new Error('zip: DecompressionStream not available; need a modern browser or Worker runtime')
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DS('deflate-raw'))
  const chunks: Uint8Array[] = []
  let produced = 0
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    if (max != null && produced + value.byteLength > max) {
      chunks.push(value.subarray(0, max - produced))
      produced = max
      reader.cancel().catch(() => { /* ignore */ })
      break
    }
    chunks.push(value)
    produced += value.byteLength
  }
  const out = new Uint8Array(produced)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}
