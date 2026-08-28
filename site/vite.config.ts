import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

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

// Hash of "@rdub/file-tree-site" → mod 1000 → 8731 (one-time pick).
// CLAUDE.md: each project picks its own port; avoid Vite's default 5173.
const PORT = 8731

export default defineConfig({
  plugins: [react(), jqWasm()],
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
