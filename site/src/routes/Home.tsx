import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5em' }}>
      <h1>@rdub/file-tree</h1>
      <p>
        Storage-agnostic file/directory tree browser. Plug a <code>Store</code> implementation
        (R2, HTTP, mock, …) into a React component and get a directory listing + file viewer.
      </p>

      <h2>Live demos</h2>
      <ul>
        <li>
          <Link to="/mock">MockStore</Link> — in-memory fixture, no server. Inspects an
          object literal as if it were a real bucket. Best for understanding the UI without
          infra.
        </li>
        <li>
          <Link to="/http">HttpStore</Link> — talks to a backend that exposes the file-tree
          HTTP protocol. (Demo backend: see <code>site/worker/</code> in the repo.)
        </li>
        <li>
          <Link to="/s3">S3</Link> — browse any S3 bucket directly from your browser via{' '}
          <code>S3Store</code>. Public buckets work unsigned; paste an access key for private.
          Credentials persist in LocalStorage on your device only.
        </li>
        <li>
          <Link to="/r2">R2</Link> — browse a Cloudflare R2 bucket through its S3-compatible API.
          Same client, different endpoint.
        </li>
      </ul>

      <h2>The <code>Store</code> interface</h2>
      <pre><code>{`interface Store {
  list(prefix: string, opts?: { cursor?: string; limit?: number }):
    Promise<{ entries: Entry[]; cursor?: string }>
  get(path: string, range?: { offset: number; length: number }):
    Promise<{ bytes: Uint8Array; totalSize?: number; contentType?: string }>
  capabilities?: { range: boolean }
}`}</code></pre>

      <h2>Quick start</h2>
      <p>Plug a store into the React component:</p>
      <pre><code>{`import { FileTree } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'

const store = MockStore({
  'README.md': '# hi',
  'data/q1.csv': 'a,b\\n1,2\\n',
})

<Route path="/files/*" element={
  <FileTree store={store} routeBase="/files" />
} />`}</code></pre>

      <h2>Currently shipped Stores</h2>
      <ul>
        <li><code>R2Store(bucket, &#123; prefixes? &#125;)</code> — Cloudflare Workers R2 binding</li>
        <li><code>HttpStore(apiBase)</code> — browser → server proxy</li>
        <li><code>MockStore(input)</code> — in-memory fixture (this demo + tests)</li>
      </ul>
      <p>Roadmap: <code>S3Store</code>, <code>GitHubStore</code>, <code>GitLabStore</code>, plus static-bucket variants of each.</p>

      <h2>Conformance harness</h2>
      <p>
        Any <code>Store</code> implementation can plug into <code>runStoreConformance(makeStore)</code>{' '}
        and get a battery of behavioral tests for free. New backends are added with confidence
        that they match every existing impl on listings, pagination, range reads, and 404 handling.
      </p>
    </div>
  )
}
