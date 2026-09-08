/** Interactive demo of `@rdub/file-tree`'s **elidable cells** — the one
 *  `elide` option that decides how a value too wide for its column clips,
 *  and how the clipped tail comes back.
 *
 *  The table is a plain `CsvViewer` (no `renderCell`) over a `MockStore`
 *  of long GCS-style paths — exactly the case that motivated the feature
 *  (sweep-deletion logs whose `name` is a checkpoint-shard path). The two
 *  segmented controls below drive the two live axes:
 *
 *   - **Width**: `elide.maxWidth` — `'30em'` (compact, clips) vs `false`
 *     (wide, natural width; the outer container x-scrolls to reveal it).
 *   - **Tooltip**: `elide.tooltip` — a render-prop (a floating-ui panel —
 *     FT ships no tooltip dependency, the *consumer* supplies it),
 *     `'native'` (the browser `title`), or `false` (none).
 *
 *  Column *resizing* is deliberately absent — that's per-column width
 *  state, a separate concern from elision. */
import { useMemo, useState, type ReactNode } from 'react'
import {
  autoUpdate, flip, FloatingPortal, offset, shift,
  useDismiss, useFloating, useHover, useInteractions, useRole,
} from '@floating-ui/react'
import { CsvViewer } from '@rdub/file-tree/renderers/csv'
import { MockStore } from '@rdub/file-tree/stores/mock'
import type { ElideConfig, ElideCtx } from '@rdub/file-tree/renderers/table'

/** `[name, size, sweeper]`. The first rows are long checkpoint-shard
 *  paths (they clip at 30em); the short ones show that recovery is
 *  content-driven, not applied blindly. */
const ROWS: [string, number, string][] = [
  ['checkpoints/adam-lr1.00e-2-128B/step-042000/shard-00000-of-00016.safetensors', 402653184, 'david'],
  ['checkpoints/adam-lr1.00e-2-128B/step-042000/shard-00001-of-00016.safetensors', 402653184, 'david'],
  ['checkpoints/sgd-nesterovFalse-wd0.1/step-128000/optimizer/momentum-buffer.pt', 805306368, 'kaiyue'],
  ['runs/eval/mmlu/2026-01-05T12-30-00Z/predictions/rank-00000-of-00008.jsonl', 12582912, 'ahmed'],
  ['runs/eval/gsm8k/2026-01-05T12-30-00Z/predictions/rank-00000-of-00008.jsonl', 8388608, 'ahmed'],
  ['checkpoints/adam-lr3.00e-4-64B-cosine/step-256000/model/params.safetensors', 1610612736, 'will'],
  ['datasets/dolma-v1.7/tokenized/gpt-neox-20b/part-00042-of-00512.npy', 268435456, 'kaiyue'],
  ['logs/2026-01-03T00-00-00Z.sweep.log', 40960, 'will'],
  ['README.md', 1832, 'david'],
  ['config.yaml', 640, 'ahmed'],
]

/** The fixture as CSV bytes for `MockStore`. */
const CSV = ['name,size,sweeper', ...ROWS.map(([n, s, w]) => `${n},${s},${w}`)].join('\n') + '\n'

type Width = 'compact' | 'wide'
type Tip = 'rich' | 'native' | 'none'

/** A floating-ui tooltip supplied by the *consumer* — this is what the
 *  `elide.tooltip` render-prop is for. It wraps the cell's own node and
 *  shows the full value in a styled panel on hover. */
function PathTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top-start',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { move: false, delay: { open: 60, close: 0 } }),
    useRole(context, { role: 'tooltip' }),
    useDismiss(context),
  ])
  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} style={{ cursor: 'default' }}>{children}</span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            data-testid="elide-rich-tip"
            style={{
              ...floatingStyles,
              maxWidth: '46em', zIndex: 40,
              background: '#0e0f13', color: '#f4f4f5',
              border: '1px solid #333', borderRadius: 6,
              padding: '0.4em 0.6em', fontSize: '0.85em',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              overflowWrap: 'anywhere', boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            }}
            {...getFloatingProps()}
          >
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

/** The `elide.tooltip` render-prop for the rich mode — stable identity so
 *  swapping `width` doesn't rebuild it. */
const richTooltip = (ctx: ElideCtx): ReactNode => <PathTip label={ctx.text ?? ''}>{ctx.node}</PathTip>

/** A small segmented control (matches the treemap brush panel idiom). */
function Segmented<K extends string>({ label, value, options, onChange }: {
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

export function ElideDemo() {
  const store = useMemo(() => MockStore({ 'sweep-log.csv': CSV }, { describe: 'mock://sweep-logs/' }), [])
  const [width, setWidth] = useState<Width>('compact')
  // Default to the rich (floating-ui) tooltip — the one you'd actually ship.
  // Native `title` is the zero-dependency floor, offered as a toggle.
  const [tip, setTip] = useState<Tip>('rich')

  const elide = useMemo<ElideConfig>(() => ({
    ...(width === 'wide' ? { maxWidth: false } : {}),
    tooltip: tip === 'none' ? false : tip === 'rich' ? richTooltip : 'native',
  }), [width, tip])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <h2 style={{ marginTop: 0 }}>Elidable cells</h2>
      <p style={{ opacity: 0.85, maxWidth: '52em' }}>
        A long value clips to fit its column and the tail is lost — unless the viewer offers a way back.
        Every table viewer takes one <code>elide</code> option; these controls drive its two axes live.
        The table below is a plain <code>&lt;CsvViewer&gt;</code> (no <code>renderCell</code>) over a{' '}
        <code>MockStore</code> of long GCS paths. Hover a clipped path: by default that's a{' '}
        <code>@floating-ui/react</code> tooltip <em>this page</em> supplies (<code>file-tree</code> ships
        none) — the tooltip you'd actually use. <em>Native</em> is the zero-dependency floor.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2em', margin: '1em 0' }}>
        <Segmented<Width>
          label="Width"
          value={width}
          onChange={setWidth}
          options={[{ key: 'compact', label: 'Compact (30em)' }, { key: 'wide', label: 'Wide (x-scroll)' }]}
        />
        <Segmented<Tip>
          label="Tooltip"
          value={tip}
          onChange={setTip}
          options={[
            { key: 'rich', label: 'Rich' },
            { key: 'native', label: 'Native' },
            { key: 'none', label: 'None' },
          ]}
        />
      </div>

      {/* Deliberately narrower than the longest path so the axes read: in
          compact mode the columns fit (and clip); in wide mode the table
          outgrows this box and its own `overflowX:auto` scroller kicks in. */}
      <div data-testid="elide-table" style={{ border: '1px solid #8883', borderRadius: 8, overflow: 'hidden', maxWidth: 640 }}>
        <CsvViewer store={store} path="sweep-log.csv" delimiter="," elide={elide} fullLoadMaxBytes={Infinity} />
      </div>

      <details style={{ marginTop: '1.5em' }}>
        <summary style={{ cursor: 'pointer' }}>How this maps to <code>elide</code></summary>
        <div style={{ opacity: 0.85, fontSize: '0.92em', marginTop: '0.6em' }}>
          <p>
            The current controls resolve to this option on the viewer:
          </p>
          <pre style={{ background: '#8881', padding: '0.8em', borderRadius: 6, overflowX: 'auto' }}>{
`<CsvViewer … elide={${JSON.stringify(
  { ...(width === 'wide' ? { maxWidth: false } : {}), tooltip: tip === 'rich' ? '<render-prop>' : tip === 'none' ? false : 'native' },
)}} />`
          }</pre>
          <ul>
            <li><code>maxWidth: false</code> drops the 30em cap so the column renders at natural width and the container x-scrolls.</li>
            <li><code>tooltip: 'native'</code> is the batteries-included default (browser <code>title</code> = full value); <code>false</code> removes it.</li>
            <li>
              <code>tooltip: (ctx) =&gt; …</code> is the escape hatch: <code>@rdub/file-tree</code> ships no tooltip
              dependency, so the <em>rich</em> mode here is <code>@floating-ui/react</code> supplied by this demo,
              wrapping <code>ctx.node</code> and reading <code>ctx.text</code>.
            </li>
          </ul>
          <p style={{ opacity: 0.7 }}>
            Column <em>resizing</em> is a separate concern (per-column width state), not part of <code>elide</code>.
          </p>
        </div>
      </details>
    </div>
  )
}
