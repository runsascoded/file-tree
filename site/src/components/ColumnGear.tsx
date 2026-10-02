import { useState } from 'react'
import {
  autoUpdate, flip, FloatingPortal, offset, shift,
  useClick, useDismiss, useFloating, useInteractions, useRole,
} from '@floating-ui/react'

/** A ⚙️ in a column header, opening a small menu of modes for that column. */
export function ColumnGear<K extends string>({ column, label, value, options, onChange, active = false }: {
  column: string
  /** Highlight the gear: this column departs from the page-wide setting. */
  active?: boolean
  label: string
  value: K
  options: readonly { key: K; label: string }[]
  onChange: (k: K) => void
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'menu' }),
  ])
  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={`${column}: ${label}`}
        {...getReferenceProps({ onClick: e => e.stopPropagation() })}
        style={{
          marginLeft: '0.35em', padding: '0 0.15em', border: 'none', background: 'transparent', cursor: 'pointer',
          font: 'inherit', fontSize: '0.85em', opacity: open || active ? 0.95 : 0.4, filter: active ? 'none' : 'grayscale(1)',
        }}
      >
        ⚙️
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            style={{
              ...floatingStyles, zIndex: 30, background: 'Canvas', color: 'CanvasText',
              border: '1px solid rgba(127,127,127,0.45)', borderRadius: 6, padding: '0.3em',
              boxShadow: '0 4px 14px rgba(0,0,0,0.35)', fontSize: '0.85em', minWidth: '9em',
            }}
          >
            <div style={{ opacity: 0.6, padding: '0.15em 0.5em' }}><code>{column}</code> {label}</div>
            {options.map(o => (
              <button
                key={o.key}
                type="button"
                role="menuitemradio"
                aria-checked={o.key === value}
                onClick={() => { onChange(o.key); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 4,
                  padding: '0.25em 0.5em', cursor: 'pointer', font: 'inherit',
                  background: o.key === value ? '#4a9eff' : 'transparent', color: o.key === value ? '#fff' : 'inherit',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
