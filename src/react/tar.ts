/** Client-side tarball reading: `.tar`, `.tar.gz` / `.tgz`, `.tar.zst`.
 *
 *  A tar has no index — headers are interleaved with member data, and a
 *  compressed tar can't be range-read at all — so unlike zip this reads
 *  the archive whole (capped) and walks it. The parsed archive is cached
 *  per store + path, so going from the listing to a member and back
 *  doesn't refetch. */
import type { Store } from '../types'
import { decompress, MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES } from './decompress'
import type { Codec } from './parsePath'

const BLOCK = 512

export type TarEntryType = 'file' | 'dir' | 'symlink' | 'other'

export interface TarEntry {
  /** Path inside the archive; directories end in `/`. */
  name: string
  size: number
  type: TarEntryType
  /** ISO-8601, from the header's mtime. */
  lastModified?: string
  /** Symlink target. */
  linkName?: string
  /** Offset of the member's data in the (decompressed) archive. */
  offset: number
}

export interface TarArchive {
  entries: TarEntry[]
  bytes: Uint8Array
  /** The archive was cut at a read or decompression cap; members past the
   *  cut are missing, and the last one listed may be partial. */
  truncated: boolean
}

const DEC = new TextDecoder()

function str(b: Uint8Array, off: number, len: number): string {
  const s = b.subarray(off, off + len)
  const nul = s.indexOf(0)
  return DEC.decode(nul < 0 ? s : s.subarray(0, nul))
}

/** Numeric header fields are NUL/space-terminated octal, or base-256
 *  (high bit set) for values that don't fit. */
function num(b: Uint8Array, off: number, len: number): number {
  if (b[off] & 0x80) {
    let n = b[off] & 0x7f
    for (let i = 1; i < len; i++) n = n * 256 + b[off + i]
    return n
  }
  const s = str(b, off, len).trim()
  return s ? parseInt(s, 8) : 0
}

/** PAX extended-header records: `"<len> <key>=<value>\n"`, repeated. */
function paxRecords(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {}
  let o = 0
  while (o < data.length) {
    const sp = data.indexOf(0x20, o)
    if (sp < 0) break
    const len = parseInt(DEC.decode(data.subarray(o, sp)), 10)
    if (!len) break
    const rec = DEC.decode(data.subarray(sp + 1, o + len - 1))
    const eq = rec.indexOf('=')
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1)
    o += len
  }
  return out
}

function typeOf(flag: string): TarEntryType {
  if (flag === '' || flag === '0' || flag === '7') return 'file'
  if (flag === '5') return 'dir'
  if (flag === '2') return 'symlink'
  return 'other'
}

/** Walk a tar's headers. Handles ustar (`prefix` + `name`), GNU long
 *  names (`L`) and PAX `path` / `size` overrides; stops at the
 *  end-of-archive marker or the end of `bytes`. */
export function parseTar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = []
  let o = 0
  let longName: string | undefined
  let pax: Record<string, string> = {}
  while (o + BLOCK <= bytes.length) {
    const h = bytes.subarray(o, o + BLOCK)
    if (h.every(b => b === 0)) break
    const flag = str(h, 156, 1)
    const size = num(h, 124, 12)
    const dataOffset = o + BLOCK
    const next = dataOffset + Math.ceil(size / BLOCK) * BLOCK
    if (flag === 'L') {
      longName = str(bytes, dataOffset, size)
    } else if (flag === 'x') {
      pax = paxRecords(bytes.subarray(dataOffset, dataOffset + size))
    } else if (flag === 'g') {
      // Global PAX header: archive-wide defaults we have no use for.
    } else {
      const magic = str(h, 257, 6)
      const prefix = magic.startsWith('ustar') ? str(h, 345, 155) : ''
      const base = str(h, 0, 100)
      let name = pax.path ?? longName ?? (prefix ? `${prefix}/${base}` : base)
      const type = typeOf(flag)
      if (type === 'dir' && !name.endsWith('/')) name += '/'
      const realSize = pax.size !== undefined ? Number(pax.size) : size
      const mtime = pax.mtime !== undefined ? Number(pax.mtime) : num(h, 136, 12)
      const linkName = pax.linkpath ?? str(h, 157, 100)
      entries.push({
        name: name.replace(/^\.\//, ''),
        size: realSize,
        type,
        ...(mtime ? { lastModified: new Date(mtime * 1000).toISOString() } : {}),
        ...(type === 'symlink' && linkName ? { linkName } : {}),
        offset: dataOffset,
      })
      longName = undefined
      pax = {}
      o = dataOffset + Math.ceil(realSize / BLOCK) * BLOCK
      continue
    }
    o = next
  }
  return entries.filter(e => e.name !== '' && e.name !== './')
}

/** One member's bytes, clipped to what was read. */
export function tarEntryBytes(archive: TarArchive, entry: TarEntry): Uint8Array {
  return archive.bytes.subarray(entry.offset, Math.min(entry.offset + entry.size, archive.bytes.length))
}

async function load(store: Store, path: string, codec?: Codec): Promise<TarArchive> {
  const cap = codec ? MAX_COMPRESSED_BYTES : MAX_DECOMPRESSED_BYTES
  const r = await store.get(path, store.capabilities?.range ? { offset: 0, length: cap } : undefined)
  const raw = r.bytes.byteLength > cap ? r.bytes.subarray(0, cap) : r.bytes
  const inputTruncated = (r.totalSize ?? r.bytes.byteLength) > raw.byteLength
  const { bytes, truncated } = codec
    ? await decompress(raw, codec, { inputTruncated })
    : { bytes: raw, truncated: inputTruncated }
  return { entries: parseTar(bytes), bytes, truncated }
}

const cache = new WeakMap<Store, Map<string, Promise<TarArchive>>>()

/** Read and parse the tarball at `path`, once per store + path. */
export function readTar(store: Store, path: string, codec?: Codec): Promise<TarArchive> {
  let byPath = cache.get(store)
  if (!byPath) { byPath = new Map(); cache.set(store, byPath) }
  let p = byPath.get(path)
  if (!p) {
    p = load(store, path, codec)
    // A failed read shouldn't stick: drop it so a retry refetches.
    p.catch(() => byPath!.delete(path))
    byPath.set(path, p)
  }
  return p
}
