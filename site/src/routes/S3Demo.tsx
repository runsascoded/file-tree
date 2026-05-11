/** `/s3` — bucket-picker landing page for the S3 demo, plus
 *  per-bucket `<FileTree>` mount at `/s3/<bucket>/*`. Seeded with a
 *  few AWS Open Data buckets that are confirmed CORS-friendly +
 *  listable browser-direct (probed at build time, see commit msg). */
import { useParams } from 'react-router-dom'
import { S3Store } from '@rdub/file-tree/stores/s3'
import type { Store } from '@rdub/file-tree'
import { BucketsPage, type BucketEntry } from '../components/BucketsPage'
import { BucketBrowser } from '../components/BucketBrowser'

const LS_KEY = 'file-tree:demo:s3:buckets'
const ROUTE_BASE = '/s3'

// Probed for both CORS headers (`access-control-allow-origin: *`) AND
// non-empty list responses for anonymous callers. Lots of AWS Open Data
// buckets advertise CORS for preflight but reject `s3:ListBucket` for
// anonymous principals, returning 200 with `KeyCount=0`; those look
// fine in a head-only probe but fail in a real browser. The three
// below all genuinely list browser-direct (verified 2026-05-11).
const SEEDS: BucketEntry[] = [
  {
    bucket: 'openalex',
    label: 'OpenAlex',
    description: 'Open scholarly research data (~250M works, ~100M authors)',
    region: 'us-east-1',
  },
  {
    bucket: 'noaa-gsod-pds',
    label: 'NOAA Global Summary of the Day',
    description: 'Daily weather summaries from stations worldwide',
    region: 'us-east-1',
  },
  {
    bucket: '1000genomes',
    label: '1000 Genomes Project',
    description: 'Reference whole-genome sequences from the 1000 Genomes Project',
    region: 'us-east-1',
  },
]

function buildStore(entry: BucketEntry): Store {
  return S3Store({
    bucket: entry.bucket,
    region: entry.region || 'us-east-1',
    ...(entry.endpoint ? { endpoint: entry.endpoint } : {}),
    ...(entry.accessKeyId ? { accessKeyId: entry.accessKeyId } : {}),
    ...(entry.secretAccessKey ? { secretAccessKey: entry.secretAccessKey } : {}),
  })
}

export function S3Demo() {
  const { slug } = useParams<{ slug?: string }>()
  if (slug) {
    return <BucketBrowser seeds={SEEDS} lsKey={LS_KEY} routeBase={ROUTE_BASE} buildStore={buildStore} />
  }
  return (
    <BucketsPage
      title="S3 browser"
      intro={
        <p style={{ margin: 0 }}>
          Browse S3 buckets directly from your browser via{' '}
          <code>S3Store</code> (signed with <code>aws4fetch</code>; no AWS SDK).
          Seeded with a few public AWS Open Data buckets — pick one to start, or add
          your own (public or with paste-an-access-key) below.
        </p>
      }
      seeds={SEEDS}
      lsKey={LS_KEY}
      routeBase={ROUTE_BASE}
      formProps={{
        placeholders: {
          bucket: 'my-bucket',
          region: 'us-east-1',
          endpoint: '(blank for AWS S3; set for MinIO / LocalStack)',
          accessKeyId: 'AKIA…',
          secretAccessKey: '(40 chars)',
        },
        initial: { region: 'us-east-1' },
      }}
    />
  )
}
