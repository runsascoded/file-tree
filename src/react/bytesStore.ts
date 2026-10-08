/** A one-file `Store` over bytes that aren't an object in the real
 *  store: a decompressed `foo.csv.gz`, or a member of a tarball. Every
 *  viewer already speaks `Store`, so wrapping the bytes in one is what
 *  lets `foo.jsonl.gz` get the JSONL table, a `.parquet` inside a
 *  `.tar.gz` get the parquet viewer, and so on, with no viewer knowing.
 *
 *  `load` runs once, on first `get`. The bytes are in memory, so ranges
 *  are free and `capabilities.range` is on. */
import type { GetResult, Range, Store } from '../types'
import { NotFoundError } from '../types'

export function bytesStore(key: string, load: () => Promise<Uint8Array>, opts: { describe?: string } = {}): Store {
  let bytes: Promise<Uint8Array> | undefined
  const read = () => (bytes ??= load())
  return {
    capabilities: { range: true },
    describe: () => opts.describe,
    async list() {
      return { entries: [] }
    },
    async get(path: string, range?: Range): Promise<GetResult> {
      if (path !== key) throw new NotFoundError(path)
      const all = await read()
      const out = range ? all.subarray(range.offset, range.offset + range.length) : all
      return { bytes: out, totalSize: all.byteLength }
    },
  }
}
