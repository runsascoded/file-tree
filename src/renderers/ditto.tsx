import type { CSSProperties, ReactNode } from 'react'
import { cellTitle, type RunRenderer, type TableCellCtx, type TableCellRenderer, type TableColumn } from './table'
import { normalizeDitto, runKey, sharedPathPrefix, type DittoOption, type ResolvedRunSpec, type RunMode } from './tableRuns'

/** The ditto mark a collapsed repeated value renders instead of its text.
 *  Dimmed and centered so a run reads as one block and the changes stand
 *  out; `〃` (U+3003) rather than a straight quote so it reads as "same as
 *  above" even mid-column. `value` goes on the mark's `title`, so the
 *  repeated value stays recoverable on hover. */
export function dittoMark(value?: unknown): ReactNode {
  const title = cellTitle(value)
  return <span aria-label="ditto" {...(title != null ? { title } : {})} style={{ opacity: 0.3, display: 'block', textAlign: 'center' }}>〃</span>
}

const RULE = '1px solid currentColor'

/** A `'line'`/`'arrow'`-mode cell after a run's first: a thin rule down
 *  the cell's full height (bleeding into the cell's vertical padding, so
 *  rules in consecutive rows join), ending on the run's last row in a tick
 *  (`└`) or an arrowhead. Assumes the default cell padding (`0.2em`
 *  vertical). `value` goes on the rule's `title`. */
export function runLine(value: unknown, end: boolean, head: 'tick' | 'arrow' = 'tick'): ReactNode {
  const title = cellTitle(value)
  const rule: CSSProperties = !end
    ? { top: '-0.2em', bottom: '-0.2em', borderLeft: RULE }
    : head === 'tick'
      ? { top: '-0.2em', height: 'calc(0.2em + 0.5lh)', width: '0.6em', borderLeft: RULE, borderBottom: RULE }
      : { top: '-0.2em', height: 'calc(0.2em + 0.4lh)', borderLeft: RULE }
  return (
    <span
      aria-label={end ? 'run end' : 'run'}
      {...(title != null ? { title } : {})}
      style={{ display: 'block', position: 'relative' }}
    >
      {'\u00a0'}
      <span style={{ position: 'absolute', left: '0.3em', opacity: 0.35, ...rule }} />
      {end && head === 'arrow' && (
        // A CSS triangle centered on the rule, picking up where it ends.
        <span style={{
          position: 'absolute', left: '0.5px', top: '0.4lh', opacity: 0.5,
          borderLeft: '0.3em solid transparent', borderRight: '0.3em solid transparent', borderTop: '0.45em solid currentColor',
        }} />
      )}
    </span>
  )
}

/** Where a cell sits in its run: the viewer's `ctx.run` when it computed
 *  one, else derived from the neighboring rows (for a renderer used outside
 *  a viewer's `ditto` option — no `min` then, beyond 2). */
function runOf(ctx: TableCellCtx, spec: ResolvedRunSpec): { start: boolean; end: boolean } | undefined {
  if (ctx.run) return ctx.run
  const k = runKey(spec, ctx.value, ctx.row)
  if (k === undefined) return undefined
  const same = (r: Record<string, unknown> | undefined) => r !== undefined && Object.is(runKey(spec, r[ctx.column.name], r), k)
  const above = same(ctx.at(-1))
  const below = same(ctx.at(1))
  return above || below ? { start: !above, end: !below } : undefined
}

/** The modes drawn per cell (`'sticky'` is laid out by the viewer). */
const DRAWN = new Set<RunMode>(['mark', 'line', 'arrow'])

/** A cell renderer drawing runs in the `ditto` columns: `'mark'` replaces
 *  each cell after a run's first with {@link dittoMark}, `'line'` and
 *  `'arrow'` with {@link runLine}. Other cells (and `'sticky'`/`'none'` columns, which the
 *  viewer lays out itself) pass `defaultNode` through. Empty values never
 *  join a run. Chain it ahead of your own renderer with
 *  `chainCellRenderers`, or pass the viewer's `ditto` option, which does
 *  exactly that. */
export function dittoRenderer<C extends TableColumn = TableColumn>(ditto: DittoOption): TableCellRenderer<C> {
  const specs = normalizeDitto(ditto)
  return ctx => {
    const spec = specs.get(ctx.column.name)
    if (!spec || !DRAWN.has(spec.mode)) return ctx.defaultNode
    const run = runOf(ctx, spec)
    if (!run || run.start) return ctx.defaultNode
    return spec.mode === 'mark' ? dittoMark(ctx.value) : runLine(ctx.value, run.end, spec.mode === 'arrow' ? 'arrow' : 'tick')
  }
}

const DIM = 0.4

/** A path with its first `shared` characters dimmed — the whole segments it
 *  shares with the row above (see `sharedPathPrefix`). Both parts stay in
 *  the text, so a copy yields the full path. */
export function dimmedPath(path: string, shared: number): ReactNode {
  if (shared <= 0) return path
  return <><span style={{ opacity: DIM }}>{path.slice(0, shared)}</span>{path.slice(shared)}</>
}

/** A path cell in `'dim'` mode: dimmed against `above` (the row above's
 *  value). */
export function dimPathNode(path: string, above: unknown): ReactNode {
  return dimmedPath(path, typeof above === 'string' ? sharedPathPrefix(path, above) : 0)
}

/** A row's tail under a `'tree'` parent row: a branch glyph (`├`, or `└` on
 *  the group's last row), then the tail. The parent is kept in the text,
 *  visually hidden, so a copy yields the full path. */
export function treeChildNode(parent: string, tail: string, last: boolean): ReactNode {
  return (
    <>
      <span aria-hidden style={{ opacity: DIM, whiteSpace: 'pre' }}>{last ? '└ ' : '├ '}</span>
      <span style={{ fontSize: 0 }}>{parent}</span>
      {tail}
    </>
  )
}

const RULE_X = '0.9em'
const pct = (x: number, span: number) => `${(x / span) * 100}%`

/** An arrowhead centered on the rule, its top at `top`. */
function arrowhead(top: string, key: string | number): ReactNode {
  return (
    <span
      key={key}
      style={{
        position: 'absolute', top, left: `calc(${RULE_X} - 0.3em + 0.5px)`, opacity: 0.5,
        borderLeft: '0.3em solid transparent', borderRight: '0.3em solid transparent', borderTop: '0.45em solid currentColor',
      }}
    />
  )
}

/** A built-in {@link RunRenderer}: the run's value (floating under the
 *  sticky header while any of the run is in view, unless `float: false`),
 *  and below it, positioned by `offsets / span`:
 *  - `'sticky'`: nothing.
 *  - `'mark'`: `〃` on each row after the first.
 *  - `'line'`: a rule from the second row to the last, ending in `└`.
 *  - `'arrow'`: a rule with an arrowhead every `every` rows and at the end.
 *
 *  The value sits on an opaque box (`--ft-run-bg`, default `Canvas`), so a
 *  floating value occludes the rule behind it. Uses only {@link RunCellCtx}:
 *  a template for your own. */
export function runRenderer<C extends TableColumn = TableColumn>(
  mode: Exclude<RunMode, 'none'>,
  opts: { float?: boolean; every?: number } = {},
): RunRenderer<C> {
  const { float = true, every = 5 } = opts
  return ({ span, offsets, defaultNode, stickyTop }) => {
    const last = offsets[offsets.length - 1]
    const deco: ReactNode[] = []
    if (mode === 'mark') {
      for (const o of offsets.slice(1)) {
        deco.push(
          <span key={o} aria-label="ditto" style={{
            position: 'absolute', left: 0, right: 0, top: pct(o, span), height: pct(1, span),
            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3,
          }}>〃</span>,
        )
      }
    } else if ((mode === 'line' || mode === 'arrow') && offsets.length > 1) {
      const top = pct(offsets[0] + 1, span)
      const bottom = pct(span - last - 0.5, span)
      deco.push(
        <span key="rule" aria-label={mode === 'line' ? 'run line' : 'run arrow'} style={{
          position: 'absolute', left: RULE_X, top, bottom, opacity: 0.35, borderLeft: RULE,
          ...(mode === 'line' ? { width: '0.6em', borderBottom: RULE } : {}),
        }} />,
      )
      if (mode === 'arrow') {
        offsets.forEach((o, k) => {
          if (k > 0 && k < offsets.length - 1 && every > 0 && k % every === 0) deco.push(arrowhead(`calc(${pct(o + 0.5, span)} - 0.3em)`, k))
        })
        deco.push(arrowhead(`calc(${pct(last + 0.5, span)} - 0.2em)`, 'end'))
      }
    }
    return (
      <>
        <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{deco}</span>
        <div style={{
          position: float ? 'sticky' : 'relative', ...(float ? { top: stickyTop } : {}),
          background: 'var(--ft-run-bg, Canvas)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {defaultNode}
        </div>
      </>
    )
  }
}
