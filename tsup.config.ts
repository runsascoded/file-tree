import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/react/index.ts',
    'src/stores/index.ts',
    'src/stores/r2.ts',
    'src/stores/http.ts',
    'src/server/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react-router-dom'],
})
