/** `<BucketsPage>` — generic bucket-picker landing page used by the
 *  `/s3` and `/r2` demo routes. Renders:
 *
 *    - a list of seeded public buckets (hardcoded per backend)
 *    - any user-added buckets (LS-persisted)
 *    - an "Add a bucket" form at the bottom
 *
 *  Each row links to `<routeBase>/<bucket>/*`, where the per-bucket
 *  `<FileTree>` is mounted. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StoreAuthForm, type S3DemoConfig, type StoreAuthFormProps } from './StoreAuthForm'

export interface BucketEntry extends S3DemoConfig {
  /** Display name. Defaults to `bucket`. */
  label?: string
  /** Short description shown next to the row. */
  description?: string
  /** Override the row's target URL (otherwise defaults to
   *  `${routeBase}/${bucket}/`). Use for seed rows that should route to
   *  a different demo — e.g. `/r2` seeds linking to `/http/<bucket>/`
   *  since R2's S3-compat API has no anonymous list. */
  to?: string
  /** Short trailing tag shown after the auth-mode label
   *  (`public` / `signed`). Use for "via worker" etc. */
  tag?: string
}

export interface BucketsPageProps {
  title: string
  intro: React.ReactNode
  /** Hardcoded seed entries (e.g. public AWS Open Data buckets). */
  seeds: BucketEntry[]
  /** LocalStorage key. The stored value is a `BucketEntry[]`. */
  lsKey: string
  /** Route base for the per-bucket browser, e.g. `/s3` or `/r2`. */
  routeBase: string
  /** Props passed to the "Add" form (labels, placeholders, hidden
   *  fields, initial values). */
  formProps?: Omit<StoreAuthFormProps, 'onSubmit'>
}

function loadFromLS(key: string): BucketEntry[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveToLS(key: string, entries: BucketEntry[]) {
  try { localStorage.setItem(key, JSON.stringify(entries)) }
  catch { /* LS write may fail in private mode; in-memory state still works */ }
}

export function BucketsPage({ title, intro, seeds, lsKey, routeBase, formProps }: BucketsPageProps) {
  const [added, setAdded] = useState<BucketEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setAdded(loadFromLS(lsKey))
    setHydrated(true)
  }, [lsKey])

  function add(cfg: S3DemoConfig) {
    if (seeds.some(s => s.bucket === cfg.bucket) || added.some(a => a.bucket === cfg.bucket)) {
      // Replace existing user entry with same bucket name; ignore if
      // it collides with a seed (seeds are read-only).
      if (seeds.some(s => s.bucket === cfg.bucket)) {
        // eslint-disable-next-line no-alert
        alert(`'${cfg.bucket}' is already in the seeded list (read-only).`)
        return
      }
    }
    const next = [...added.filter(a => a.bucket !== cfg.bucket), { ...cfg }]
    saveToLS(lsKey, next)
    setAdded(next)
  }

  function remove(bucket: string) {
    const next = added.filter(a => a.bucket !== bucket)
    saveToLS(lsKey, next)
    setAdded(next)
  }

  if (!hydrated) return null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <h1 style={{ fontSize: '1.4em', margin: '0 0 0.4em' }}>{title}</h1>
      <div style={{ opacity: 0.85, fontSize: '0.95em', marginBottom: '1.2em' }}>{intro}</div>

      {seeds.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.05em', margin: '0.4em 0 0.3em' }}>Public buckets</h2>
          <BucketTable entries={seeds} routeBase={routeBase} />
        </>
      )}

      <h2 style={{ fontSize: '1.05em', margin: '1em 0 0.3em' }}>
        {added.length > 0 ? 'Your buckets' : 'Your buckets (none yet)'}
      </h2>
      {added.length > 0 && (
        <BucketTable entries={added} routeBase={routeBase} onRemove={remove} />
      )}

      <details open={added.length === 0} style={{ marginTop: '1.2em', padding: '0.6em 0.8em', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 6, background: 'rgba(127,127,127,0.04)' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.95em' }}>
          <strong>Add a bucket</strong>
        </summary>
        <p style={{ fontSize: '0.85em', opacity: 0.75, marginTop: '0.4em' }}>
          Public buckets work without keys; paste an access key + secret for private.
          Config persists in this browser's LocalStorage; no server touches it.
          <em> Note: browser-direct calls require the bucket to allow CORS for this origin —
          if you get CORS errors, configure the bucket's CORS or proxy via a worker
          (see <code>examples/s3-proxy-worker/</code>).</em>
        </p>
        <StoreAuthForm {...formProps} onSubmit={add} submitLabel="Add bucket" />
      </details>
    </div>
  )
}

function BucketTable({ entries, routeBase, onRemove }: { entries: BucketEntry[]; routeBase: string; onRemove?: (bucket: string) => void }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.95em' }}>
      <tbody>
        {entries.map(e => {
          const isSigned = !!e.accessKeyId
          return (
            <tr key={e.bucket} style={{ borderTop: '1px solid rgba(127,127,127,0.2)' }}>
              <td style={{ padding: '0.4em 0.6em 0.4em 0', fontFamily: 'ui-monospace, monospace' }}>
                <Link to={e.to ?? `${routeBase}/${encodeURIComponent(e.bucket)}/`}>
                  📁 {e.label ?? e.bucket}{e.label && e.label !== e.bucket ? <span style={{ opacity: 0.5 }}> ({e.bucket})</span> : null}
                </Link>
              </td>
              <td style={{ padding: '0.4em 0.6em', opacity: 0.75 }}>
                {e.description}
              </td>
              <td style={{ padding: '0.4em 0.6em', opacity: 0.6, fontSize: '0.85em', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
                {isSigned ? 'signed' : 'public'}
                {e.region ? <> · {e.region}</> : null}
                {e.tag ? <> · {e.tag}</> : null}
              </td>
              <td style={{ padding: '0.4em 0', textAlign: 'right' }}>
                {onRemove && (
                  <button
                    onClick={() => onRemove(e.bucket)}
                    style={{ fontSize: '0.85em', padding: '0.15em 0.5em' }}
                    title="Remove this bucket"
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
