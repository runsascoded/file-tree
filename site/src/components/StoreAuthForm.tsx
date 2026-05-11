/** `<StoreAuthForm>` — generic credential-collection UI for
 *  S3-compatible Stores (AWS S3, R2 via S3 API, MinIO, …). Persists
 *  the config in LocalStorage so the demo "remembers" your settings
 *  between page loads.
 *
 *  Renders a small form with bucket / endpoint / region / access-key
 *  fields. Each field is optional (omit creds for a public bucket).
 *  Calls `onChange` whenever the user submits or clears the form.
 *
 *  Lives in the site (not the lib): it's a UI/UX layer above the
 *  storage abstraction, and consumers may want to roll their own
 *  (OAuth flow, server-mediated session, …). The lib stays opinion-
 *  free about how credentials are collected. */
import { useEffect, useState, type FormEvent } from 'react'

export interface S3DemoConfig {
  bucket: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface StoreAuthFormProps {
  /** LocalStorage key. Different demos (r2 vs s3) use different keys. */
  storageKey: string
  /** Field labels — override for R2 ("account ID + bucket" framing) or
   *  any other backend-specific terminology. */
  labels?: Partial<Record<keyof S3DemoConfig, string>>
  /** Per-field placeholder text. */
  placeholders?: Partial<Record<keyof S3DemoConfig, string>>
  /** Fields to hide entirely (e.g. R2 demo doesn't need a region
   *  input — it's always 'auto'). */
  hide?: Array<keyof S3DemoConfig>
  /** Optional defaults applied before LS overrides. */
  defaults?: Partial<S3DemoConfig>
  /** Called whenever the config changes (submit, clear, LS load). */
  onChange: (config: S3DemoConfig | null) => void
  /** Optional intro copy rendered above the form. */
  intro?: React.ReactNode
}

const FIELD_ORDER: Array<keyof S3DemoConfig> = [
  'bucket',
  'region',
  'endpoint',
  'accessKeyId',
  'secretAccessKey',
]

const DEFAULT_LABELS: Record<keyof S3DemoConfig, string> = {
  bucket: 'Bucket',
  region: 'Region',
  endpoint: 'Endpoint',
  accessKeyId: 'Access key ID',
  secretAccessKey: 'Secret access key',
}

function loadFromLS(key: string): Partial<S3DemoConfig> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveToLS(key: string, config: S3DemoConfig | null) {
  try {
    if (config) localStorage.setItem(key, JSON.stringify(config))
    else localStorage.removeItem(key)
  } catch {
    // LS write may fail (quota, private mode). Form still works in-memory.
  }
}

export function StoreAuthForm({
  storageKey,
  labels = {},
  placeholders = {},
  hide = [],
  defaults = {},
  onChange,
  intro,
}: StoreAuthFormProps) {
  const [draft, setDraft] = useState<Partial<S3DemoConfig>>({})
  const [applied, setApplied] = useState<S3DemoConfig | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from LS on mount, then notify parent.
  useEffect(() => {
    const persisted = loadFromLS(storageKey)
    const merged = { ...defaults, ...persisted }
    setDraft(merged)
    if (merged.bucket) {
      const cfg: S3DemoConfig = {
        bucket: merged.bucket,
        ...(merged.region ? { region: merged.region } : {}),
        ...(merged.endpoint ? { endpoint: merged.endpoint } : {}),
        ...(merged.accessKeyId ? { accessKeyId: merged.accessKeyId } : {}),
        ...(merged.secretAccessKey ? { secretAccessKey: merged.secretAccessKey } : {}),
      }
      setApplied(cfg)
      onChange(cfg)
    } else {
      onChange(null)
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  function update<K extends keyof S3DemoConfig>(field: K, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.bucket) return
    const cfg: S3DemoConfig = {
      bucket: draft.bucket,
      ...(draft.region ? { region: draft.region } : {}),
      ...(draft.endpoint ? { endpoint: draft.endpoint } : {}),
      ...(draft.accessKeyId ? { accessKeyId: draft.accessKeyId } : {}),
      ...(draft.secretAccessKey ? { secretAccessKey: draft.secretAccessKey } : {}),
    }
    saveToLS(storageKey, cfg)
    setApplied(cfg)
    onChange(cfg)
  }

  function clear() {
    saveToLS(storageKey, null)
    setDraft({})
    setApplied(null)
    onChange(null)
  }

  if (!hydrated) return null

  const visibleFields = FIELD_ORDER.filter(f => !hide.includes(f))
  const labelOf = (f: keyof S3DemoConfig) => labels[f] ?? DEFAULT_LABELS[f]
  const placeholderOf = (f: keyof S3DemoConfig) => placeholders[f] ?? ''
  const isSecret = (f: keyof S3DemoConfig) => f === 'secretAccessKey'

  const isApplied = applied !== null

  return (
    <details
      open={!isApplied}
      style={{
        border: '1px solid rgba(127,127,127,0.3)',
        borderRadius: 6,
        padding: '0.6em 0.8em',
        marginBottom: '1em',
        background: 'rgba(127,127,127,0.04)',
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: '0.95em' }}>
        <strong>Connection</strong>
        {isApplied && (
          <span style={{ opacity: 0.7, marginLeft: '0.6em', fontSize: '0.9em' }}>
            <code>{applied.bucket}</code>
            {applied.endpoint ? <> @ <code>{new URL(applied.endpoint).host}</code></> : null}
            {applied.accessKeyId ? <> · signed</> : <> · public (unsigned)</>}
          </span>
        )}
      </summary>

      {intro && <div style={{ marginTop: '0.5em', fontSize: '0.9em', opacity: 0.85 }}>{intro}</div>}

      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4em 0.8em', marginTop: '0.8em', fontSize: '0.9em', alignItems: 'center' }}>
        {visibleFields.map(field => (
          <FieldRow
            key={field}
            label={labelOf(field)}
            value={draft[field] ?? ''}
            placeholder={placeholderOf(field)}
            secret={isSecret(field)}
            required={field === 'bucket'}
            onChange={v => update(field, v)}
          />
        ))}
        <div />
        <div style={{ display: 'flex', gap: '0.5em', marginTop: '0.4em' }}>
          <button type="submit" disabled={!draft.bucket}>Connect</button>
          {isApplied && <button type="button" onClick={clear}>Disconnect / clear</button>}
        </div>
      </form>

      <p style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '0.6em', marginBottom: 0 }}>
        Credentials live only in your browser's LocalStorage. To clear, hit "Disconnect" or
        wipe site data. Public buckets work without keys.{' '}
        <em>Note: browser-direct S3/R2 calls require the bucket to have CORS configured to allow
        this origin; if you see CORS errors, configure the bucket or proxy via a worker (see
        <code> examples/s3-proxy-worker/</code> in the repo).</em>
      </p>
    </details>
  )
}

function FieldRow({
  label,
  value,
  placeholder,
  secret,
  required,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  secret: boolean
  required: boolean
  onChange: (v: string) => void
}) {
  return (
    <>
      <label style={{ opacity: 0.8, justifySelf: 'end', fontFamily: 'ui-monospace, monospace' }}>
        {label}{required ? <span style={{ color: 'salmon' }}> *</span> : null}
      </label>
      <input
        type={secret ? 'password' : 'text'}
        autoComplete={secret ? 'new-password' : 'off'}
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '0.3em 0.6em',
          borderRadius: 4,
          border: '1px solid rgba(127,127,127,0.4)',
          background: 'rgba(127,127,127,0.08)',
          color: 'inherit',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.95em',
        }}
      />
    </>
  )
}
