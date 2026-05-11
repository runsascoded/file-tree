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
  // Need `byteLength` upfront. A 1-byte range read returns `totalSize`
  // from Content-Range (cheaper than fetching the whole object).
  const head = await store.get(path, { offset: 0, length: 1 })
  const byteLength = head.totalSize ?? head.bytes.byteLength
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
