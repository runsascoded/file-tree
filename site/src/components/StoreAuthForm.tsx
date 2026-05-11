/** `<StoreAuthForm>` — pure form for entering S3-compatible bucket
 *  config (bucket / region / endpoint / access keys). No LocalStorage
 *  or "applied" state of its own; the caller decides what to do with
 *  the submitted value (typically: append to a list in LS).
 *
 *  Each field is optional except `bucket`. Field labels, placeholders,
 *  and visibility are configurable per-backend (S3 demo vs R2 demo).
 *
 *  Lives in the site (not the lib) — UI/UX is consumer-specific; the
 *  lib stays opinion-free about how credentials are collected. */
import { useEffect, useState, type FormEvent } from 'react'

export interface S3DemoConfig {
  bucket: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface StoreAuthFormProps {
  /** Field labels — override for R2 or any backend-specific terminology. */
  labels?: Partial<Record<keyof S3DemoConfig, string>>
  /** Per-field placeholder text. */
  placeholders?: Partial<Record<keyof S3DemoConfig, string>>
  /** Fields to hide entirely (e.g. R2 demo hides `region` — always `'auto'`). */
  hide?: Array<keyof S3DemoConfig>
  /** Initial values for the form fields. */
  initial?: Partial<S3DemoConfig>
  /** Called when the user submits a complete config. */
  onSubmit: (config: S3DemoConfig) => void
  /** Optional submit-button label. Defaults to "Add". */
  submitLabel?: string
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

export function StoreAuthForm({
  labels = {},
  placeholders = {},
  hide = [],
  initial = {},
  onSubmit,
  submitLabel = 'Add',
}: StoreAuthFormProps) {
  const [draft, setDraft] = useState<Partial<S3DemoConfig>>(initial)

  // Resync if `initial` changes (e.g. "Edit existing" flow in caller).
  useEffect(() => { setDraft(initial) }, [initial])

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
    onSubmit(cfg)
    setDraft(initial)
  }

  const visibleFields = FIELD_ORDER.filter(f => !hide.includes(f))
  const labelOf = (f: keyof S3DemoConfig) => labels[f] ?? DEFAULT_LABELS[f]
  const placeholderOf = (f: keyof S3DemoConfig) => placeholders[f] ?? ''
  const isSecret = (f: keyof S3DemoConfig) => f === 'secretAccessKey'

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '0.4em 0.8em',
        alignItems: 'center',
        fontSize: '0.9em',
        marginTop: '0.4em',
      }}
    >
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
      <div>
        <button type="submit" disabled={!draft.bucket}>{submitLabel}</button>
      </div>
    </form>
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
