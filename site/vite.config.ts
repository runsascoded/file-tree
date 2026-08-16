import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hash of "@rdub/file-tree-site" → mod 1000 → 8731 (one-time pick).
// CLAUDE.md: each project picks its own port; avoid Vite's default 5173.
const PORT = 8731

export default defineConfig({
  plugins: [react()],
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
