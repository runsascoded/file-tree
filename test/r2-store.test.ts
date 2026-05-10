/** Unit tests for `R2Store`. Uses a hand-rolled fake `R2Bucket` instead
 *  of the real binding (which only works inside a Worker / `wrangler dev`).
 *  Aim is to cover non-trivial bookkeeping the real binding can't easily
 *  exercise: scoped-prefix virtual root, allow-list enforcement, etc.
 */
import { describe, expect, it } from 'vitest'
import { R2Store } from '../src/stores/r2'

interface FakeObj {
  key: string
  size: number
  uploaded: Date
  httpMetadata?: { contentType?: string }
  body?: Uint8Array
}

function fakeBucket(objects: FakeObj[]): import('../src/stores/r2').R2Bucket {
  return {
    async list(opts) {
      const prefix = opts.prefix ?? ''
      const delim = opts.delimiter
      const matched = objects.filter(o => o.key.startsWith(prefix))
      const out: { key: string; size: number; uploaded: Date; httpMetadata?: { contentType?: string } }[] = []
      const dirs = new Set<string>()
      for (const o of matched) {
        const rest = o.key.slice(prefix.length)
        if (delim && rest.includes(delim)) {
          dirs.add(prefix + rest.slice(0, rest.indexOf(delim)) + delim)
        } else {
          out.push({ key: o.key, size: o.size, uploaded: o.uploaded })
        }
      }
      return {
        objects: out,
        delimitedPrefixes: Array.from(dirs),
        truncated: false,
      }
    },
    async get(key) {
      const o = objects.find(o => o.key === key)
      if (!o || !o.body) return null
      const body = o.body
      return {
        body: new ReadableStream({ start(c) { c.enqueue(body); c.close() } }),
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
        size: o.size,
        ...(o.httpMetadata && { httpMetadata: o.httpMetadata }),
      }
    },
  }
}

describe('R2Store scoped-prefix virtual root', () => {
  const bucket = fakeBucket([
    { key: 'gbfs/sys/2024.json', size: 10, uploaded: new Date('2024-01-01T00:00:00Z') },
    { key: 'avail/sys/2024.csv', size: 20, uploaded: new Date('2024-02-01T00:00:00Z') },
    { key: 'private/secrets.txt', size: 30, uploaded: new Date('2024-03-01T00:00:00Z') },
  ])

  it('lists allowed prefixes as virtual dirs at root', async () => {
    const store = R2Store(bucket, { prefixes: ['gbfs/', 'avail/'] })
    const r = await store.list('')
    expect(r.entries).toEqual([
      { key: 'avail/', isDir: true },
      { key: 'gbfs/', isDir: true },
    ])
  })

  it('forwards listing under an allowed prefix to the bucket', async () => {
    const store = R2Store(bucket, { prefixes: ['gbfs/', 'avail/'] })
    const r = await store.list('gbfs/sys/')
    const keys = r.entries.map(e => e.key).sort()
    expect(keys).toEqual(['gbfs/sys/2024.json'])
  })

  it('rejects listing outside allowed prefixes', async () => {
    const store = R2Store(bucket, { prefixes: ['gbfs/', 'avail/'] })
    await expect(store.list('private/')).rejects.toThrow(/not under any allowed prefix/)
  })

  it('rejects get outside allowed prefixes', async () => {
    const store = R2Store(bucket, { prefixes: ['gbfs/', 'avail/'] })
    await expect(store.get('private/secrets.txt')).rejects.toThrow(/not under any allowed prefix/)
  })

  it('escape-hatch: prefixes:[""] allows whole-bucket listing', async () => {
    const store = R2Store(bucket, { prefixes: [''] })
    const r = await store.list('')
    const dirs = r.entries.filter(e => e.isDir).map(e => e.key).sort()
    expect(dirs).toEqual(['avail/', 'gbfs/', 'private/'])
  })

  it('without prefixes: listing root passes through to the bucket', async () => {
    const store = R2Store(bucket)
    const r = await store.list('')
    const dirs = r.entries.filter(e => e.isDir).map(e => e.key).sort()
    expect(dirs).toEqual(['avail/', 'gbfs/', 'private/'])
  })
})
