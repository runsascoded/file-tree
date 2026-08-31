import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { createTableHandlers } from '@rdub/file-tree/server/sqlite'
import { memoryBlockCache } from '@rdub/file-tree/sqlite/blockCache'
import { CATALOG_SQLITE } from './src/fixtures/catalog'

const require_ = createRequire(import.meta.url)

/** Serve + emit `jq-web`'s wasm at `/jq.wasm`.
 *
 *  It ships inside the package rather than as an importable asset, so
 *  Vite never sees it and it isn't in the site's own `node_modules`
 *  (it's the library's optional peer). Paired with `<base href="/">` in
 *  index.html, this is what makes the JSON/YAML jq filter work. */
function jqWasm() {
  const file = () => readFileSync(require_.resolve('jq-web/jq.wasm'))
  return {
    name: 'jq-wasm',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/jq.wasm')) return next()
        res.setHeader('Content-Type', 'application/wasm')
        res.end(file())
      })
    },
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: Buffer }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'jq.wasm', source: file() })
    },
  }
}

/** A dev-time backend for the SQLite viewer's *remote* mode.
 *
 *  `/mock` is a static site, so its SQLite demo runs the engine in the
 *  browser. That's mode 1, and it's the mode with the worse constant
 *  factors: SQLite's page reads are dependent, so each one is a
 *  round-trip that can't be pipelined. The interesting comparison is
 *  against an engine sitting next to the bytes — which in production is
 *  a Cloudflare Worker with an R2 binding, and here is Node.
 *
 *  Same library code either way: `createTableHandlers` is what a Worker
 *  would mount, and the browser talks to it through `httpTableCatalog`.
 *  Dev only — a static build has nowhere to run this, so the demo hides
 *  the toggle when `import.meta.env.DEV` is false. */
function tableApi() {
  const handlers = createTableHandlers(
    MockStore({ 'samples/catalog.sqlite': CATALOG_SQLITE }),
    {
      wasm: { wasmBinary: readFileSync(require_.resolve('wa-sqlite/dist/wa-sqlite-async.wasm')) },
      basePath: '/api/tables',
      // In a Worker this would be `workersBlockCache()` — blocks in
      // `caches.default`, shared by every isolate in the colo, so an
      // evicted isolate costs a wasm compile and no reads. Here the
      // middleware is one long-lived Node process, so a `Map` is the
      // equivalent: shared across requests, gone on restart.
      blockCache: memoryBlockCache(),
    },
  )
  return {
    name: 'table-api',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string; headers: Record<string, string | string[] | undefined> }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/tables/')) return next()
        void (async () => {
          const response = await handlers.handle(new Request(`http://localhost${req.url}`))
          if (!response) return next()
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(await response.text())
        })()
      })
    },
  }
}

// Hash of "@rdub/file-tree-site" → mod 1000 → 8731 (one-time pick).
// CLAUDE.md: each project picks its own port; avoid Vite's default 5173.
const PORT = 8731

export default defineConfig({
  plugins: [react(), jqWasm(), tableApi()],
  // `@rdub/file-tree` is linked (`link:..`), so its `react-router-dom`
  // import resolves against the *lib's* node_modules, not the site's —
  // two copies, two `Router` contexts, and `useLocation` inside
  // `<FileTree>` throws "may be used only in the context of a <Router>".
  // Only bites the build: the dev server happens to collapse them, so
  // this fails exclusively in production. Same hazard for react itself
  // (duplicate dispatcher → invalid-hook-call), hence all three.
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: PORT,
    strictPort: true,
    host: true,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',') ?? [],
  },
  preview: {
    port: PORT,
  },
})
