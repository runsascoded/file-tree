/** `hexdump -C`-style lines: offset, 16 bytes in two groups of 8, and
 *  the printable-ASCII column.
 *
 *    00000000  48 65 6c 6c 6f 0a                                 |Hello.|
 */
export function hexdump(bytes: Uint8Array, base = 0): string[] {
  const lines: string[] = []
  for (let o = 0; o < bytes.length; o += 16) {
    const row = bytes.subarray(o, o + 16)
    let hex = ''
    let ascii = ''
    for (let i = 0; i < 16; i++) {
      if (i === 8) hex += ' '
      if (i < row.length) {
        const b = row[i]
        hex += b.toString(16).padStart(2, '0') + ' '
        ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'
      } else {
        hex += '   '
      }
    }
    lines.push(`${(base + o).toString(16).padStart(8, '0')}  ${hex} |${ascii}|`)
  }
  return lines
}

/** Whether `bytes` reads as text: no NUL, and valid UTF-8 apart from a
 *  multi-byte sequence cut off at the end (a head read can split one). */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, trimPartialUtf8(bytes)))
    return true
  } catch {
    return false
  }
}

/** Length of `bytes` without a trailing incomplete UTF-8 sequence. */
function trimPartialUtf8(bytes: Uint8Array): number {
  const n = bytes.length
  for (let back = 1; back <= Math.min(3, n); back++) {
    const b = bytes[n - back]
    if ((b & 0xc0) === 0x80) continue
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1
    return need > back ? n - back : n
  }
  return n
}
