/** `/runs`: the table viewers' `ditto` run modes, `paths` elision and row
 *  `groups`, on a
 *  `<RowsTable>` of in-memory rows shaped like disk-tree's action log —
 *  batches that share an actor, a time, an owner, a status and a note, over
 *  paths that share long prefixes. */
import { useMemo } from 'react'
import { RowsTable } from '@rdub/file-tree/renderers/rowsTable'
import { runGroups, type DittoOption, type GroupRows, type PathsOption, type RunMode, type RunSpec } from '@rdub/file-tree/renderers/tableRuns'
import type { TableCellRenderer, TableHeaderRenderer } from '@rdub/file-tree/renderers/table'
import { useUrlPersistedState, type PersistedState } from '@rdub/file-tree/url-state'
import { ColumnGear } from '../components/ColumnGear'
import { HelpFab } from '../components/HelpFab'
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
    const run = `${pick(EXPERIMENTS)}-i${20 + Math.floor(r() * 12)}`
    const bucket = r() < 0.7 ? 'marin-us-east5' : 'marin-eu-west4'
    const kind = r() < 0.6 ? 'checkpoints' : 'tokenized'
    const ext = kind === 'checkpoints' ? 'safetensors' : 'parquet'
    // A batch walks one run's steps, four shards each, so paths nest
    // bucket / kind / run / step / shard.
    for (let i = 0; i < size; i++) {
      rows.push({
        who, when: t - i * 1000, owner, status, note,
        path: `gs://${bucket}/${kind}/${run}/step-${1000 * (1 + Math.floor(i / 4))}/shard-${i % 4}.${ext}`,
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
type PathMode = 'off' | 'dim'
type GroupBy = 'none' | 'path' | 'who' | 'owner' | 'status'

const ROWS = actionLog()
const RUN_COLUMNS = ['who', 'when', 'owner', 'status', 'note'] as const
const MODES: { key: Mode; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: 'mark', label: 'Mark' },
  { key: 'sticky', label: 'Sticky' },
  { key: 'line', label: 'Line' },
  { key: 'arrow', label: 'Arrow' },
]
const PATH_MODES: { key: PathMode; label: string }[] = [{ key: 'off', label: 'Off' }, { key: 'dim', label: 'Dim' }]
const GROUP_BYS: { key: GroupBy; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'path', label: 'Path tree' },
  { key: 'who', label: 'who' },
  { key: 'owner', label: 'owner' },
  { key: 'status', label: 'status' },
]
const NOWRAP = { whiteSpace: 'nowrap' } as const

/** Golfed URL state: one-char keys and values, lists as concatenated chars.
 *  `?r=s` page-wide run mode · `?c=nalo` per-column overrides (column char +
 *  mode char pairs) · `?k=r` raw-value key · `?p=o` paths off · `?g=p`
 *  group by · and the table's own state, remapped: `?s=-p` sort, `?n=` page,
 *  `?q=` filter, `?f=` folded groups, `?h=` hidden columns. */
const MODE_CH = { off: 'o', mark: 'm', sticky: 's', line: 'l', arrow: 'a', none: 'x' } as const
const COL_CH: Record<string, string> = { who: 'w', when: 't', owner: 'o', status: 's', note: 'n', path: 'p' }
const GROUP_CH: Record<GroupBy, string> = { none: '', path: 'p', who: 'w', owner: 'o', status: 's' }
const invert = <V extends string>(o: Record<string, V>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]))
const CH_MODE = invert<string>(MODE_CH) as Record<string, Mode>
const CH_COL = invert(COL_CH)
const CH_GROUP = invert(GROUP_CH) as Record<string, GroupBy>
const TABLE_KEYS: Record<string, string> = { sort: 's', page: 'n', fold: 'f', hide: 'h', table: 't' }

const encSort = (v: string) => (v ? (v.startsWith('-') ? '-' : '') + (COL_CH[v.replace(/^-/, '')] ?? v.replace(/^-/, '')) : '')
const decSort = (v: string) => (v ? (v.startsWith('-') ? '-' : '') + (CH_COL[v.replace(/^-/, '')] ?? v.replace(/^-/, '')) : '')
const encHide = (v: string) => (v ? v.split(',').map(c => COL_CH[c] ?? '').join('') : '')
const decHide = (v: string) => [...v].map(ch => CH_COL[ch]).filter(Boolean).join(',')

/** The table's `usePersistedState`, with its keys and values golfed. */
const useGolfedState: PersistedState = <T extends string | number>(key: string, def: T): [T, (v: T) => void] => {
  const k = TABLE_KEYS[key] ?? key
  const codec = key === 'sort' ? [encSort, decSort] : key === 'hide' ? [encHide, decHide] : null
  const [v, set] = useUrlPersistedState<T>(k, (codec && typeof def === 'string' ? codec[0](def) : def) as T)
  if (!codec || typeof v !== 'string') return [v, set]
  return [codec[1](v) as T, x => set(codec[0](x as string) as T)]
}

function parseOverrides(raw: string): Map<string, Mode> {
  const out = new Map<string, Mode>()
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const c = CH_COL[raw[i]]
    const m = CH_MODE[raw[i + 1]]
    if (c && m) out.set(c, m)
  }
  return out
}
const fmtOverrides = (m: Map<string, Mode>) => [...m].map(([c, v]) => COL_CH[c] + MODE_CH[v]).join('')

export function RunsDemo() {
  const [rawBase, setRawBase] = useUrlPersistedState<string>('r', 's')
  const [rawOverrides, setRawOverrides] = useUrlPersistedState<string>('c', '')
  const [rawKey, setRawKey] = useUrlPersistedState<string>('k', 'b')
  const [rawPaths, setRawPaths] = useUrlPersistedState<string>('p', 'd')
  const [rawGroup, setRawGroup] = useUrlPersistedState<string>('g', '')
  const [, setSort] = useGolfedState<string>('sort', '')
  const mode: Mode = CH_MODE[rawBase] ?? 'sticky'
  const whenKey: WhenKey = rawKey === 'r' ? 'raw' : 'bucket'
  const pathMode: PathMode = rawPaths === 'o' ? 'off' : 'dim'
  const groupBy: GroupBy = CH_GROUP[rawGroup] ?? 'none'
  const overrides = useMemo(() => parseOverrides(rawOverrides), [rawOverrides])
  const modeOf = (c: string): Mode => overrides.get(c) ?? mode
  const setColumnMode = (c: string, m: Mode) => {
    const next = new Map(overrides)
    if (m === mode) next.delete(c)
    else next.set(c, m)
    setRawOverrides(fmtOverrides(next))
  }
  // A path tree needs the page sorted by path, so picking it sorts (the
  // column's "sort for tree" chip does the same from the header).
  const setGroupBy = (g: GroupBy) => {
    setRawGroup(GROUP_CH[g])
    if (g === 'path') setSort('path')
  }

  const agoKey = (v: unknown) => ago(v as number)
  const ditto = useMemo<DittoOption | undefined>(() => {
    const out: Record<string, RunMode | RunSpec> = {}
    for (const c of RUN_COLUMNS) {
      const m = overrides.get(c) ?? mode
      if (m === 'off') continue
      out[c] = c === 'when' && whenKey === 'bucket' ? { mode: m, key: agoKey } : m
    }
    return Object.keys(out).length ? out : undefined
  }, [mode, overrides, whenKey])
  const paths = useMemo<PathsOption | undefined>(
    () => (groupBy === 'path' ? { path: 'tree' } : pathMode === 'dim' ? { path: 'dim' } : undefined),
    [groupBy, pathMode])
  const groups = useMemo<GroupRows | undefined>(
    () => (groupBy === 'none' || groupBy === 'path' ? undefined : runGroups(groupBy)),
    [groupBy])

  const renderHeader: TableHeaderRenderer = ({ column, defaultNode }) => {
    const c = column.name
    if (c === 'path') {
      return <span style={NOWRAP}>{defaultNode}<ColumnGear column={c} label="paths" value={pathMode} options={PATH_MODES} onChange={m => setRawPaths(m === 'off' ? 'o' : 'd')} active={pathMode !== 'dim'} /></span>
    }
    if (!(RUN_COLUMNS as readonly string[]).includes(c)) return defaultNode
    return <span style={NOWRAP}>{defaultNode}<ColumnGear column={c} label="runs" value={modeOf(c)} options={MODES} onChange={m => setColumnMode(c, m)} active={overrides.has(c)} /></span>
  }

  const optionText = [
    ditto ? `ditto={{ ${Object.entries(ditto).map(([c, sp]) => `${c}: ${typeof sp === 'string' ? `'${sp}'` : `{ mode: '${sp.mode}', key: ago }`}`).join(', ')} }}` : null,
    paths ? `paths={{ path: '${groupBy === 'path' ? 'tree' : 'dim'}' }}` : null,
    groups ? `groups={runGroups('${groupBy}')}` : null,
  ].filter(Boolean).join('\n')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5em' }}>
      <h2 style={{ marginTop: 0 }}>Runs, paths and groups</h2>
      <p style={{ opacity: 0.85, maxWidth: '56em' }}>
        An action log comes in batches: one batch shares an actor, a time, an owner, a status and a note, and its
        paths share most of their prefix. The table viewers' <code>ditto</code> option draws each run of equal values
        as one cell whose value floats while you scroll, with <code>〃</code> marks, a line or an arrow beneath
        it; <code>paths</code> dims the segments a path shares with the row above; <code>groups</code> folds rows
        under collapsible headers — a multi-level path tree, or runs of a column. Each column's ⚙️ sets its own
        mode, and the URL carries all of it.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2em', margin: '1em 0' }}>
        <Segmented<Mode> label="Runs (all columns)" value={mode} onChange={m => { setRawBase(MODE_CH[m]); setRawOverrides('') }} options={MODES} />
        <Segmented<WhenKey>
          label="when keyed on"
          value={whenKey}
          onChange={k => setRawKey(k === 'raw' ? 'r' : 'b')}
          options={[{ key: 'bucket', label: 'Relative time' }, { key: 'raw', label: 'Raw value' }]}
        />
        <Segmented<PathMode> label="Paths" value={pathMode} onChange={m => setRawPaths(m === 'off' ? 'o' : 'd')} options={PATH_MODES} />
        <Segmented<GroupBy> label="Group by" value={groupBy} onChange={setGroupBy} options={GROUP_BYS} />
      </div>

      <div data-testid="runs-table">
        <RowsTable
          rows={ROWS}
          path="assignments"
          renderCell={renderWhen}
          renderHeader={renderHeader}
          usePersistedState={useGolfedState}
          {...(ditto ? { ditto } : {})}
          {...(paths ? { paths } : {})}
          {...(groups ? { groups } : {})}
          elide={{ ellipsis: { path: 'start' } }}
          resizableColumns
        />
      </div>

      <HelpFab title="The options behind this view">
        <p style={{ marginTop: 0 }}>The controls resolve to these <code>&lt;RowsTable&gt;</code> props:</p>
        <pre style={{ fontSize: '0.85em', whiteSpace: 'pre-wrap' }}><code>{optionText || '(none)'}</code></pre>
        <p>
          Every run mode is a public <code>RunRenderer</code> over <code>RunCellCtx</code> (<code>runRenderer(mode)</code>);
          pass <code>{'{ render }'}</code> in a column's spec to draw your own. Groups are any{' '}
          <code>{'(rows) => RowGroup[]'}</code>; <code>pathGroups</code> and <code>runGroups</code> are built in.
        </p>
      </HelpFab>
    </div>
  )
}
