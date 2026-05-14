/** Tests for `S3Store`. Uses a hand-rolled fake S3 server (a fetch impl
 *  that translates S3's REST/XML protocol into calls against an
 *  in-memory `MockStore`). Runs the full conformance harness through it,
 *  plus targeted assertions on URL shape, prefix-scoping, and
 *  Range-header propagation that the harness doesn't cover. */
import { describe, expect, it } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { S3Store } from '../src/stores/s3'
import type { Range, Store } from '../src/types'
import { CONFORMANCE_FIXTURE, runStoreConformance } from '../src/test/conformance'

/** Build a fake `fetch` that translates S3 ListObjectsV2 + GetObject
 *  requests into calls against an in-memory `MockStore`. Only handles
 *  the slice of the S3 protocol that `S3Store` actually issues. */
function fakeS3Fetch(backing: Store, bucket: string, region: string) {
  const expectedHost = `${bucket}.s3.${region}.amazonaws.com`
  function xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function parseRange(h: string | null): Range | undefined {
    if (!h) return undefined
    const m = h.match(/^bytes=(\d+)-(\d+)$/)
    if (!m) return undefined
    return { offset: parseInt(m[1], 10), length: parseInt(m[2], 10) - parseInt(m[1], 10) + 1 }
  }

  const f: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? new URL(input) : new URL((input as URL | Request).toString())
    if (url.host !== expectedHost) {
      return new Response(`unexpected host: ${url.host}`, { status: 400 })
    }

    // ListObjectsV2: GET /?list-type=2&prefix=...&delimiter=/&max-keys=N[&continuation-token=...]
    if (url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? ''
      const cursor = url.searchParams.get('continuation-token') ?? undefined
      const limit = parseInt(url.searchParams.get('max-keys') ?? '1000', 10)
      const opts = cursor ? { cursor, limit } : { limit }
      const r = await backing.list(prefix, opts)
      const dirs = r.entries.filter(e => e.isDir)
      const files = r.entries.filter(e => !e.isDir)
      const parts: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        `  <Name>${xmlEscape(bucket)}</Name>`,
        `  <Prefix>${xmlEscape(prefix)}</Prefix>`,
        `  <Delimiter>/</Delimiter>`,
        `  <KeyCount>${files.length}</KeyCount>`,
        `  <IsTruncated>${r.cursor ? 'true' : 'false'}</IsTruncated>`,
      ]
      if (r.cursor) parts.push(`  <NextContinuationToken>${xmlEscape(r.cursor)}</NextContinuationToken>`)
      for (const d of dirs) parts.push(`  <CommonPrefixes><Prefix>${xmlEscape(d.key)}</Prefix></CommonPrefixes>`)
      for (const fEntry of files) {
        parts.push(
          `  <Contents>`,
          `    <Key>${xmlEscape(fEntry.key)}</Key>`,
          `    <LastModified>${xmlEscape(fEntry.lastModified ?? '')}</LastModified>`,
          `    <Size>${fEntry.size ?? 0}</Size>`,
          `  </Contents>`,
        )
      }
      parts.push('</ListBucketResult>')
      return new Response(parts.join('\n'), { status: 200, headers: { 'Content-Type': 'application/xml' } })
    }

    // GetObject: GET /<key>[Range: bytes=a-b]
    const key = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const rangeHeader = init?.headers ? new Headers(init.headers).get('Range') : null
    const range = parseRange(rangeHeader)
    try {
      const r = await backing.get(key, range)
      const headers = new Headers()
      headers.set('Content-Length', String(r.bytes.byteLength))
      if (r.contentType) headers.set('Content-Type', r.contentType)
      if (range && r.totalSize != null) {
        headers.set('Content-Range', `bytes ${range.offset}-${range.offset + r.bytes.byteLength - 1}/${r.totalSize}`)
        return new Response(r.bytes as BodyInit, { status: 206, headers })
      }
      return new Response(r.bytes as BodyInit, { status: 200, headers })
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundError') {
        return new Response(`<Error><Code>NoSuchKey</Code></Error>`, { status: 404 })
      }
      throw e
    }
  }
  return f
}

describe('S3Store (conformance via fake S3 fetch)', () => {
  runStoreConformance(() => {
    const backing = MockStore(CONFORMANCE_FIXTURE, { pageSize: 3 })
    return S3Store({
      bucket: 'test-bucket',
      region: 'us-east-1',
      fetch: fakeS3Fetch(backing, 'test-bucket', 'us-east-1'),
    })
  })
})

describe('S3Store (request shape)', () => {
  it('lists from virtual-hosted-style URL by default', async () => {
    const calls: string[] = []
    const store = S3Store({
      bucket: 'my-bucket',
      fetch: async (url) => {
        calls.push(url.toString())
        return new Response('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
      },
    })
    await store.list('')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^https:\/\/my-bucket\.s3\.us-east-1\.amazonaws\.com\/\?/)
    expect(calls[0]).toContain('list-type=2')
    expect(calls[0]).toContain('delimiter=%2F')
  })

  it('uses path-style URL when `endpoint` is set (R2/MinIO mode)', async () => {
    const calls: string[] = []
    const store = S3Store({
      bucket: 'r2-bucket',
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      fetch: async (url) => {
        calls.push(url.toString())
        return new Response('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
      },
    })
    await store.list('data/')
    expect(calls[0]).toMatch(/^https:\/\/acct\.r2\.cloudflarestorage\.com\/r2-bucket\/\?/)
    expect(calls[0]).toContain('prefix=data%2F')
  })

  it('sends Range header on get when range is requested', async () => {
    const captured: { url: string; headers: Headers }[] = []
    const store = S3Store({
      bucket: 'b',
      fetch: async (url, init) => {
        captured.push({ url: url.toString(), headers: new Headers(init?.headers) })
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 206,
          headers: { 'Content-Range': 'bytes 10-12/100' },
        })
      },
    })
    const r = await store.get('foo.bin', { offset: 10, length: 3 })
    expect(captured[0].headers.get('Range')).toBe('bytes=10-12')
    expect(r.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(r.totalSize).toBe(100)
  })

  it('translates 404 to NotFoundError', async () => {
    const store = S3Store({
      bucket: 'b',
      fetch: async () => new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }),
    })
    await expect(store.get('missing.txt')).rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('encodes special characters in keys', async () => {
    const calls: string[] = []
    const store = S3Store({
      bucket: 'b',
      fetch: async (url) => {
        calls.push(url.toString())
        return new Response('', { status: 200, headers: { 'Content-Length': '0' } })
      },
    })
    await store.get('foo bar/baz qux.txt')
    expect(calls[0]).toContain('/foo%20bar/baz%20qux.txt')
  })
})

describe('S3Store (scoped-prefix virtual root)', () => {
  it('synthesizes a dir per allowed prefix on list("")', async () => {
    const store = S3Store({
      bucket: 'b',
      prefixes: ['gbfs/', 'avail/'],
      fetch: async () => { throw new Error('fetch should not be called for virtual root') },
    })
    const r = await store.list('')
    expect(r.entries).toEqual([
      { key: 'avail/', isDir: true },
      { key: 'gbfs/', isDir: true },
    ])
  })

  it('rejects list outside allowed prefixes', async () => {
    const store = S3Store({
      bucket: 'b',
      prefixes: ['allowed/'],
      fetch: async () => new Response('', { status: 200 }),
    })
    await expect(store.list('forbidden/')).rejects.toThrow(/not under any allowed prefix/)
  })

  it('rejects get outside allowed prefixes', async () => {
    const store = S3Store({
      bucket: 'b',
      prefixes: ['allowed/'],
      fetch: async () => new Response('', { status: 200 }),
    })
    await expect(store.get('forbidden/file')).rejects.toThrow(/not under any allowed prefix/)
  })
})

describe('S3Store (getUrl)', () => {
  it('exposes virtual-hosted-style URL for unsigned (public) buckets', () => {
    const store = S3Store({ bucket: 'open-data', region: 'us-west-2' })
    expect(store.getUrl).toBeTypeOf('function')
    expect(store.getUrl!('data/2024/file.csv'))
      .toBe('https://open-data.s3.us-west-2.amazonaws.com/data/2024/file.csv')
  })

  it('exposes path-style URL when endpoint is set', () => {
    const store = S3Store({ bucket: 'r2-bkt', endpoint: 'https://acct.r2.cloudflarestorage.com' })
    expect(store.getUrl!('a/b.txt')).toBe('https://acct.r2.cloudflarestorage.com/r2-bkt/a/b.txt')
  })

  it('encodes path segments', () => {
    const store = S3Store({ bucket: 'b' })
    expect(store.getUrl!('with space/and+plus.txt'))
      .toBe('https://b.s3.us-east-1.amazonaws.com/with%20space/and%2Bplus.txt')
  })

  it('omits getUrl when signed (downloads use getDownloadUrl instead)', () => {
    const store = S3Store({ bucket: 'b', accessKeyId: 'AKIA', secretAccessKey: 's' })
    expect(store.getUrl).toBeUndefined()
  })
})

describe('S3Store (getDownloadUrl — SigV4 presign)', () => {
  it('omits getDownloadUrl for unsigned (public) buckets', () => {
    const store = S3Store({ bucket: 'open-data' })
    expect(store.getDownloadUrl).toBeUndefined()
  })

  it('signs virtual-hosted-style URL with attachment disposition and default expiry', async () => {
    const store = S3Store({ bucket: 'priv', region: 'us-west-2', accessKeyId: 'AKIA', secretAccessKey: 'SEC' })
    expect(store.getDownloadUrl).toBeTypeOf('function')
    const url = new URL(await store.getDownloadUrl!('data/2024/x.csv'))
    expect(url.origin).toBe('https://priv.s3.us-west-2.amazonaws.com')
    expect(url.pathname).toBe('/data/2024/x.csv')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="x.csv"')
  })

  it('signs path-style URL when endpoint is set', async () => {
    const store = S3Store({
      bucket: 'r2-bkt',
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      region: 'auto',
      accessKeyId: 'AKIA',
      secretAccessKey: 'SEC',
    })
    const url = new URL(await store.getDownloadUrl!('a/b.txt'))
    expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/r2-bkt/a/b.txt')
  })

  it('honors per-call expiresIn override over store default', async () => {
    const store = S3Store({ bucket: 'b', accessKeyId: 'AKIA', secretAccessKey: 'SEC', presignExpiresIn: 60 })
    const def = new URL(await store.getDownloadUrl!('x.txt'))
    const overridden = new URL(await store.getDownloadUrl!('x.txt', { expiresIn: 7200 }))
    expect(def.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(overridden.searchParams.get('X-Amz-Expires')).toBe('7200')
  })

  it('enforces prefix allow-list before signing', async () => {
    const store = S3Store({ bucket: 'b', prefixes: ['data/'], accessKeyId: 'AKIA', secretAccessKey: 'SEC' })
    await expect(store.getDownloadUrl!('secret/key')).rejects.toThrow(/not under any allowed prefix/)
  })
})
