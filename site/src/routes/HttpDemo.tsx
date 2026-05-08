import { useMemo } from 'react'
import { FileTree } from '@rdub/file-tree/react'
import { HttpStore } from '@rdub/file-tree/stores/http'

// Default points at the demo worker (TODO: replace with deployed URL).
// Override via VITE_HTTP_DEMO_BASE for local development.
const API_BASE = import.meta.env.VITE_HTTP_DEMO_BASE
  ?? 'http://localhost:8732/v1/files'

export function HttpDemo() {
  const store = useMemo(() => HttpStore(API_BASE), [])
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <FileTree
        store={store}
        routeBase="/http"
        title="HttpStore demo"
      />
      <details style={{ marginTop: '2em', fontSize: '0.9em', opacity: 0.85 }}>
        <summary>How this works</summary>
        <p>
          <code>HttpStore</code> talks to a backend that exposes the file-tree HTTP protocol
          (see <code>site/worker/src/index.ts</code> for the reference implementation —
          a Cloudflare Worker wrapping <code>R2Store</code> over a small demo bucket).
        </p>
        <p>
          Endpoints (under <code>{API_BASE}</code>):
        </p>
        <pre><code>{`GET /list?prefix=<p>&cursor=<c>&limit=<n>
GET /get?path=<p>                         (Range honored)`}</code></pre>
        <p>
          Backends are pluggable: anything that implements the same <code>Store</code> interface
          can sit behind this same client (R2, S3, GitHub, GitLab, local FS, …).
        </p>
      </details>
    </div>
  )
}
