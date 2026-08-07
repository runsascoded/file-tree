/** Tests for `GcsStore`. Uses a hand-rolled fake GCS server (fetch impl
 *  that translates the S3-compat XML API into calls against an
 *  in-memory `MockStore`). Runs the full conformance harness through it
 *  in all three auth modes (unsigned, HMAC, bearer), plus targeted
 *  assertions on URL shape, auth-header shape, and presign shape. */
import { describe, expect, it } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { GcsStore } from '../src/stores/gcs'
import type { Range, Store } from '../src/types'
import { CONFORMANCE_FIXTURE, runStoreConformance } from '../src/test/conformance'

/** Fake `fetch` for GCS's S3-interop endpoint. Path-style URLs at
 *  `storage.googleapis.com`. Translates ListObjectsV2 + GetObject
 *  requests into calls against an in-memory `MockStore`. */
function fakeGcsFetch(backing: Store, bucket: string) {
  const expectedHost = 'storage.googleapis.com'
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
    // aws4fetch signs then calls global fetch with a `Request`; other
    // callers pass a URL string. Normalize both — reading `.url` gives
    // us the full URL for a Request, whereas `.toString()` yields
    // `[object Request]` (a bug that dogged the S3 fake fetch too).
    let urlStr: string
    let headers: Headers
    if (input instanceof Request) {
      urlStr = input.url
      headers = new Headers(input.headers)
    } else {
      urlStr = typeof input === 'string' ? input : (input as URL).toString()
      headers = new Headers(init?.headers)
    }
    const url = new URL(urlStr)
    if (url.host !== expectedHost) {
      return new Response(`unexpected host: ${url.host}`, { status: 400 })
    }
    // Path-style: /<bucket>/<key>
    const path = url.pathname.replace(/^\//, '')
    const slash = path.indexOf('/')
    const bkt = slash === -1 ? path : path.slice(0, slash)
    const rest = slash === -1 ? '' : path.slice(slash + 1)
    if (bkt !== bucket) {
      return new Response(`unexpected bucket: ${bkt}`, { status: 400 })
    }

    // ListObjectsV2: /<bucket>/?list-type=2&prefix=...
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
        // GCS's XML API uses the historical S3 XMLNS.
        '<ListBucketResult xmlns="http://doc.s3.amazonaws.com/2006-03-01">',
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

    // GetObject: /<bucket>/<key>[Range: bytes=a-b]
    const key = decodeURIComponent(rest)
    const range = parseRange(headers.get('Range'))
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

describe('GcsStore (conformance via fake GCS fetch — unsigned)', () => {
  runStoreConformance(() => {
    const backing = MockStore(CONFORMANCE_FIXTURE, { pageSize: 3 })
    return GcsStore({
      bucket: 'test-bucket',
      fetch: fakeGcsFetch(backing, 'test-bucket'),
    })
  })
})

describe('GcsStore (conformance via fake GCS fetch — bearer)', () => {
  runStoreConformance(() => {
    const backing = MockStore(CONFORMANCE_FIXTURE, { pageSize: 3 })
    return GcsStore({
      bucket: 'test-bucket',
      getToken: () => 'fake-oauth-token',
      fetch: fakeGcsFetch(backing, 'test-bucket'),
    })
  })
})

describe('GcsStore (conformance via fake GCS fetch — HMAC/SigV4)', () => {
  runStoreConformance(() => {
    const backing = MockStore(CONFORMANCE_FIXTURE, { pageSize: 3 })
    // aws4fetch uses global fetch, so patch it for the harness. Restore
    // in a `finally` inside the wrapper below is unnecessary here — the
    // harness's `makeStore` runs isolated per-test and we only wrap the
    // fetch call, not the environment. Instead, we build a `Store`
    // whose `list`/`get` delegate to a `GcsStore` configured with a
    // fetch that intercepts aws4fetch's calls. Since aws4fetch signs
    // then uses global fetch, we set it here via monkey-patch on the
    // AwsClient — but GcsStore constructs its own signer, so the
    // cleanest way is via a stub global-fetch that only activates
    // during the wrapped call.
    const gcsFetch = fakeGcsFetch(backing, 'test-bucket')
    const inner = GcsStore({
      bucket: 'test-bucket',
      accessKeyId: 'GOOG1EFAKEKEY',
      secretAccessKey: 'FAKE_SECRET',
    })
    // Wrap the store so we can patch global fetch around each call
    // (aws4fetch's `AwsClient.fetch` uses global fetch internally).
    const originalFetch = globalThis.fetch
    const wrap = <T>(fn: () => Promise<T>): Promise<T> => {
      globalThis.fetch = gcsFetch
      return fn().finally(() => {
        globalThis.fetch = originalFetch
      })
    }
    return {
      list: (prefix, opts) => wrap(() => inner.list(prefix, opts)),
      get: (path, range) => wrap(() => inner.get(path, range)),
      capabilities: inner.capabilities,
    }
  })
})

describe('GcsStore (request shape)', () => {
  it('lists from path-style URL at storage.googleapis.com by default', async () => {
    const calls: string[] = []
    const store = GcsStore({
      bucket: 'my-bucket',
      fetch: async (url) => {
        calls.push(url.toString())
        return new Response('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
      },
    })
    await store.list('')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^https:\/\/storage\.googleapis\.com\/my-bucket\/\?/)
    expect(calls[0]).toContain('list-type=2')
    expect(calls[0]).toContain('delimiter=%2F')
  })

  it('honors custom endpoint override', async () => {
    const calls: string[] = []
    const store = GcsStore({
      bucket: 'b',
      endpoint: 'https://custom.example.com',
      fetch: async (url) => {
        calls.push(url.toString())
        return new Response('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
      },
    })
    await store.list('')
    expect(calls[0]).toMatch(/^https:\/\/custom\.example\.com\/b\/\?/)
  })

  it('sends Range header on get', async () => {
    const captured: { url: string; headers: Headers }[] = []
    const store = GcsStore({
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
    const store = GcsStore({
      bucket: 'b',
      fetch: async () => new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }),
    })
    await expect(store.get('missing.txt')).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})

describe('GcsStore (bearer auth)', () => {
  it('attaches Authorization: Bearer <token> to list requests', async () => {
    let capturedAuth: string | null = null
    const store = GcsStore({
      bucket: 'b',
      getToken: () => 'my-token',
      fetch: async (_url, init) => {
        capturedAuth = new Headers(init?.headers).get('Authorization')
        return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
      },
    })
    await store.list('')
    expect(capturedAuth).toBe('Bearer my-token')
  })

  it('attaches Authorization: Bearer <token> to get requests, preserving Range', async () => {
    const captured: Headers[] = []
    const store = GcsStore({
      bucket: 'b',
      getToken: async () => 'async-token',
      fetch: async (_url, init) => {
        captured.push(new Headers(init?.headers))
        return new Response(new Uint8Array([0]), { status: 206, headers: { 'Content-Range': 'bytes 0-0/1' } })
      },
    })
    await store.get('foo.txt', { offset: 0, length: 1 })
    expect(captured[0].get('Authorization')).toBe('Bearer async-token')
    expect(captured[0].get('Range')).toBe('bytes=0-0')
  })

  it('re-invokes getToken per request (so caller can refresh)', async () => {
    let n = 0
    const store = GcsStore({
      bucket: 'b',
      getToken: () => `token-${n++}`,
      fetch: async (_url, _init) =>
        new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'),
    })
    await store.list('')
    await store.list('')
    expect(n).toBe(2)
  })
})

describe('GcsStore (HMAC auth)', () => {
  it('signs requests with SigV4 (Authorization: AWS4-HMAC-SHA256 ...)', async () => {
    let capturedAuth: string | null = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      // aws4fetch signs then calls global fetch with a Request whose
      // headers already carry the SigV4 Authorization. Read from the
      // Request; fall back to init.headers for other callers.
      const headers = input instanceof Request
        ? new Headers(input.headers)
        : new Headers((init as RequestInit | undefined)?.headers)
      capturedAuth = headers.get('Authorization')
      return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
    }
    try {
      const store = GcsStore({
        bucket: 'b',
        accessKeyId: 'GOOG1EFAKEKEY',
        secretAccessKey: 'FAKE_SECRET',
      })
      await store.list('')
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(capturedAuth).toMatch(/^AWS4-HMAC-SHA256 Credential=GOOG1EFAKEKEY\/\d{8}\/auto\/s3\/aws4_request/)
    expect(capturedAuth).toContain('SignedHeaders=')
    expect(capturedAuth).toContain('Signature=')
  })
})

describe('GcsStore (getUrl / getDownloadUrl)', () => {
  it('exposes getUrl on unsigned (public) bucket', () => {
    const store = GcsStore({ bucket: 'open-data' })
    expect(store.getUrl).toBeTypeOf('function')
    expect(store.getUrl!('data/2024/file.csv'))
      .toBe('https://storage.googleapis.com/open-data/data/2024/file.csv')
    expect(store.getDownloadUrl).toBeUndefined()
  })

  it('omits getUrl in bearer mode (bearer tokens can\'t be embedded in URLs)', () => {
    const store = GcsStore({ bucket: 'b', getToken: () => 't' })
    expect(store.getUrl).toBeUndefined()
    expect(store.getDownloadUrl).toBeUndefined()
  })

  it('omits getUrl in HMAC mode; exposes SigV4 presign as getDownloadUrl', async () => {
    const store = GcsStore({
      bucket: 'priv',
      accessKeyId: 'GOOG1EFAKEKEY',
      secretAccessKey: 'FAKE_SECRET',
    })
    expect(store.getUrl).toBeUndefined()
    expect(store.getDownloadUrl).toBeTypeOf('function')
    const url = new URL(await store.getDownloadUrl!('data/2024/x.csv'))
    expect(url.origin).toBe('https://storage.googleapis.com')
    expect(url.pathname).toBe('/priv/data/2024/x.csv')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="x.csv"')
  })

  it('honors per-call expiresIn override', async () => {
    const store = GcsStore({
      bucket: 'b',
      accessKeyId: 'GOOG1EFAKEKEY',
      secretAccessKey: 'FAKE_SECRET',
      presignExpiresIn: 60,
    })
    const def = new URL(await store.getDownloadUrl!('x.txt'))
    const overridden = new URL(await store.getDownloadUrl!('x.txt', { expiresIn: 7200 }))
    expect(def.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(overridden.searchParams.get('X-Amz-Expires')).toBe('7200')
  })

  it('enforces prefix allow-list before signing', async () => {
    const store = GcsStore({
      bucket: 'b',
      prefixes: ['data/'],
      accessKeyId: 'GOOG1EFAKEKEY',
      secretAccessKey: 'FAKE_SECRET',
    })
    await expect(store.getDownloadUrl!('secret/key')).rejects.toThrow(/not under any allowed prefix/)
  })
})

describe('GcsStore (scoped-prefix virtual root)', () => {
  it('synthesizes a dir per allowed prefix on list("")', async () => {
    const store = GcsStore({
      bucket: 'b',
      prefixes: ['listing/', 'snapshots/'],
      fetch: async () => { throw new Error('fetch should not be called for virtual root') },
    })
    const r = await store.list('')
    expect(r.entries).toEqual([
      { key: 'listing/', isDir: true },
      { key: 'snapshots/', isDir: true },
    ])
  })

  it('rejects list outside allowed prefixes', async () => {
    const store = GcsStore({
      bucket: 'b',
      prefixes: ['allowed/'],
      fetch: async () => new Response('', { status: 200 }),
    })
    await expect(store.list('forbidden/')).rejects.toThrow(/not under any allowed prefix/)
  })
})
