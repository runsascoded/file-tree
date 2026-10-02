/** A small segmented control for the demos' option toggles (matches the
 *  treemap brush panel idiom). */
export function Segmented<K extends string>({ label, value, options, onChange }: {
  label: string
  value: K
  options: { key: K; label: string }[]
  onChange: (k: K) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{label}</span>
      <div style={{ display: 'inline-flex', border: '1px solid #8884', borderRadius: 6, overflow: 'hidden' }}>
        {options.map(o => (
          <button
            key={o.key}
            type="button"
            aria-pressed={o.key === value}
            onClick={() => onChange(o.key)}
            style={{
              border: 'none', padding: '0.3em 0.7em', cursor: 'pointer', fontSize: '0.85em',
              background: o.key === value ? '#4a9eff' : 'transparent',
              color: o.key === value ? '#fff' : 'inherit',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
