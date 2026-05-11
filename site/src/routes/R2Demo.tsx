/** `/r2` — browse a Cloudflare R2 bucket via its S3-compatible API.
 *  Same `S3Store` as `/s3`, but with `region: 'auto'` and an
 *  `endpoint: https://<account-id>.r2.cloudflarestorage.com` baked
 *  into the form's framing.
 *
 *  Credentials are R2 access keys (created in the CF dashboard under
 *  R2 → Manage R2 API Tokens), not generic CF API tokens. */
import { useMemo, useState } from 'react'
import { FileTree } from '@rdub/file-tree/react'
import { S3Store } from '@rdub/file-tree/stores/s3'
import { StoreAuthForm, type S3DemoConfig } from '../components/StoreAuthForm'
import { renderMarkdown } from '../Markdown'
import { ParquetViewer } from '../ParquetViewer'

export function R2Demo() {
  const [config, setConfig] = useState<S3DemoConfig | null>(null)
  const store = useMemo(() => {
    if (!config) return null
    return S3Store({
      bucket: config.bucket,
      region: 'auto',
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.accessKeyId ? { accessKeyId: config.accessKeyId } : {}),
      ...(config.secretAccessKey ? { secretAccessKey: config.secretAccessKey } : {}),
    })
  }, [config])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <h1 style={{ fontSize: '1.4em', margin: '0 0 0.4em' }}>R2 browser</h1>
      <p style={{ opacity: 0.85, fontSize: '0.95em' }}>
        Browse a Cloudflare R2 bucket directly from your browser via the{' '}
        <a href="https://developers.cloudflare.com/r2/api/s3/api/" target="_blank" rel="noreferrer">
          S3-compatible API
        </a>. Same <code>S3Store</code> client as the S3 demo, with an R2 endpoint override.
      </p>

      <StoreAuthForm
        storageKey="file-tree:demo:r2"
        hide={['region']}
        labels={{
          endpoint: 'Endpoint URL',
          accessKeyId: 'R2 access key ID',
          secretAccessKey: 'R2 secret',
        }}
        placeholders={{
          bucket: 'my-r2-bucket',
          endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
          accessKeyId: '(R2 access key, not a CF API token)',
          secretAccessKey: '(64 chars)',
        }}
        intro={
          <p style={{ margin: '0.3em 0' }}>
            R2 access keys are created under{' '}
            <a href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens" target="_blank" rel="noreferrer">
              R2 → Manage R2 API Tokens
            </a>. The endpoint URL is shown there too (it includes your account ID).
          </p>
        }
        onChange={setConfig}
      />

      {store ? (
        <FileTree
          store={store}
          routeBase="/r2"
          markdownRenderer={renderMarkdown}
          parquetRenderer={ParquetViewer}
        />
      ) : (
        <p style={{ opacity: 0.6 }}>Enter R2 credentials above to start browsing.</p>
      )}
    </div>
  )
}
