/** Tests for `HttpStore` (client) + `createHandlers` (server) presign
 *  wiring. The handlers loop directly to the client via a `fetch` shim,
 *  exercising the `/presign` round-trip end-to-end (no real network). */
import { describe, expect, it, vi } from 'vitest'
import { MockStore } from '../src/stores/mock'
import { HttpStore } from '../src/stores/http'
import { createHandlers } from '../src/server'
import type { Store } from '../src/types'

const FIXTURE = { 'a.txt': 'hello', 'sub/b.txt': 'world' }

/** Adapt a `Handlers` to a `fetch`-shaped function the `HttpStore` can
 *  consume. Mismatching paths fall through to a 404 (so we exercise the
 *  base-path stripping). */
function fetchFromHandlers(store: Store, opts: { basePath: string }): typeof globalThis.fetch {
  const handlers = createHandlers(store, opts)
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const req = new Request(url)
    const r = await handlers.handle(req)
    if (r) return r
    return new Response('not found', { status: 404 })
  }) as typeof globalThis.fetch
}

describe('HttpStore presign opt-in', () => {
  it('omits getDownloadUrl when presign:false (default)', () => {
    const client = HttpStore('https://example.com/v1/files')
    expect(client.getDownloadUrl).toBeUndefined()
  })

  it('exposes getDownloadUrl when presign:true', () => {
    const client = HttpStore('https://example.com/v1/files', { presign: true })
    expect(client.getDownloadUrl).toBeTypeOf('function')
  })
})

describe('/presign endpoint', () => {
  it('round-trips a signed URL from a store that implements getDownloadUrl', async () => {
    const upstream: Store = {
      ...MockStore(FIXTURE),
      async getDownloadUrl(path, opts) {
        return `https://signed.example/${path}?exp=${opts?.expiresIn ?? 3600}`
      },
    }
    const fetchFn = fetchFromHandlers(upstream, { basePath: '/v1/files' })
    const client = HttpStore('https://h.example/v1/files', { fetch: fetchFn, presign: true })
    expect(await client.getDownloadUrl!('a.txt')).toBe('https://signed.example/a.txt?exp=3600')
    expect(await client.getDownloadUrl!('sub/b.txt', { expiresIn: 60 })).toBe('https://signed.example/sub/b.txt?exp=60')
  })

  it('returns 404 when upstream store omits getDownloadUrl', async () => {
    const upstream = MockStore(FIXTURE)
    const fetchFn = fetchFromHandlers(upstream, { basePath: '/v1/files' })
    const client = HttpStore('https://h.example/v1/files', { fetch: fetchFn, presign: true })
    await expect(client.getDownloadUrl!('a.txt')).rejects.toThrow(/404 .*presign not supported/)
  })

  it('returns 400 when path query param is missing', async () => {
    const upstream: Store = {
      ...MockStore(FIXTURE),
      async getDownloadUrl(p) { return `signed://${p}` },
    }
    const handlers = createHandlers(upstream, { basePath: '/v1/files' })
    const resp = await handlers.handle(new Request('https://h.example/v1/files/presign'))
    expect(resp).not.toBeNull()
    expect(resp!.status).toBe(400)
    expect(await resp!.json()).toEqual({ error: 'path required' })
  })

  it('surfaces store errors as 500', async () => {
    const upstream: Store = {
      ...MockStore(FIXTURE),
      async getDownloadUrl() { throw new Error('signing failed') },
    }
    const fetchFn = fetchFromHandlers(upstream, { basePath: '/v1/files' })
    const client = HttpStore('https://h.example/v1/files', { fetch: fetchFn, presign: true })
    await expect(client.getDownloadUrl!('a.txt')).rejects.toThrow(/500 .*signing failed/)
  })

  it('forwards expiresIn as the `expires` query param', async () => {
    const captured = vi.fn(async (_p: string, opts?: { expiresIn?: number }) => `signed://${opts?.expiresIn}`)
    const upstream: Store = {
      ...MockStore(FIXTURE),
      getDownloadUrl: captured,
    }
    const fetchFn = fetchFromHandlers(upstream, { basePath: '/v1/files' })
    const client = HttpStore('https://h.example/v1/files', { fetch: fetchFn, presign: true })
    await client.getDownloadUrl!('a.txt', { expiresIn: 900 })
    expect(captured).toHaveBeenCalledWith('a.txt', { expiresIn: 900 })
    await client.getDownloadUrl!('a.txt')
    expect(captured).toHaveBeenLastCalledWith('a.txt', undefined)
  })
})

describe('/get Content-Disposition', () => {
  const handlers = createHandlers(MockStore({ 'doc.pdf': '%PDF-1.4' }), { basePath: '/v1/files' })
  const disposition = async (qs: string) => {
    const resp = await handlers.handle(new Request(`https://h.example/v1/files/get?${qs}`))
    return resp!.headers.get('Content-Disposition')
  }

  it('defaults to attachment, so a download keeps its name', async () => {
    expect(await disposition('path=doc.pdf')).toBe('attachment; filename="doc.pdf"')
  })

  it('is inline with ?inline=1, so an <iframe> renders the PDF', async () => {
    expect(await disposition('path=doc.pdf&inline=1')).toBe('inline; filename="doc.pdf"')
  })

  it('HttpStore.getUrl asks for inline only when told to', () => {
    const client = HttpStore('https://h.example/v1/files')
    expect(client.getUrl!('a b.pdf')).toBe('https://h.example/v1/files/get?path=a%20b.pdf')
    expect(client.getUrl!('a b.pdf', { inline: true })).toBe('https://h.example/v1/files/get?path=a%20b.pdf&inline=1')
  })
})

describe('prefix allow-list denials', () => {
  // A store whose allow-list excludes the path: `/list` and `/get` answer
  // 404 (not 500), and the body names the path but not the allow-list.
  const denying: Store = {
    ...MockStore(FIXTURE),
    async list(prefix) { throw Object.assign(new Error(`list prefix "${prefix}" not under an allowed prefix`), { name: 'ForbiddenPathError' }) },
    async get(path) { throw Object.assign(new Error(`get path "${path}" not under an allowed prefix`), { name: 'ForbiddenPathError' }) },
  }
  const handlers = createHandlers(denying, { basePath: '/v1/files' })
  const call = async (qs: string) => {
    const resp = await handlers.handle(new Request(`https://h.example/v1/files/${qs}`))
    return { status: resp!.status, body: await resp!.json() }
  }

  it('maps a denied list to 404', async () => {
    expect(await call('list?prefix=.dvc/')).toEqual({ status: 404, body: { error: 'list prefix ".dvc/" not under an allowed prefix' } })
  })

  it('maps a denied get to 404', async () => {
    expect(await call('get?path=.dvc/x')).toEqual({ status: 404, body: { error: 'get path ".dvc/x" not under an allowed prefix' } })
  })
})
