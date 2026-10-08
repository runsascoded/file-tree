/** Synchronous builders for archive / compressed fixtures, so the
 *  `MockStore` demo (and the unit tests) can hold `.tar.gz`, `.jsonl.gz`
 *  and `.zst` objects without an async compression step at import time.
 *
 *  None of them compress: gzip uses DEFLATE "stored" blocks and zstd a
 *  single raw block — both valid containers a real decoder must handle,
 *  which is all a fixture needs. */

const enc = new TextEncoder()
const bytes = (v: string | Uint8Array) => typeof v === 'string' ? enc.encode(v) : v

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.byteLength }
  return out
}

function octal(n: number, len: number): string {
  return n.toString(8).padStart(len - 1, '0') + '\0'
}

export interface TarInput {
  name: string
  data?: string | Uint8Array
  /** `'5'` = directory. Default `'0'` (file). */
  type?: '0' | '5'
  /** Seconds since the epoch. */
  mtime?: number
}

/** A ustar archive of `files`, ending in the two-zero-block marker. */
export function tar(files: TarInput[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const f of files) {
    const data = f.type === '5' ? new Uint8Array() : bytes(f.data ?? '')
    const h = new Uint8Array(512)
    const put = (s: string, off: number) => h.set(enc.encode(s), off)
    put(f.name, 0)
    put(octal(f.type === '5' ? 0o755 : 0o644, 8), 100)
    put(octal(0, 8), 108)
    put(octal(0, 8), 116)
    put(octal(data.byteLength, 12), 124)
    put(octal(f.mtime ?? 1767225600, 12), 136)
    put('        ', 148)
    put(f.type ?? '0', 156)
    put('ustar\0', 257)
    put('00', 263)
    const sum = h.reduce((n, b) => n + b, 0)
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    parts.push(h, data, new Uint8Array((512 - (data.byteLength % 512)) % 512))
  }
  parts.push(new Uint8Array(1024))
  return concat(parts)
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const u32le = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

/** A gzip member holding `input` in DEFLATE stored blocks. */
export function gzipStored(input: string | Uint8Array): Uint8Array {
  const data = bytes(input)
  const parts: Uint8Array[] = [new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff])]
  const MAX = 0xffff
  for (let o = 0; o === 0 || o < data.byteLength; o += MAX) {
    const chunk = data.subarray(o, o + MAX)
    const last = o + MAX >= data.byteLength ? 1 : 0
    const len = chunk.byteLength
    parts.push(new Uint8Array([last, len & 0xff, len >> 8, ~len & 0xff, (~len >> 8) & 0xff]), chunk)
  }
  parts.push(u32le(crc32(data)), u32le(data.byteLength))
  return concat(parts)
}

/** A zstd frame holding `input` as raw blocks (no checksum). */
export function zstdRaw(input: string | Uint8Array): Uint8Array {
  const data = bytes(input)
  // Frame header descriptor 0: no checksum, no dictionary, a window
  // descriptor byte follows. Window = 2^(10 + exponent); 2^20 covers any
  // block we emit (blocks cap at 128 KiB).
  const parts: Uint8Array[] = [new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00, 10 << 3])]
  const MAX = 128 * 1024
  for (let o = 0; o === 0 || o < data.byteLength; o += MAX) {
    const chunk = data.subarray(o, o + MAX)
    const last = o + MAX >= data.byteLength ? 1 : 0
    const header = (chunk.byteLength << 3) | last // block type 0 = raw
    parts.push(new Uint8Array([header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff]), chunk)
  }
  return concat(parts)
}
