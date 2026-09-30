/** Server half of file-tree's remote tree protocol: serve any
 *  `TreeSource` over HTTP, for `httpTreeSource` to read.
 *
 *  Mount beside `createHandlers` in a Cloudflare Worker (or Node). It
 *  wraps *any* source, so the server can sit over a `snapshotTreeSource`
 *  (serve a bucket's published snapshots from a Worker with an R2
 *  binding — colocated range reads instead of a browser's round-trips),
 *  a `walkTreeSource` (walk a private bucket server-side), or a scan
 *  dispatcher. The handler never learns which.
 *
 *  Endpoints (JSON; the matching client is `httpTreeSource`):
 *
 *      GET  /children?path=&depth=&snapshot=   → TreeLevel
 *      GET  /snapshots                         → { snapshots: Snapshot[] }
 *      GET  /diff?a=&b=&path=&depth=           → DiffLevel
 *      POST /scan?path=                        → ScanJob
 *      GET  /scan/status?id=                   → ScanJob
 *
 *  A method the source lacks answers 404 `{ error }`. Errors carry the
 *  thrown error's `name`, so the client re-throws the same typed error
 *  (`NotFoundError`/`SnapshotNotFoundError` → 404, `TreeTooLargeError` →
 *  413 with `nodesWalked`).
 */
import type { ScanJob, ScanRequest, TreeSource } from '../renderers/treeSource'
import type { Handlers } from './index'

export interface CreateTreeHandlersOptions {
  /** Path the endpoints hang off. Defaults to `/`. */
  basePath?: string
  /** CORS origin. Defaults to `*`; `null` skips the headers. */
  corsOrigin?: string | null
  /** Scan dispatch, when the source itself has none (or to override its
   *  own): whatever "rescan" means here — enqueue a Queue, a
   *  `workflow_dispatch`, a POST to a scan server. */
  scanner?: {
    scan(req: ScanRequest): Promise<ScanJob>
    status(id: string): Promise<ScanJob>
  }
  /** Cap on `depth`, so a client can't ask for a whole tree in one
   *  level. Default 4. */
  maxDepth?: number
}

const DEFAULT_MAX_DEPTH = 4

export function createTreeHandlers(source: TreeSource, opts: CreateTreeHandlersOptions = {}): Handlers {
  const base = (opts.basePath ?? '').replace(/\/+$/, '')
  const cors = opts.corsOrigin === undefined ? '*' : opts.corsOrigin
  const corsHeaders: Record<string, string> = cors ? { 'Access-Control-Allow-Origin': cors } : {}
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const scan = opts.scanner?.scan ?? source.scan?.bind(source)
  const scanStatus = opts.scanner?.status ?? source.scanStatus?.bind(source)

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
  const unsupported = (what: string) => json({ error: `${what} not supported by this tree source` }, 404)

  return {
    async handle(request: Request): Promise<Response | null> {
      const url = new URL(request.url)
      const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null
      if (route !== '/children' && route !== '/snapshots' && route !== '/diff' && route !== '/scan' && route !== '/scan/status') {
        return null
      }
      const q = url.searchParams
      const opt = (k: string) => q.get(k) || undefined

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        })
      }

      try {
        switch (route) {
          case '/children': {
            const path = opt('path'), snapshot = opt('snapshot')
            const depth = clampInt(q.get('depth'), 1, 1, maxDepth)
            return json(await source.children({
              ...(path ? { path } : {}), depth, ...(snapshot ? { snapshot } : {}),
            }))
          }
          case '/snapshots':
            if (!source.snapshots) return unsupported('snapshots')
            return json({ snapshots: await source.snapshots() })
          case '/diff': {
            if (!source.diff) return unsupported('diff')
            const a = opt('a'), b = opt('b'), path = opt('path')
            if (!a || !b) return json({ error: 'a and b required' }, 400)
            return json(await source.diff({
              a, b, ...(path ? { path } : {}), depth: clampInt(q.get('depth'), 1, 1, maxDepth),
            }))
          }
          case '/scan': {
            if (request.method !== 'POST') return json({ error: 'POST required' }, 405)
            if (!scan) return unsupported('scan')
            const path = opt('path')
            return json(await scan(path ? { path } : {}))
          }
          case '/scan/status': {
            if (!scanStatus) return unsupported('scan')
            const id = opt('id')
            if (!id) return json({ error: 'id required' }, 400)
            return json(await scanStatus(id))
          }
        }
      } catch (e) {
        return errorJson(e, json)
      }
    },
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function errorJson(e: unknown, json: (body: unknown, status: number) => Response): Response {
  // By `name`, never `instanceof`: subpath-export bundles each carry
  // their own copy of the error classes.
  if (!(e instanceof Error)) return json({ error: String(e) }, 500)
  switch (e.name) {
    case 'NotFoundError':
      return json({ error: e.message, name: e.name }, 404)
    case 'SnapshotNotFoundError':
      return json({ error: e.message, name: e.name, snapshot: (e as Error & { snapshot?: string }).snapshot }, 404)
    case 'TreeTooLargeError':
      return json({ error: e.message, name: e.name, nodesWalked: (e as Error & { nodesWalked?: number }).nodesWalked }, 413)
    default:
      return json({ error: e.message }, 500)
  }
}
