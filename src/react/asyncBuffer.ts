/** Adapter from `Store` to hyparquet's `AsyncBuffer` shape
 *  (`{ byteLength: number; slice(start, end?): Promise<ArrayBuffer> }`).
 *  Exported so consumers wiring `parquetRenderer` can feed any backend
 *  (R2, HTTP, S3, …) to hyparquet without knowing the underlying URL.
 *
 *  Usage:
 *      import { asyncBufferFromStore } from '@rdub/file-tree/react'
 *      import { parquetMetadataAsync } from 'hyparquet'
 *
 *      const file = await asyncBufferFromStore(store, path)
 *      const meta = await parquetMetadataAsync(file)
 */
import type { Store } from '../types'

export interface AsyncBuffer {
  byteLength: number
  slice(start: number, end?: number): Promise<ArrayBuffer>
}

export async function asyncBufferFromStore(store: Store, path: string): Promise<AsyncBuffer> {
  // Prefer an HTTP HEAD via `store.getUrl(path)` when available. AWS S3
  // (and many other backends) strip `Content-Range` from CORS responses
  // by default, which makes the 1-byte range trick fall back to a
  // partial `Content-Length` of 1 — wrong, and hyparquet later trips
  // `RangeError: Offset is outside the bounds of the DataView`.
  // HEAD returns a 200 whose `Content-Length` is the full object size.
  let byteLength: number | undefined
  if (typeof store.getUrl === 'function') {
    try {
      const r = await fetch(store.getUrl(path), { method: 'HEAD' })
      if (r.ok) {
        const cl = parseInt(r.headers.get('Content-Length') ?? '', 10)
        if (Number.isFinite(cl) && cl > 0) byteLength = cl
      }
    } catch { /* HEAD blocked / unsupported — fall through */ }
  }
  if (byteLength === undefined) {
    // Fallback: 1-byte range read. Works for native bindings (R2Store)
    // and HTTP proxies that expose `Content-Range`.
    const head = await store.get(path, { offset: 0, length: 1 })
    byteLength = head.totalSize ?? head.bytes.byteLength
  }
  return {
    byteLength,
    async slice(start: number, end?: number): Promise<ArrayBuffer> {
      const e = end ?? byteLength
      const length = e - start
      if (length <= 0) return new ArrayBuffer(0)
      const r = await store.get(path, { offset: start, length })
      // Always return a contiguous ArrayBuffer slice, not a view.
      return r.bytes.buffer.slice(
        r.bytes.byteOffset,
        r.bytes.byteOffset + r.bytes.byteLength,
      ) as ArrayBuffer
    },
  }
}
