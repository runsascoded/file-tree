/** `/r2` — bucket-picker landing for browsing Cloudflare R2 via the
 *  S3-compatible API. No public seeds: R2's S3 endpoint always
 *  requires SigV4 (there's no unsigned-public mode); browse the demo
 *  R2 content at `/http` instead, which goes through the proxy worker. */
import { useParams } from 'react-router-dom'
import { S3Store } from '@rdub/file-tree/stores/s3'
import type { Store } from '@rdub/file-tree'
import { BucketsPage, type BucketEntry } from '../components/BucketsPage'
import { BucketBrowser } from '../components/BucketBrowser'

const LS_KEY = 'file-tree:demo:r2:buckets'
const ROUTE_BASE = '/r2'

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
            </a> — same <code>S3Store</code> client, different endpoint.
          </p>
          <p style={{ margin: '0.4em 0 0' }}>
            R2's S3 endpoint always requires SigV4 (no unsigned-public mode), so this page has no
            seeded examples. R2 access keys are created under{' '}
            <a href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens" target="_blank" rel="noreferrer">
              R2 → Manage R2 API Tokens
            </a> — the endpoint URL is shown there too. To browse the demo R2 content without
            providing keys, use the <a href="/http">HttpStore demo</a> instead (proxied via worker).
          </p>
        </>
      }
      seeds={[]}
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
