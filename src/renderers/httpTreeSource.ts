/** A `TreeSource` behind an HTTP endpoint — the client half of
 *  `createTreeHandlers` (`@rdub/file-tree/server/tree`), as
 *  `httpTableCatalog` is `createTableHandlers`'.
 *
 *  Format- and backend-blind: whatever the server wraps (a snapshot
 *  library, a live walk, a scan dispatcher) arrives as the same
 *  `TreeLevel`/`DiffLevel`/`ScanJob` JSON. Typed errors survive the hop
 *  by name: the server sends the thrown error's `name`, and this
 *  re-throws `NotFoundError`, `SnapshotNotFoundError`, or
 *  `TreeTooLargeError` accordingly.
 */
import { NotFoundError } from '../types'
import {
  SnapshotNotFoundError, TreeTooLargeError,
  type ChildrenRequest, type DiffLevel, type DiffRequest, type ScanJob, type ScanRequest,
  type Snapshot, type TreeLevel, type TreeSource, type TreeSourceCapabilities,
} from './treeSource'

export interface HttpTreeSourceOptions {
  /** Base URL the endpoints hang off, e.g. `https://api.example.com/tree`. */
  baseUrl: string
  /** What the server's source can do. The client can't discover this
   *  synchronously, and guessing wrong means offering chrome that fails —
   *  so it's declared, mirroring the server's source. Default: a plain
   *  lazy tree (`history`/`diff`/`scan` off); methods for disabled
   *  capabilities are omitted. */
  capabilities?: Partial<TreeSourceCapabilities>
  /** Auth headers, an `AbortSignal`, or a test double. Defaults to
   *  global `fetch`. */
  fetch?: typeof fetch
}

interface ErrorBody { error?: string; name?: string; snapshot?: string; nodesWalked?: number }

export function httpTreeSource(opts: HttpTreeSourceOptions): TreeSource {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const capabilities: TreeSourceCapabilities = {
    history: false, diff: false, scan: false, lazy: true, ...opts.capabilities,
  }

  async function call<T>(route: string, params: Record<string, string | number | undefined>, init?: RequestInit): Promise<T> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    const res = await doFetch(`${base}${route}${qs.size ? `?${qs}` : ''}`, init)
    let body: unknown = null
    try { body = await res.json() } catch { /* not JSON — the status line is all there is */ }
    if (res.ok) return body as T
    const b = (body ?? {}) as ErrorBody
    const message = b.error ?? `${res.status} ${res.statusText}`
    switch (b.name) {
      case 'NotFoundError': {
        const e = new NotFoundError('')
        e.message = message
        throw e
      }
      case 'SnapshotNotFoundError': {
        const e = new SnapshotNotFoundError(b.snapshot ?? '')
        e.message = message
        throw e
      }
      case 'TreeTooLargeError':
        throw new TreeTooLargeError(message, b.nodesWalked ?? 0)
      default:
        throw new Error(message)
    }
  }

  const children = (req: ChildrenRequest = {}) =>
    call<TreeLevel>('/children', { path: req.path, depth: req.depth, snapshot: req.snapshot })
  const snapshots = async (): Promise<readonly Snapshot[]> =>
    (await call<{ snapshots: Snapshot[] }>('/snapshots', {})).snapshots
  const diff = (req: DiffRequest) =>
    call<DiffLevel>('/diff', { a: req.a, b: req.b, path: req.path, depth: req.depth })
  const scan = (req: ScanRequest = {}) =>
    call<ScanJob>('/scan', { path: req.path }, { method: 'POST' })
  const scanStatus = (id: string) => call<ScanJob>('/scan/status', { id })

  return {
    capabilities,
    children,
    ...(capabilities.history ? { snapshots } : {}),
    ...(capabilities.diff ? { diff } : {}),
    ...(capabilities.scan ? { scan, scanStatus } : {}),
  }
}
