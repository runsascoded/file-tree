/** `/gcs` — bucket-picker landing for browsing Google Cloud Storage.
 *
 *  GCS's XML API is S3-shaped (`storage.googleapis.com/<bucket>/…`),
 *  so browser-direct works via the same signing machinery as `S3Store`
 *  — with two twists:
 *    - **CORS is off by default on GCS buckets.** Most public GCS
 *      buckets (Landsat, Sentinel-2, Chromium snapshots, …) list
 *      anonymously but don't advertise CORS headers, so the browser
 *      blocks them. Adding CORS requires bucket-owner access (`gsutil
 *      cors set`) — hence no public-bucket seeds here.
 *    - **Three auth modes**, not two: unsigned (public buckets),
 *      HMAC (interop access keys, `GOOG1E...`), and OAuth **bearer**
 *      (server-side ADC / workload-identity). The form below covers
 *      unsigned + HMAC; bearer is server-only in practice (a browser
 *      user would just paste an already-signed URL). */
import { useParams } from 'react-router-dom'
import { GcsStore } from '@rdub/file-tree/stores/gcs'
import type { Store } from '@rdub/file-tree'
import { BucketsPage, type BucketEntry } from '../components/BucketsPage'
import { BucketBrowser } from '../components/BucketBrowser'

const LS_KEY = 'file-tree:demo:gcs:buckets'
const ROUTE_BASE = '/gcs'

// The one browser-direct-listable GCS seed: a project-owned bucket
// with CORS explicitly configured for arbitrary origins. All well-known
// *public* GCS datasets (Landsat, Sentinel-2, Chromium snapshots,
// arXiv, TensorFlow, K8s releases, …) list anonymously but ship no
// CORS headers — GCS defaults CORS off and near-nobody enables it, so
// there's no "just seed a famous public bucket" option here.
// Populated by `site/scripts/populate-demo-gcs-bucket.mjs` (same
// fixture as the R2 `file-tree-demo` bucket, so `/http` and `/gcs`
// show byte-identical trees).
const SEEDS: BucketEntry[] = [
  {
    bucket: 'file-tree-demo-gcs',
    label: 'file-tree-demo',
    description: 'Synthetic ~44-file fixture — same tree as the R2 demo, served browser-direct from GCS.',
  },
]

function buildStore(entry: BucketEntry): Store {
  return GcsStore({
    bucket: entry.bucket,
    ...(entry.endpoint ? { endpoint: entry.endpoint } : {}),
    ...(entry.accessKeyId ? { accessKeyId: entry.accessKeyId } : {}),
    ...(entry.secretAccessKey ? { secretAccessKey: entry.secretAccessKey } : {}),
  })
}

export function GcsDemo() {
  const { slug } = useParams<{ slug?: string }>()
  if (slug) {
    return <BucketBrowser seeds={SEEDS} lsKey={LS_KEY} routeBase={ROUTE_BASE} buildStore={buildStore} />
  }
  return (
    <BucketsPage
      title="GCS browser"
      intro={
        <>
          <p style={{ margin: 0 }}>
            Browse Google Cloud Storage buckets directly from your browser via{' '}
            <code>GcsStore</code>, which speaks GCS's{' '}
            <a href="https://cloud.google.com/storage/docs/interoperability" target="_blank" rel="noreferrer">
              S3-compatible XML API
            </a>{' '}(same signing core as <a href="/s3">/s3</a>; different endpoint).
          </p>
          <p style={{ margin: '0.4em 0 0' }}>
            <strong>CORS caveat:</strong> GCS buckets default to{' '}
            <em>no CORS</em>, so most public datasets can't be listed browser-direct
            (that's why there's no seed list here — the usual candidates
            {' '}(Landsat, Sentinel-2, Chromium snapshots) all list anonymously but
            block the browser). To use your own bucket:{' '}
            <code>gsutil cors set cors.json gs://your-bucket</code>{' '}
            (see{' '}
            <a href="https://cloud.google.com/storage/docs/using-cors" target="_blank" rel="noreferrer">
              GCS CORS docs
            </a>), or proxy through a Worker.
          </p>
          <p style={{ margin: '0.4em 0 0' }}>
            <strong>Auth modes:</strong> leave keys blank for public buckets; paste GCS{' '}
            <a href="https://cloud.google.com/storage/docs/authentication/managing-hmackeys" target="_blank" rel="noreferrer">
              HMAC interop keys
            </a>{' '}
            (<code>GOOG1E…</code>) for private buckets. Server-side deployments can also
            use OAuth bearer tokens (ADC / workload-identity) via the{' '}
            <code>getToken</code> option — not exposed in this form, but demonstrated in the
            {' '}<a href="https://github.com/runsascoded/file-tree/tree/main/src/stores/gcs.ts" target="_blank" rel="noreferrer">
              store source
            </a>.
          </p>
        </>
      }
      seeds={SEEDS}
      lsKey={LS_KEY}
      routeBase={ROUTE_BASE}
      formProps={{
        hide: ['region'],   // region-scope is 'auto' for GCS's XML API
        labels: {
          endpoint: 'Endpoint (rarely needed)',
          accessKeyId: 'HMAC access key (GOOG1E…)',
          secretAccessKey: 'HMAC secret',
        },
        placeholders: {
          bucket: 'my-gcs-bucket',
          endpoint: '(blank → https://storage.googleapis.com)',
          accessKeyId: 'GOOG1E…',
          secretAccessKey: '(40 chars)',
        },
      }}
    />
  )
}
