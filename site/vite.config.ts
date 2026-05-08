import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hash of "@rdub/file-tree-site" → mod 1000 → 8731 (one-time pick).
// CLAUDE.md: each project picks its own port; avoid Vite's default 5173.
const PORT = 8731

export default defineConfig({
  plugins: [react()],
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
