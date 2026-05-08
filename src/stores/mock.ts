/** In-memory `Store` for tests + demos. Holds a flat map of
 *  `key → bytes`, with directory entries synthesized at list time
 *  via path-segment grouping (matching how R2/S3 expose
 *  delimiter-grouped listings).
 *
 * Usage:
 *   import { MockStore } from '@rdub/file-tree/stores/mock'
 *   const store = MockStore({
 *     'foo/a.txt': 'hello',
 *     'foo/bar/b.txt': new Uint8Array([1, 2, 3]),
 *   })
 */
import type { Entry, GetResult, ListOptions, ListResult, Range, Store } from '../types'
import { NotFoundError } from '../types'

export interface MockStoreFile {
  bytes: Uint8Array
  /** ISO-8601 string. Defaults to a fixed test-friendly date. */
  lastModified?: string
  /** Optional content-type. */
  contentType?: string
}

export interface MockStoreOptions {
  /** Page size for `list`. Default 100 — small enough to exercise
   *  cursor logic in the conformance harness. */
  pageSize?: number
  /** Default `lastModified` for files that don't specify one. */
  defaultLastModified?: string
}

export type MockStoreInput = Record<string, string | Uint8Array | MockStoreFile>

const TEXT = new TextEncoder()
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_LM = '2026-01-01T00:00:00.000Z'

function toFile(v: string | Uint8Array | MockStoreFile, defaultLM: string): MockStoreFile {
  if (typeof v === 'string') return { bytes: TEXT.encode(v), lastModified: defaultLM }
  if (v instanceof Uint8Array) return { bytes: v, lastModified: defaultLM }
  return { ...v, lastModified: v.lastModified ?? defaultLM }
}

export function MockStore(input: MockStoreInput, opts: MockStoreOptions = {}): Store {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE
  const defaultLM = opts.defaultLastModified ?? DEFAULT_LM
  const files = new Map<string, MockStoreFile>(
    Object.entries(input).map(([k, v]) => [k, toFile(v, defaultLM)]),
  )

  return {
    async list(prefix, listOpts: ListOptions = {}) {
      const p = prefix === '' || prefix.endsWith('/') ? prefix : `${prefix}/`
      // Group keys under `p` by next-segment.
      const dirs = new Set<string>()
      const fileEntries: Entry[] = []
      for (const [key, file] of files) {
        if (!key.startsWith(p)) continue
        const rest = key.slice(p.length)
        if (rest.length === 0) continue
        const slashIdx = rest.indexOf('/')
        if (slashIdx >= 0) {
          dirs.add(p + rest.slice(0, slashIdx) + '/')
        } else {
          const e: Entry = { key, size: file.bytes.byteLength, isDir: false }
          if (file.lastModified) e.lastModified = file.lastModified
          fileEntries.push(e)
        }
      }
      const all: Entry[] = [
        ...Array.from(dirs).sort().map(key => ({ key, isDir: true } as Entry)),
        ...fileEntries.sort((a, b) => a.key.localeCompare(b.key)),
      ]
      // Page using the (decoded) cursor as a numeric offset. We
      // base64-encode it just to mimic real stores' opaque cursors.
      const offset = listOpts.cursor ? parseInt(atob(listOpts.cursor), 10) : 0
      const limit = listOpts.limit ?? pageSize
      const page = all.slice(offset, offset + limit)
      const nextOffset = offset + page.length
      const result: ListResult = { entries: page }
      if (nextOffset < all.length) result.cursor = btoa(String(nextOffset))
      return result
    },

    async get(path: string, range?: Range): Promise<GetResult> {
      const file = files.get(path)
      if (!file) throw new NotFoundError(path)
      const total = file.bytes.byteLength
      const out: GetResult = { bytes: file.bytes, totalSize: total }
      if (file.contentType) out.contentType = file.contentType
      if (range) {
        const start = Math.max(0, range.offset)
        const end = Math.min(total, range.offset + range.length)
        out.bytes = file.bytes.slice(start, end)
      }
      return out
    },

    capabilities: { range: true },
  }
}
