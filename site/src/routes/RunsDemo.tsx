/** `/runs`: the table viewers' `ditto` run modes and `paths` elision, on a
 *  `<RowsTable>` of in-memory rows shaped like disk-tree's action log —
 *  batches that share an actor, a time, an owner, a status and a note, over
 *  paths that share long prefixes. */
import { useMemo } from 'react'
import { RowsTable } from '@rdub/file-tree/renderers/rowsTable'
import type { DittoOption, PathsOption, RunMode, RunSpec } from '@rdub/file-tree/renderers/tableRuns'
import type { TableCellRenderer, TableHeaderRenderer } from '@rdub/file-tree/renderers/table'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { ColumnGear } from '../components/ColumnGear'
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
const RUN_COLUMNS = ['who', 'when', 'owner', 'status', 'note'] as const
const MODES: { key: Mode; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: 'mark', label: 'Mark' },
  { key: 'sticky', label: 'Sticky' },
  { key: 'line', label: 'Line' },
  { key: 'arrow', label: 'Arrow' },
]
const PATH_MODES: { key: PathMode; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: 'dim', label: 'Dim' },
  { key: 'tree', label: 'Tree' },
]
const NOWRAP = { whiteSpace: 'nowrap' } as const
const isMode = (m: string): m is Mode => MODES.some(o => o.key === m)

/** Per-column overrides of the page-wide run mode, as `?rc=note:line,who:arrow`. */
function parseOverrides(raw: string): Map<string, Mode> {
  return new Map(raw.split(',').map(kv => kv.split(':')).filter((kv): kv is [string, Mode] => kv.length === 2 && isMode(kv[1])))
}
const fmtOverrides = (m: Map<string, Mode>) => [...m].map(([c, v]) => `${c}:${v}`).join(',')

export function RunsDemo() {
  // All page state is in the URL, so any view deep-links: `?r=` (page-wide
  // run mode), `?rc=` (per-column overrides), `?key=`, `?p=` (path mode),
  // plus the table's own `?sort=`, `?page=`, `?q=`.
  const [base, setBase] = useUrlPersistedState<string>('r', 'sticky')
  const [rawOverrides, setRawOverrides] = useUrlPersistedState<string>('rc', '')
  const [whenKey, setWhenKey] = useUrlPersistedState<string>('key', 'bucket')
  const [pathMode, setPathMode] = useUrlPersistedState<string>('p', 'dim')
  const [, setSort] = useUrlPersistedState<string>('sort', '')
  const mode: Mode = isMode(base) ? base : 'sticky'
  const overrides = useMemo(() => parseOverrides(rawOverrides), [rawOverrides])
  const modeOf = (c: string): Mode => overrides.get(c) ?? mode
  const setColumnMode = (c: string, m: Mode) => {
    const next = new Map(overrides)
    if (m === mode) next.delete(c)
    else next.set(c, m)
    setRawOverrides(fmtOverrides(next))
  }
  // Tree needs the page sorted by path, so picking it sorts (the column's
  // "sort for tree" chip does the same from the header).
  const setPaths = (m: PathMode) => {
    setPathMode(m)
    if (m === 'tree') setSort('path')
  }

  const ditto = useMemo<DittoOption | undefined>(() => {
    const out: Record<string, RunMode | RunSpec> = {}
    for (const c of RUN_COLUMNS) {
      const m = overrides.get(c) ?? mode
      if (m === 'off') continue
      out[c] = c === 'when' && whenKey === 'bucket' ? { mode: m, key: v => ago(v as number) } : m
    }
    return Object.keys(out).length ? out : undefined
  }, [mode, overrides, whenKey])
  const paths = useMemo<PathsOption | undefined>(() => (pathMode === 'dim' || pathMode === 'tree' ? { path: pathMode } : undefined), [pathMode])

  const renderHeader: TableHeaderRenderer = ({ column, defaultNode }) => {
    const c = column.name
    if (c === 'path') {
      return <span style={NOWRAP}>{defaultNode}<ColumnGear column={c} label="paths" value={pathMode as PathMode} options={PATH_MODES} onChange={setPaths} active={pathMode !== 'dim'} /></span>
    }
    if (!(RUN_COLUMNS as readonly string[]).includes(c)) return defaultNode
    return <span style={NOWRAP}>{defaultNode}<ColumnGear column={c} label="runs" value={modeOf(c)} options={MODES} onChange={m => setColumnMode(c, m)} active={overrides.has(c)} /></span>
  }

  const optionText = [
    ditto ? `ditto={{ ${Object.entries(ditto).map(([c, s]) => `${c}: ${typeof s === 'string' ? `'${s}'` : `{ mode: '${s.mode}', key: ago }`}`).join(', ')} }}` : null,
    paths ? `paths={{ path: '${pathMode}' }}` : null,
  ].filter(Boolean).join('\n')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5em' }}>
      <h2 style={{ marginTop: 0 }}>Runs and paths</h2>
      <p style={{ opacity: 0.85, maxWidth: '56em' }}>
        An action log comes in batches: one batch shares an actor, a time, an owner, a status and a note, and its
        paths share most of their prefix. The table viewers' <code>ditto</code> option draws each run of equal values
        once (<em>mark</em> with <code>〃</code>, merge into one <em>sticky</em> cell whose value floats while you
        scroll, or rule a <em>line</em> or <em>arrow</em> down it), and <code>paths</code> dims the segments a path shares with the row
        above, or groups rows under their parent (<em>tree</em>, when sorted by path — click the header).
        The table is a <code>&lt;RowsTable&gt;</code>: {ROWS.length} in-memory rows, with the same sort, filter and
        paging as a parquet or SQLite file. Each column's ⚙️ sets its own mode; the URL carries all of it.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2em', margin: '1em 0' }}>
        <Segmented<Mode>
          label="Runs (all columns)"
          value={mode}
          onChange={m => { setBase(m); setRawOverrides('') }}
          options={MODES}
        />
        <Segmented<WhenKey>
          label="when keyed on"
          value={whenKey as WhenKey}
          onChange={setWhenKey}
          options={[{ key: 'bucket', label: 'Relative time' }, { key: 'raw', label: 'Raw value' }]}
        />
        <Segmented<PathMode>
          label="Paths"
          value={pathMode as PathMode}
          onChange={setPaths}
          options={PATH_MODES}
        />
      </div>
      {optionText && <pre style={{ fontSize: '0.8em', opacity: 0.8, margin: '0 0 1em', whiteSpace: 'pre-wrap' }}><code>{optionText}</code></pre>}

      <div data-testid="runs-table">
        <RowsTable
          rows={ROWS}
          path="assignments"
          renderCell={renderWhen}
          renderHeader={renderHeader}
          usePersistedState={useUrlPersistedState}
          {...(ditto ? { ditto } : {})}
          {...(paths ? { paths } : {})}
          elide={{ ellipsis: { path: 'start' } }}
          resizableColumns
        />
      </div>
    </div>
  )
}
