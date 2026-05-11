/** `/s3` — browse any S3 (or S3-compatible) bucket from the browser.
 *  Paste credentials (or leave blank for a public bucket); they
 *  persist in LocalStorage and are sent only to the bucket endpoint
 *  via signed `fetch` (or unsigned for public). */
import { useMemo, useState } from 'react'
import { FileTree } from '@rdub/file-tree/react'
import { S3Store } from '@rdub/file-tree/stores/s3'
import { StoreAuthForm, type S3DemoConfig } from '../components/StoreAuthForm'
import { renderMarkdown } from '../Markdown'
import { ParquetViewer } from '../ParquetViewer'

export function S3Demo() {
  const [config, setConfig] = useState<S3DemoConfig | null>(null)
  const store = useMemo(() => {
    if (!config) return null
    return S3Store({
      bucket: config.bucket,
      region: config.region || 'us-east-1',
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.accessKeyId ? { accessKeyId: config.accessKeyId } : {}),
      ...(config.secretAccessKey ? { secretAccessKey: config.secretAccessKey } : {}),
    })
  }, [config])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <h1 style={{ fontSize: '1.4em', margin: '0 0 0.4em' }}>S3 browser</h1>
      <p style={{ opacity: 0.85, fontSize: '0.95em' }}>
        Browse any S3 bucket directly from your browser. Works for public buckets unsigned;
        paste an access key + secret to browse private buckets. Implementation:{' '}
        <code>S3Store</code> from <code>@rdub/file-tree/stores/s3</code> — signed via{' '}
        <code>aws4fetch</code> (no AWS SDK).
      </p>

      <StoreAuthForm
        storageKey="file-tree:demo:s3"
        defaults={{ region: 'us-east-1' }}
        placeholders={{
          bucket: 'my-bucket',
          region: 'us-east-1',
          endpoint: '(leave blank for AWS S3; set for MinIO / LocalStack)',
          accessKeyId: 'AKIA…',
          secretAccessKey: '(40 chars)',
        }}
        onChange={setConfig}
      />

      {store ? (
        <FileTree
          store={store}
          routeBase="/s3"
          markdownRenderer={renderMarkdown}
          parquetRenderer={ParquetViewer}
        />
      ) : (
        <p style={{ opacity: 0.6 }}>Enter a bucket above to start browsing.</p>
      )}
    </div>
  )
}
