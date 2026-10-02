/** `/runs`: the table viewers' `ditto` run modes and `paths` elision, on a
 *  `<RowsTable>` of in-memory rows shaped like disk-tree's action log —
 *  batches that share an actor, a time, an owner, a status and a note, over
 *  paths that share long prefixes. */
import { useMemo, useState } from 'react'
import { RowsTable } from '@rdub/file-tree/renderers/rowsTable'
import type { DittoOption, PathsOption, RunMode } from '@rdub/file-tree/renderers/tableRuns'
import type { TableCellRenderer } from '@rdub/file-tree/renderers/table'
import { Segmented } from '../components/Segmented'

const NOW = Date.UTC(2026, 9, 1, 12)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Deterministic PRNG (mulberry32), so the fixture is the same every load. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WHO = ['david@oa.dev', 'kaiyue@oa.dev', 'ahmed@oa.dev', 'percy@oa.dev']
const OWNERS = ['bolinas', 'tootsie', 'marin-infra', 'dclm']
const STATUS = ['keep', 'delete', 'archive']
const NOTES = [
  'superseded by the p1B-i3x sweep; keep only final checkpoints',
  'one-off eval dumps, safe to drop',
  'tokenized shards for the mix-v0.9 ablations, still referenced by the trainer configs',
  '',
]
const EXPERIMENTS = ['dna-bolinas-mix-v0.9-p1B', 'tootsie-8b-cooldown', 'dclm-baseline-1b', 'marin-eval-harness']

/** ~250 action-log rows in batches, newest first. */
function actionLog() {
  const r = rng(7)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const rows: Record<string, unknown>[] = []
  let t = NOW - 3 * HOUR
  while (rows.length < 250) {
    const size = r() < 0.3 ? 1 : 2 + Math.floor(r() * 40)
    const who = pick(WHO)
    const owner = pick(OWNERS)
    const status = pick(STATUS)
    const note = pick(NOTES)
    const exp = pick(EXPERIMENTS)
    const bucket = r() < 0.7 ? 'marin-us-east5' : 'marin-eu-west4'
    const kind = r() < 0.6 ? 'checkpoints' : 'tokenized'
    for (let i = 0; i < size; i++) {
      rows.push({
        who, when: t - i * 1000, owner, status, note,
        path: `gs://${bucket}/${kind}/${exp}-i${20 + i}-${(i * 7919 % 4096).toString(16).padStart(3, '0')}/`,
      })
    }
    t -= Math.floor(r() * 9 * DAY)
  }
  return rows
}

/** "5w ago"-style relative time: the run key and the display of `when`. */
function ago(ms: number): string {
  const d = NOW - ms
  if (d < HOUR) return `${Math.round(d / MIN)}m ago`
  if (d < DAY) return `${Math.round(d / HOUR)}h ago`
  if (d < 14 * DAY) return `${Math.round(d / DAY)}d ago`
  return `${Math.round(d / (7 * DAY))}w ago`
}

/** `when` as relative time — unless a run mode already replaced the cell. */
const renderWhen: TableCellRenderer = ctx => (ctx.column.name === 'when' && typeof ctx.defaultNode === 'string' ? ago(ctx.value as number) : ctx.defaultNode)

type Mode = RunMode | 'off'
type WhenKey = 'bucket' | 'raw'
type PathMode = 'off' | 'dim' | 'tree'

const ROWS = actionLog()

export function RunsDemo() {
  const [mode, setMode] = useState<Mode>('sticky')
  const [whenKey, setWhenKey] = useState<WhenKey>('bucket')
  const [pathMode, setPathMode] = useState<PathMode>('dim')

  const ditto = useMemo<DittoOption | undefined>(() => {
    if (mode === 'off') return undefined
    return {
      who: mode, owner: mode, status: mode, note: mode,
      when: whenKey === 'bucket' ? { mode, key: v => ago(v as number) } : mode,
    }
  }, [mode, whenKey])
  const paths = useMemo<PathsOption | undefined>(() => (pathMode === 'off' ? undefined : { path: pathMode }), [pathMode])

  const optionText = [
    mode === 'off' ? null : `ditto={{ who: '${mode}', owner: '${mode}', status: '${mode}', note: '${mode}', when: ${whenKey === 'bucket' ? `{ mode: '${mode}', key: ago }` : `'${mode}'`} }}`,
    pathMode === 'off' ? null : `paths={{ path: '${pathMode}' }}`,
  ].filter(Boolean).join('\n')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5em' }}>
      <h2 style={{ marginTop: 0 }}>Runs and paths</h2>
      <p style={{ opacity: 0.85, maxWidth: '56em' }}>
        An action log comes in batches: one batch shares an actor, a time, an owner, a status and a note, and its
        paths share most of their prefix. The table viewers' <code>ditto</code> option draws each run of equal values
        once (<em>mark</em> with <code>〃</code>, merge into one <em>sticky</em> cell whose value floats while you
        scroll, or rule a <em>line</em> down it), and <code>paths</code> dims the segments a path shares with the row
        above, or groups rows under their parent (<em>tree</em>, when sorted by path — click the header).
        The table is a <code>&lt;RowsTable&gt;</code>: {ROWS.length} in-memory rows, with the same sort, filter and
        paging as a parquet or SQLite file.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2em', margin: '1em 0' }}>
        <Segmented<Mode>
          label="Runs"
          value={mode}
          onChange={setMode}
          options={[
            { key: 'off', label: 'Off' },
            { key: 'mark', label: 'Mark' },
            { key: 'sticky', label: 'Sticky' },
            { key: 'line', label: 'Line' },
          ]}
        />
        <Segmented<WhenKey>
          label="when keyed on"
          value={whenKey}
          onChange={setWhenKey}
          options={[{ key: 'bucket', label: 'Relative time' }, { key: 'raw', label: 'Raw value' }]}
        />
        <Segmented<PathMode>
          label="Paths"
          value={pathMode}
          onChange={setPathMode}
          options={[
            { key: 'off', label: 'Off' },
            { key: 'dim', label: 'Dim' },
            { key: 'tree', label: 'Tree' },
          ]}
        />
      </div>
      {optionText && <pre style={{ fontSize: '0.8em', opacity: 0.8, margin: '0 0 1em', whiteSpace: 'pre-wrap' }}><code>{optionText}</code></pre>}

      <div data-testid="runs-table">
        <RowsTable
          rows={ROWS}
          path="assignments"
          renderCell={renderWhen}
          {...(ditto ? { ditto } : {})}
          {...(paths ? { paths } : {})}
          elide={{ ellipsis: { path: 'start' } }}
          resizableColumns
        />
      </div>
    </div>
  )
}
