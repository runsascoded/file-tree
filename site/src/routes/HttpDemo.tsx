import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { FileTree } from '@rdub/file-tree/react'
import { HttpStore } from '@rdub/file-tree/stores/http'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'
import { ParquetViewer } from '@rdub/file-tree/renderers/parquet'
import { renderJsonTree } from '@rdub/file-tree/renderers/json'
import { CsvViewer } from '@rdub/file-tree/renderers/csv'
import { NotebookViewer } from '@rdub/file-tree/renderers/notebook'
import { renderCode } from '@rdub/file-tree/renderers/code'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { renderViewerActions } from '../viewerActions'

// Default points at the deployed demo worker (CFW, multi-bucket).
// Override via `VITE_HTTP_DEMO_BASE` (e.g. `http://localhost:8732/v1/files`
// when running `site/worker/` locally).
const API_BASE = import.meta.env.VITE_HTTP_DEMO_BASE
  ?? 'https://file-tree-demo.ryan-0dc.workers.dev/v1/files'

// Flip `VITE_HTTP_DEMO_PRESIGN=true` once the worker has R2 S3-compat
// creds wired (see `site/worker/README.md`) to make the download icon
// anchor go direct to R2 — bytes skip the worker. While the env var is
// unset (or `false`), downloads stay on the proxying `/get` path so the
// live demo isn't broken during cred rollout.
const PRESIGN = (import.meta.env.VITE_HTTP_DEMO_PRESIGN ?? '').toLowerCase() === 'true'

export function HttpDemo() {
  const store = useMemo(() => HttpStore(API_BASE, PRESIGN ? { presign: true } : {}), [])
  const { pathname } = useLocation()
  const atVirtualRoot = pathname === '/http' || pathname === '/http/'
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <FileTree
        store={store}
        routeBase="/http"
        title="R2 browser"
        markdownRenderer={renderMarkdown}
        parquetRenderer={ParquetViewer}
        jsonRenderer={renderJsonTree}
        csvRenderer={CsvViewer}
        notebookRenderer={NotebookViewer}
        codeRenderer={renderCode}
        viewerActions={renderViewerActions}
        usePersistedState={useUrlPersistedState}
      />
      {atVirtualRoot && (
        <aside style={{ marginTop: '1em', fontSize: '0.9em', opacity: 0.85 }}>
          <p>
            Each top-level entry above is a separate <strong>R2 bucket</strong>, surfaced
            through one Cloudflare Worker via{' '}
            <code>MultiStore({'{ demo, ctbk, crashes }'})</code>:
          </p>
          <ul>
            <li>
              <code>demo/</code> — frozen synthetic Hive-partitioned fixture
              (44 files, populated by <code>site/worker/scripts/populate-demo-bucket.mjs</code>).
              Stable target for the e2e suite.
            </li>
            <li>
              <code>ctbk/</code> — live <a href="https://ctbk.dev" target="_blank" rel="noreferrer">ctbk.dev</a>{' '}
              GBFS pipeline data, scoped to <code>gbfs/</code> + <code>avail/</code>.
            </li>
            <li>
              <code>crashes/</code> — live <a href="https://nj-crashes.com" target="_blank" rel="noreferrer">NJ&nbsp;Crashes</a>{' '}
              raw inputs, scoped to <code>raw/</code>.
            </li>
          </ul>
          <p>
            <em>Roadmap:</em> the buckets here are statically seeded for the demo,
            but the same UI is the seed of a general-purpose R2 / S3 / GitHub / GitLab
            browser — list whatever buckets/repos credentials grant you access to,
            with localStorage-persisted auth for private targets.
          </p>
        </aside>
      )}
      <details style={{ marginTop: '2em', fontSize: '0.9em', opacity: 0.85 }}>
        <summary>How this works</summary>
        <p>
          <code>HttpStore</code> talks to a backend that exposes the file-tree HTTP protocol
          (see <code>site/worker/src/index.ts</code> for the reference implementation —
          a Cloudflare Worker wrapping <code>MultiStore</code> over R2 bindings).
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
