/** Whole-file decompression for `foo.csv.gz`-style keys and compressed
 *  tarballs. `gzip` uses the platform's `DecompressionStream` (no JS
 *  inflate shipped); `zstd` lazy-loads `fzstd`, so pages that never open
 *  a `.zst` don't pay for it.
 *
 *  Output is capped: a small compressed object can expand enormously,
 *  and the viewers above hold the result in memory. Callers disclose
 *  `truncated`. */
import type { Codec } from './parsePath'

/** Compressed bytes read for one object. Above this the input itself is
 *  cut, which `truncated` reports the same way. */
export const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024
/** Decompressed bytes kept. */
export const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024

export interface Decompressed {
  bytes: Uint8Array
  /** Output stopped at `max`, or the input was already cut short. */
  truncated: boolean
}

function concat(chunks: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

async function gunzip(input: Uint8Array, max: number): Promise<Decompressed> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!DS) throw new Error('gzip: DecompressionStream not available; need a modern browser or Worker runtime')
  const reader = new Blob([input as BlobPart]).stream().pipeThrough(new DS('gzip')).getReader()
  const chunks: Uint8Array[] = []
  let produced = 0
  let truncated = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (produced + value.byteLength > max) {
        chunks.push(value.subarray(0, max - produced))
        produced = max
        truncated = true
        reader.cancel().catch(() => { /* already have what we need */ })
        break
      }
      chunks.push(value)
      produced += value.byteLength
    }
  } catch (e) {
    // A cut-short input ends in an "unexpected end of data" error; what
    // decoded before it is still the file's head, which is the point of a
    // preview. Anything else, or nothing decoded at all, is a real error.
    if (!produced) throw e
    truncated = true
  }
  return { bytes: concat(chunks, produced), truncated }
}

async function unzstd(input: Uint8Array, max: number): Promise<Decompressed> {
  const { Decompress } = await import('fzstd')
  const chunks: Uint8Array[] = []
  let produced = 0
  let truncated = false
  const d = new Decompress((chunk: Uint8Array) => {
    if (truncated) return
    if (produced + chunk.byteLength > max) {
      chunks.push(chunk.subarray(0, max - produced))
      produced = max
      truncated = true
      return
    }
    chunks.push(chunk)
    produced += chunk.byteLength
  })
  const STEP = 1 << 20
  try {
    for (let o = 0; o < input.byteLength && !truncated; o += STEP) {
      const end = Math.min(o + STEP, input.byteLength)
      d.push(input.subarray(o, end), end === input.byteLength)
    }
  } catch (e) {
    if (!produced) throw e
    truncated = true
  }
  return { bytes: concat(chunks, produced), truncated }
}

/** Decompress `input` with `codec`, keeping at most `max` output bytes.
 *  `inputTruncated` marks input that was already cut short (a capped
 *  read), so a decode that runs out of data reports `truncated` rather
 *  than failing. */
export async function decompress(input: Uint8Array, codec: Codec, opts: { max?: number; inputTruncated?: boolean } = {}): Promise<Decompressed> {
  const max = opts.max ?? MAX_DECOMPRESSED_BYTES
  const r = codec === 'gzip' ? await gunzip(input, max) : await unzstd(input, max)
  return opts.inputTruncated ? { ...r, truncated: true } : r
}
