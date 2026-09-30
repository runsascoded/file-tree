/** `diskTreeTreeSource` against a fake disk-tree server: a `fetch` double
 *  answering the Flask routes the adapter maps (`~/c/disky`
 *  `src/disk_tree/server.py`: `/api/scan`, `/api/scans/history`,
 *  `/api/compare`, `/api/scan/start`, `/api/scan/status/<id>`) with their
 *  real response shapes — extra annotations (`scanned`, `scan_time`,
 *  `rows`, `collapsed_rows`…), `parent` = `'.'` for dirs vs `''` for
 *  root-level files, children sorted by size descending, SQLite-style
 *  times. Scan 7 is `CONFORMANCE_FIXTURE`, so the harness runs over it. */
import { describe, expect, it } from 'vitest'
import { CONFORMANCE_FIXTURE } from '../src/test/conformance'
import { runTreeSourceConformance } from '../src/test/treeConformance'
import { diskTreeTreeSource } from '../src/renderers/diskTreeTreeSource'

const ROOT = 'gcs://fixture'
const BASE = 'http://dt.test'

const byteLen = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v).byteLength : v.byteLength)

/** disk-tree `Row`s for a flat `key → size` bucket: one per file and per
 *  dir, dirs carrying recursive totals; `n_desc` counts self (imported
 *  scans). `path` is relative to the scan root, which is `'.'`. */
function scanRows(files: Record<string, number>, mtime: number) {
  const rows = new Map<string, { path: string; size: number; n_desc: number; kids: Set<string>; kind: 'file' | 'dir' }>()
  const dir = (p: string) => {
    let r = rows.get(p)
    if (!r) { r = { path: p, size: 0, n_desc: 1, kids: new Set(), kind: 'dir' }; rows.set(p, r) }
    return r
  }
  dir('.')
  for (const [key, size] of Object.entries(files)) {
    rows.set(key, { path: key, size, n_desc: 1, kids: new Set(), kind: 'file' })
    const parts = key.split('/')
    for (let i = 0; i < parts.length; i++) {
      const anc = i === 0 ? '.' : parts.slice(0, i).join('/')
      const child = parts.slice(0, i + 1).join('/')
      const a = dir(anc)
      a.size += size
      a.kids.add(child)
      if (i + 1 < parts.length) dir(child)
    }
  }
  for (const r of rows.values()) if (r.kind === 'dir') {
    const count = (p: string): number => [...rows.get(p)!.kids].reduce((s, k) => s + 1 + count(k), 0)
    r.n_desc = 1 + count(r.path)
  }
  return [...rows.values()].map(r => ({
    path: r.path,
    size: r.size,
    mtime,
    kind: r.kind,
    parent: r.path === '.' ? null : r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : r.kind === 'dir' ? '.' : '',
    uri: r.path === '.' ? ROOT : `${ROOT}/${r.path}`,
    n_desc: r.n_desc,
    n_children: r.kids.size,
    depth: r.path === '.' ? 0 : r.path.split('/').length,
  }))
}

type Row = ReturnType<typeof scanRows>[number]

const NEW_FILES = Object.fromEntries(Object.entries(CONFORMANCE_FIXTURE).map(([k, v]) => [k, byteLen(v)]))
const OLD_FILES: Record<string, number> = {
  ...Object.fromEntries(Object.entries(NEW_FILES).filter(([k]) => !k.startsWith('data/2025/'))),
  'old/gone.txt': 40,
}
const SCANS: Record<string, { time: string; rows: Row[] }> = {
  7: { time: '2026-08-01 00:00:00', rows: scanRows(NEW_FILES, 1_784_073_600) },
  5: { time: '2026-07-01 00:00:00', rows: scanRows(OLD_FILES, 1_780_272_000) },
}

const rel = (uri: string) => (uri === ROOT ? '.' : uri.startsWith(`${ROOT}/`) ? uri.slice(ROOT.length + 1) : null)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Direct children of `p` in `rows`, re-pathed relative to `p` as the
 *  server does when viewing a subdir. */
function childrenOf(rows: Row[], p: string) {
  return rows
    .filter(r => r.path !== '.' && (p === '.' ? !r.path.includes('/') : r.path.startsWith(`${p}/`) && !r.path.slice(p.length + 1).includes('/')))
    .map(r => ({ ...r, path: p === '.' ? r.path : r.path.slice(p.length + 1), parent: p === '.' ? r.parent : '.' }))
}

interface Fake { fetch: typeof fetch; calls: string[] }

function fakeServer(): Fake {
  const calls: string[] = []
  const jobs = new Map<string, { path: string; status: string }>()
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.pathname}${url.search}`)
    const q = url.searchParams

    if (url.pathname === '/api/scan') {
      const scanId = q.get('scan_id') ?? '7'
      const scan = SCANS[scanId]
      if (!scan) return json({ error: 'Scan not found' }, 404)
      const p = rel((q.get('uri') ?? '/').replace(/\/+$/, ''))
      const root = p === null ? undefined : scan.rows.find(r => r.path === p)
      if (!root || p === null) return json({ error: 'URI not found in scan', uri: q.get('uri'), scan_path: ROOT }, 404)
      const children = childrenOf(scan.rows, p)
        .map(c => ({ ...c, scanned: true, scan_time: scan.time }))
        .sort((a, b) => b.size - a.size)
      return json({
        root: { ...root, path: '.', parent: null },
        children,
        rows: children,
        time: scan.time,
        scan_path: ROOT,
        scan_status: 'full',
        error_count: null,
        error_paths: null,
        collapsed_rows: null,
      })
    }

    if (url.pathname === '/api/scans/history') {
      return json(['7', '5'].map(id => {
        const r = SCANS[id]!.rows.find(x => x.path === '.')!
        return { id: Number(id), path: ROOT, time: SCANS[id]!.time, size: r.size, n_children: r.n_children, n_desc: r.n_desc, scan_path: ROOT }
      }))
    }

    if (url.pathname === '/api/compare') {
      const s1 = SCANS[q.get('scan1') ?? ''], s2 = SCANS[q.get('scan2') ?? '']
      if (!s1 || !s2) return json({ error: 'Scan not found' }, 404)
      const p = rel((q.get('uri') ?? '').replace(/\/+$/, '')) ?? '.'
      const c1 = new Map(childrenOf(s1.rows, p).map(r => [r.path, r]))
      const c2 = new Map(childrenOf(s2.rows, p).map(r => [r.path, r]))
      const rows: Record<string, unknown>[] = []
      for (const [k, r] of c2) if (!c1.has(k)) rows.push({ ...r, uri: `${ROOT}/${k}`, status: 'added', size_delta: r.size })
      for (const [k, r] of c1) if (!c2.has(k)) rows.push({ ...r, uri: `${ROOT}/${k}`, status: 'removed', size_delta: -r.size })
      for (const [k, b] of c2) {
        const a = c1.get(k)
        if (!a) continue
        const changed = a.size !== b.size || a.n_desc !== b.n_desc
        rows.push({
          ...b, uri: `${ROOT}/${k}`,
          size_delta: b.size - a.size, size_old: a.size, n_desc_delta: b.n_desc - a.n_desc, n_desc_old: a.n_desc,
          status: changed ? 'changed' : a.mtime !== b.mtime ? 'touched' : 'unchanged',
        })
      }
      rows.sort((x, y) => Math.abs(y.size_delta as number) - Math.abs(x.size_delta as number))
      const stat = (s: typeof s1) => {
        const r = s.rows.find(x => x.path === p)
        return { size: r?.size ?? null, n_desc: r?.n_desc ?? null }
      }
      return json({
        uri: q.get('uri'),
        scan1: { id: Number(q.get('scan1')), time: s1.time, ...stat(s1), scan_path: ROOT },
        scan2: { id: Number(q.get('scan2')), time: s2.time, ...stat(s2), scan_path: ROOT },
        rows,
        summary: {},
      })
    }

    if (url.pathname === '/api/scan/start' && method === 'POST') {
      const { path } = JSON.parse(String(init?.body)) as { path: string }
      for (const [id, j] of jobs) {
        if (j.path === path && j.status === 'running') return json({ error: 'Scan already in progress', job_id: id }, 409)
      }
      const id = `job${jobs.size + 1}`
      jobs.set(id, { path, status: 'running' })
      return json({ job_id: id, path, status: 'pending' })
    }

    const m = /^\/api\/scan\/status\/(.+)$/.exec(url.pathname)
    if (m) {
      const j = jobs.get(m[1]!)
      if (!j) return json({ error: 'Job not found' }, 404)
      return json({ job_id: m[1], ...j, started: '2026-09-30T12:00:00', output: '', error: '' })
    }
    return json({ error: 'no route' }, 404)
  }
  return { fetch: handler as typeof fetch, calls }
}

const make = (fake = fakeServer()) => diskTreeTreeSource({ baseUrl: `${BASE}/`, uri: ROOT, fetch: fake.fetch })

describe('diskTreeTreeSource', () => {
  runTreeSourceConformance(() => make(), { rootLabel: 'fixture' })

  it('declares full capabilities, and drops scan when asked', () => {
    expect(make().capabilities).toEqual({ history: true, diff: true, scan: true, lazy: true })
    const ro = diskTreeTreeSource({ baseUrl: BASE, uri: ROOT, scan: false, fetch: fakeServer().fetch })
    expect(ro.capabilities).toEqual({ history: true, diff: true, scan: false, lazy: true })
    expect([ro.scan, ro.scanStatus]).toEqual([undefined, undefined])
  })

  it('requests one un-collapsed level at `uri/path`, pinned to a scan id', async () => {
    const fake = fakeServer()
    const src = make(fake)
    const level = await src.children({ path: 'docs', snapshot: '5' })
    expect(fake.calls).toEqual([
      'GET /api/scan?uri=gcs%3A%2F%2Ffixture%2Fdocs&depth=1&expand_single=false&scan_id=5',
    ])
    expect(level).toEqual({
      node: { path: 'docs', name: 'docs', kind: 'dir', size: 34, nChildren: 2, nDesc: 5, mtime: 1_780_272_000 },
      children: [
        { path: 'docs/guide', name: 'guide', kind: 'dir', size: 22, nChildren: 2, nDesc: 3, mtime: 1_780_272_000 },
        { path: 'docs/intro.md', name: 'intro.md', kind: 'file', size: 12, nChildren: 0, nDesc: 1, mtime: 1_780_272_000 },
      ],
      snapshot: '5',
    })
  })

  it('maps history to snapshots, ids stringified and times ISO', async () => {
    expect(await make().snapshots!()).toEqual([
      { id: '7', time: '2026-08-01T00:00:00', size: 343 },
      { id: '5', time: '2026-07-01T00:00:00', size: 375 },
    ])
  })

  it('maps /api/compare rows to diff nodes, sizes by side', async () => {
    const fake = fakeServer()
    const d = await make(fake).diff!({ a: '5', b: '7' })
    expect(fake.calls).toEqual(['GET /api/compare?uri=gcs%3A%2F%2Ffixture&scan1=5&scan2=7&depth=1'])
    expect(d.node).toEqual({
      path: '', name: 'fixture', kind: 'dir', status: 'changed', sizeA: 375, sizeB: 343, nDescA: 14, nDescB: 14,
    })
    expect([...d.children].sort((x, y) => x.path.localeCompare(y.path))).toEqual([
      { path: 'binary.bin', name: 'binary.bin', kind: 'file', status: 'touched', sizeA: 256, sizeB: 256, nDescA: 1, nDescB: 1 },
      { path: 'data', name: 'data', kind: 'dir', status: 'changed', sizeA: 16, sizeB: 24, nDescA: 4, nDescB: 6 },
      { path: 'docs', name: 'docs', kind: 'dir', status: 'touched', sizeA: 34, sizeB: 34, nDescA: 5, nDescB: 5 },
      { path: 'old', name: 'old', kind: 'dir', status: 'removed', sizeA: 40, sizeB: null, nDescA: 2, nDescB: null },
      { path: 'README.md', name: 'README.md', kind: 'file', status: 'touched', sizeA: 29, sizeB: 29, nDescA: 1, nDescB: 1 },
    ])
    const sub = await make().diff!({ a: '5', b: '7', path: 'data' })
    expect(sub.children.find(c => c.status === 'added')).toEqual({
      path: 'data/2025', name: '2025', kind: 'dir', status: 'added', sizeA: null, sizeB: 8, nDescA: null, nDescB: 2,
    })
  })

  it('dispatches a scan of `uri/path`, attaches to an in-flight one, and polls it', async () => {
    const fake = fakeServer()
    const src = make(fake)
    expect(await src.scan!({ path: 'data' })).toEqual({ id: 'job1', status: 'pending', error: null })
    expect(await src.scan!({ path: 'data' })).toEqual({ id: 'job1', status: 'running', error: null })
    expect(await src.scanStatus!('job1')).toEqual({ id: 'job1', status: 'running', error: null })
    expect(fake.calls).toEqual([
      'POST /api/scan/start', 'POST /api/scan/start', 'GET /api/scan/status/job1',
    ])
  })

  it('maps 404s to name-tagged errors', async () => {
    const src = make()
    await expect(src.children({ path: 'nope' })).rejects.toMatchObject({
      name: 'NotFoundError', message: 'gcs://fixture/nope: URI not found in scan',
    })
    await expect(src.diff!({ a: '5', b: '99' })).rejects.toMatchObject({ name: 'SnapshotNotFoundError', snapshot: '5|99' })
    await expect(src.scanStatus!('zzz')).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})
