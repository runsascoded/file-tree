import { useState, type ReactNode } from 'react'
import {
  autoUpdate, FloatingFocusManager, FloatingPortal, offset, shift, size,
  useClick, useDismiss, useFloating, useInteractions, useRole,
} from '@floating-ui/react'

/** A "?" button pinned to the lower-left corner, opening a panel with a
 *  demo's "how this works" notes. Keeps the explainer out of the page flow
 *  (where, below a short file, it read as leftover content) while staying one
 *  click away. Lower-left, since lower-right is where a SpeedDial goes. */
export function HelpFab({ title = 'How this works', children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      shift({ padding: 16 }),
      size({
        padding: 16,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, availableHeight)}px`
        },
      }),
    ],
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ])
  return (
    <>
      <button
        ref={refs.setReference}
        aria-label={title}
        {...getReferenceProps()}
        style={{
          position: 'fixed', left: 16, bottom: 16, zIndex: 20,
          width: 40, height: 40, borderRadius: '50%',
          border: '1px solid rgba(127,127,127,0.45)',
          background: open ? '#4a9eff' : 'Canvas', color: open ? '#fff' : 'CanvasText',
          font: 'inherit', fontSize: '1.15em', fontWeight: 650, cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}
      >
        ?
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              {...getFloatingProps()}
              aria-label={title}
              style={{
                ...floatingStyles, zIndex: 21,
                width: 'min(40em, calc(100vw - 32px))', overflowY: 'auto',
                padding: '0.2em 1.1em 0.6em', borderRadius: 8,
                background: 'Canvas', color: 'CanvasText',
                border: '1px solid rgba(127,127,127,0.35)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
                fontSize: '0.9em', lineHeight: 1.5,
              }}
            >
              <h3 style={{ margin: '0.8em 0 0.4em' }}>{title}</h3>
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
