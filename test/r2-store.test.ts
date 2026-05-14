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

describe('R2Store publicBaseUrl', () => {
  const bucket = fakeBucket([])

  it('omits getUrl when publicBaseUrl is unset', () => {
    const store = R2Store(bucket)
    expect(store.getUrl).toBeUndefined()
  })

  it('exposes sync getUrl concatenating publicBaseUrl + encoded key', () => {
    const store = R2Store(bucket, { publicBaseUrl: 'https://data.example.com' })
    expect(store.getUrl).toBeTypeOf('function')
    expect(store.getUrl!('a/b.txt')).toBe('https://data.example.com/a/b.txt')
  })

  it('encodes path segments (preserves slashes)', () => {
    const store = R2Store(bucket, { publicBaseUrl: 'https://pub-xyz.r2.dev' })
    expect(store.getUrl!('with space/and+plus.csv'))
      .toBe('https://pub-xyz.r2.dev/with%20space/and%2Bplus.csv')
  })

  it('strips trailing slashes from publicBaseUrl', () => {
    const store = R2Store(bucket, { publicBaseUrl: 'https://data.example.com/' })
    expect(store.getUrl!('foo.txt')).toBe('https://data.example.com/foo.txt')
  })

  it('does not enforce the prefix allow-list (URL minting is harmless)', () => {
    // `getUrl` is a pure string op — the bucket itself enforces what's
    // accessible. No reason to refuse to mint a URL the worker code
    // wouldn't `get()`. (Compare with `getDownloadUrl`, which does
    // enforce: signing a URL is a credential-using action.)
    const store = R2Store(bucket, { prefixes: ['raw/'], publicBaseUrl: 'https://x.example' })
    expect(store.getUrl!('secret/file')).toBe('https://x.example/secret/file')
  })
})

describe('R2Store getDownloadUrl (presign)', () => {
  const bucket = fakeBucket([])
  const presign = {
    endpoint: 'https://acct.r2.cloudflarestorage.com',
    bucket: 'my-bkt',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  }

  it('omits getDownloadUrl when presign opts not provided', () => {
    const store = R2Store(bucket, { prefixes: ['raw/'] })
    expect(store.getDownloadUrl).toBeUndefined()
  })

  it('signs path-style URL with attachment disposition and default expiry', async () => {
    const store = R2Store(bucket, { prefixes: ['raw/'], presign })
    expect(store.getDownloadUrl).toBeTypeOf('function')
    const url = new URL(await store.getDownloadUrl!('raw/2024/data.csv'))
    expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/my-bkt/raw/2024/data.csv')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="data.csv"')
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^AKIA_TEST\//)
  })

  it('honors per-call expiresIn override', async () => {
    const store = R2Store(bucket, { presign: { ...presign, expiresIn: 60 } })
    const def = new URL(await store.getDownloadUrl!('raw/x.txt'))
    const overridden = new URL(await store.getDownloadUrl!('raw/x.txt', { expiresIn: 7200 }))
    expect(def.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(overridden.searchParams.get('X-Amz-Expires')).toBe('7200')
  })

  it('enforces prefix allow-list before signing', async () => {
    const store = R2Store(bucket, { prefixes: ['raw/'], presign })
    await expect(store.getDownloadUrl!('private/secret')).rejects.toThrow(/not under any allowed prefix/)
  })

  it('quotes filename with embedded double-quote', async () => {
    const store = R2Store(bucket, { presign })
    const url = new URL(await store.getDownloadUrl!('weird"name.txt'))
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="weird\\"name.txt"')
  })
})
