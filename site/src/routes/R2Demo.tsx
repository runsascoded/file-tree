/** `/r2` — bucket-picker landing for browsing Cloudflare R2.
 *
 *  R2 has two access paths and the page surfaces both:
 *    - **Direct via the S3-compatible API** — always SigV4, no
 *      unsigned-public mode. User-added entries (form below) use this
 *      path via `S3Store({ endpoint: 'https://<acct>.r2.cloudflarestorage.com' })`.
 *    - **Via the demo worker** — a CFW with an R2 binding proxies
 *      list/get over HTTP, no signing in-browser. The seeded `ctbk`
 *      and `nj-crashes` buckets use this path: their rows link to
 *      `/http/<bucket>/` (worker-proxied) rather than `/r2/<bucket>/`. */
import { useParams } from 'react-router-dom'
import { S3Store } from '@rdub/file-tree/stores/s3'
import type { Store } from '@rdub/file-tree'
import { BucketsPage, type BucketEntry } from '../components/BucketsPage'
import { BucketBrowser } from '../components/BucketBrowser'

const LS_KEY = 'file-tree:demo:r2:buckets'
const ROUTE_BASE = '/r2'

const SEEDS: BucketEntry[] = [
  {
    bucket: 'ctbk',
    label: 'ctbk.dev',
    description: 'NYC Citi Bike trip data (GBFS + monthly aggregates)',
    to: '/http/ctbk/',
    tag: 'via worker',
  },
  {
    bucket: 'nj-crashes',
    label: 'NJ Crashes',
    description: 'Raw NJDOT bulk crash dumps (2001–present)',
    to: '/http/crashes/',
    tag: 'via worker',
  },
]

function buildStore(entry: BucketEntry): Store {
  return S3Store({
    bucket: entry.bucket,
    region: 'auto',
    ...(entry.endpoint ? { endpoint: entry.endpoint } : {}),
    ...(entry.accessKeyId ? { accessKeyId: entry.accessKeyId } : {}),
    ...(entry.secretAccessKey ? { secretAccessKey: entry.secretAccessKey } : {}),
  })
}

export function R2Demo() {
  const { slug } = useParams<{ slug?: string }>()
  if (slug) {
    // Seeded entries with a `to:` override never route through here
    // (they link to `/http/...` directly), so `BucketBrowser` only ever
    // sees user-added (direct-S3) entries — no need to pass seeds.
    return <BucketBrowser seeds={[]} lsKey={LS_KEY} routeBase={ROUTE_BASE} buildStore={buildStore} />
  }
  return (
    <BucketsPage
      title="R2 browser"
      intro={
        <>
          <p style={{ margin: 0 }}>
            Browse a Cloudflare R2 bucket via its{' '}
            <a href="https://developers.cloudflare.com/r2/api/s3/api/" target="_blank" rel="noreferrer">
              S3-compatible API
            </a> — same <code>S3Store</code> client as <a href="/s3">/s3</a>, just a different
            endpoint.
          </p>
          <p style={{ margin: '0.4em 0 0' }}>
            R2's S3 endpoint always requires SigV4 (no unsigned-public mode). The seeded buckets
            below are surfaced via the demo Cloudflare Worker (no in-browser keys); add your own
            bucket with an{' '}
            <a href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens" target="_blank" rel="noreferrer">
              R2 API token
            </a> to talk to the S3 endpoint directly.
          </p>
        </>
      }
      seeds={SEEDS}
      lsKey={LS_KEY}
      routeBase={ROUTE_BASE}
      formProps={{
        hide: ['region'],
        labels: {
          endpoint: 'Endpoint URL',
          accessKeyId: 'R2 access key ID',
          secretAccessKey: 'R2 secret',
        },
        placeholders: {
          bucket: 'my-r2-bucket',
          endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
          accessKeyId: '(R2 access key, not a CF API token)',
          secretAccessKey: '(64 chars)',
        },
      }}
    />
  )
}
