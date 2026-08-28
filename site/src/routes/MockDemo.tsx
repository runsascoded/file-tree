import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileTree, type CellRenderer, type ViewerEntry } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { DEMO_FIXTURE } from '../fixtures/demo'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'
import { makeParquetViewer, type ParquetViewerOptions } from '@rdub/file-tree/renderers/parquet'
import type { TableCellCtx } from '@rdub/file-tree/renderers/table'
import { renderJsonTree } from '@rdub/file-tree/renderers/json'
import { makeCsvViewer } from '@rdub/file-tree/renderers/csv'
import { NotebookViewer } from '@rdub/file-tree/renderers/notebook'
import { renderCode } from '@rdub/file-tree/renderers/code'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { renderViewerActions } from '../viewerActions'
import { isS2Cell, S2Cell } from '../components/S2CellPreview'
import { PageAside, type AsideState } from '../components/PageAside'

/** Exercises the parquet viewer's presentation hooks. Built at module
 *  scope: `makeParquetViewer` mints a component type, so calling it in
 *  render would remount the table (and drop its row-group cache) on
 *  every pass.
 *
 *  `region` is the interesting column — a `BYTE_ARRAY`, so it's left
 *  alone by the built-in numeric alignment, and `cellProps` centers it
 *  to show an override reaching the `<td>` itself rather than a wrapper
 *  inside it. `renderHeader` marks it so the two are visibly paired.
 *
 *  Both hooks gate on `path` as well as column name: one viewer serves
 *  the whole tree, so a `region` column in some *other* file wouldn't
 *  pick up this file's presentation. */
const EVENTS = 'samples/events.parquet'

const ParquetViewer = makeParquetViewer({
  cellProps: (col, path) => {
    if (path !== EVENTS) return
    if (col.name === 'region') return { style: { textAlign: 'center', opacity: 0.85 } }
    // `s2_cell`'s hover target fills the cell, so the padding has to
    // move off the `<td>` and onto it — otherwise the target stops at
    // the text and mousing down the column flickers.
    if (col.name === 's2_cell') return { style: { padding: 0 } }
  },
  headerProps: (col, path) => (path === EVENTS && col.name === 'region' ? { style: { textAlign: 'center' } } : undefined),
})

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Format-neutral, so the same rule reaches `.parquet` and `.csv`. The
 *  columns are named `value` in both, and a currency column is a
 *  currency column regardless of how it was stored — which is the whole
 *  argument for `TableViewerOptions` living above either format.
 *
 *  Note the CSV branch has to coerce: CSV has no types, so `value`
 *  arrives as a string where parquet hands over a `DOUBLE`. */
function renderMoney({ column, value, defaultNode }: TableCellCtx): ReactNode {
  if (column.name !== 'value') return defaultNode
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? usd.format(n) : defaultNode
}

/** `data/*.csv` gets the shared money rule and nothing else — proof the
 *  hook isn't parquet's. */
/** `fullLoadMaxBytes: 0` forces **streaming mode**, which every fixture
 *  here is far too small to reach naturally — the parquet table is 6 KB
 *  and sorts, so this is the demo of the other half: above the
 *  threshold the sort controls are *absent* (not greyed out) and a line
 *  says why. On a real 500 MB shard that's the honest behaviour;
 *  sorting would need the whole file. */
const CsvViewer = makeCsvViewer({ renderCell: renderMoney, columnPicker: true, fullLoadMaxBytes: 0 })

/** What the column holds underneath whatever we render. `hyparquet`
 *  resolves an annotated `TIMESTAMP` to a `Date` before the renderer
 *  sees it, so "raw" for that column is the epoch it came from, not
 *  `Date.prototype.toString`. */
function rawText(value: unknown): string {
  return value instanceof Date ? String(value.getTime()) : String(value)
}

/** Every formatting decision below is a guess about intent — an epoch
 *  read out of a bare `INT64`, a `DOUBLE` shown as currency. The honest
 *  complement is letting a reader flip any column back to its literal
 *  value in place, so the header carries a per-column toggle.
 *
 *  This is the case `parquetOptions` exists for: `rawCols` changes as
 *  you click, and a hook has to see the current value. Rebinding
 *  `makeParquetViewer` per toggle would mint a new component type and
 *  remount the table, dropping its row-group cache — so the options go
 *  through props on a stable type instead.
 *
 *  `useMemo`'d on `rawCols`: a new options object every parent render
 *  would re-render the table for reasons that have nothing to do with
 *  it. (The other way to do this is a React context the renderers read
 *  from — then only the cells re-render. Worth it once the state is
 *  shared with more than the table.) */
/** Per-column format choices.
 *
 *  The realistic shape, which a uniform raw/formatted toggle on every
 *  column is not: **most columns need no control at all** (a control
 *  everywhere is noise that stops meaning anything), and the ones that
 *  do want *different* controls — a temporal column's options aren't a
 *  float's. Several renderings are equally defensible, so it's a choice
 *  rather than a boolean; the honest end state is a typed format
 *  expression (d3-format, strftime), which this is one step short of.
 *
 *  None of this needs library support: `renderHeader` returns whatever
 *  control you want, and the state is the consumer's. */
const TEMPORAL_FORMATS = ['auto', 'ISO', 'epoch'] as const
const NUMBER_FORMATS = ['USD', 'raw', 'SI'] as const

const COLUMN_FORMATS: Record<string, readonly string[]> = {
  dt: TEMPORAL_FORMATS,
  event_ts: TEMPORAL_FORMATS,
  recorded: TEMPORAL_FORMATS,
  value: NUMBER_FORMATS,
  // `id`, `region` and `s2_cell` deliberately have none: an id is what
  // it is, and the other two are already links/widgets.
}

const si = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

function applyFormat(fmt: string, value: unknown, defaultNode: ReactNode): ReactNode {
  switch (fmt) {
    case 'epoch': return rawText(value)
    case 'ISO': {
      const ms = value instanceof Date ? value.getTime() : Number(value)
      return Number.isFinite(ms) ? new Date(ms).toISOString() : defaultNode
    }
    case 'raw': return rawText(value)
    case 'SI': {
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? si.format(n) : defaultNode
    }
    default: return null   // `auto`/`USD` — fall through to the demo's own rendering
  }
}

/** This is the case `parquetOptions` exists for: the chosen formats
 *  change as you click, and the hooks have to see the current value.
 *  Rebinding `makeParquetViewer` per change would mint a new component
 *  type and remount the table, dropping its row-group cache — so the
 *  options go through props on a stable type instead.
 *
 *  `useMemo`'d on `formats`: a new options object every parent render
 *  would re-render the table for reasons unrelated to it. */
function useParquetOptions(aside: (s: Partial<AsideState>) => void): ParquetViewerOptions {
  const [formats, setFormats] = useState<Readonly<Record<string, string>>>({})
  const pick = useCallback(
    (col: string, fmt: string) => setFormats(prev => ({ ...prev, [col]: fmt })),
    [])

  return useMemo((): ParquetViewerOptions => ({
  columnPicker: true,
  // The two outward hooks. Inline arrows are safe — the viewer holds
  // them in refs, so their identity changing every render doesn't
  // re-fire anything.
  onPage: page => aside({ page }),
  onCellHover: cell => aside({ cell }),
  renderCell: ({ column, value, row, rowIndex, path, defaultNode }) => {
    if (path !== EVENTS) return defaultNode

    const chosen = formats[column.name]
    if (chosen) {
      const out = applyFormat(chosen, value, defaultNode)
      if (out !== null) return out
    }

    // FK link — the cell becomes a link to another file in this same
    // tree, so clicking `nyc` opens `docs/regions/nyc.md`. This is the
    // shape a consumer wants for id-like columns: the target can be a
    // route in the surrounding app just as easily as a sibling file.
    if (column.name === 'region') {
      return <Link to={`/mock/docs/regions/${value}.md`} title={`about ${value}`}>{defaultNode}</Link>
    }

    // A cell can be a whole widget — and one that reads a *sibling*
    // column: the preview needs `row.region` to know which points to
    // draw the footprint over. `row` is the whole row for exactly this.
    // Guarded on the value, not just the column: a non-token falls
    // through to the default rather than rendering blank.
    if (column.name === 's2_cell' && isS2Cell(value)) {
      return <S2Cell token={value} region={String(row['region'] ?? '')} />
    }

    // Replacing the value rather than wrapping it — note this is what
    // hides float noise like `36.960000000000004`, which is why
    // formatting has to happen here and not in CSS. Shared with the CSV
    // viewer, which takes the same hook.
    if (column.name === 'value') return renderMoney({ column, value, row, rowIndex, path, defaultNode })

    return defaultNode
  },
  renderHeader: ({ column, stats, path, defaultNode }) => {
    if (path !== EVENTS) return defaultNode
    const choices = COLUMN_FORMATS[column.name]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35em' }}>
        {defaultNode}
        {stats?.nullCount ? <span style={{ opacity: 0.5, fontWeight: 400 }}>∅</span> : null}
        {choices && (
          <select
            value={formats[column.name] ?? choices[0]}
            onChange={e => pick(column.name, e.target.value)}
            title={`${column.name} format`}
            style={{
              font: 'inherit', fontSize: '0.85em', padding: '0 0.1em',
              background: 'transparent', color: 'inherit',
              border: '1px solid rgba(127,127,127,0.4)', borderRadius: 3,
            }}
          >
            {choices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </span>
    )
  },
  }), [formats, pick, aside])
}

/** The viewer registry. `.log` is a format the library knows nothing
 *  about — no `kind` in `parsePath`, no `logRenderer` prop — and this
 *  is the whole of teaching it. `load` being a dynamic import means the
 *  viewer lands in its own chunk and is fetched when a `.log` is first
 *  opened, not on page load.
 *
 *  Module scope so `match` isn't rebuilt every render; `id` is what the
 *  lazy component is cached under, so it has to be stable. */
/** The same parquet file in **streaming mode**, so the other half of
 *  small-table mode is demoed on real data: above the threshold there's
 *  no table to filter, but a *comparison* can still be answered from
 *  the footer, pruning row groups that provably can't match. Try
 *  `id >= 1777075200500` on `samples/events.pqt`. */
const StreamingParquetViewer = makeParquetViewer({ fullLoadMaxBytes: 0, columnPicker: true })

const VIEWERS: readonly ViewerEntry<never>[] = [
  {
    id: 'parquet-streaming',
    match: ({ ext }) => ext === 'pqt',
    load: async () => ({ default: StreamingParquetViewer }),
  },
  {
    id: 'log',
    match: ({ ext }) => ext === 'log',
    load: () => import('../components/LogViewer'),
  },
  // YAML gets the JSON tree — same collapsible nodes, search, depth
  // controls, and jq, because everything downstream works on the parsed
  // value and by then YAML *is* JSON. Registered rather than passed as
  // a prop so neither this nor the `yaml` parser reaches the main
  // bundle: a page that never opens a `.yaml` never downloads one.
  {
    id: 'yaml',
    match: ({ ext }) => ext === 'yaml' || ext === 'yml',
    load: () => import('../components/YamlViewer'),
  },
]

/** Directory-listing hooks, the same `defaultNode` convention one level
 *  up: decorate a key whose name encodes something the listing can't
 *  know, without reimplementing the icon + `<Link>`.
 *
 *  Two things here. A quarter label parsed out of `data/YYYY/qN.csv`,
 *  and — more useful — a summary of what's *inside* each directory, so
 *  the tree says which formats live where instead of making you open
 *  every one to find out. The library can't do this itself: it lists one
 *  prefix at a time and has no business walking the whole store. A
 *  consumer who knows their own layout can. */
const QUARTER = /^data\/(\d{4})\/(q[1-4])\.csv$/
const label = (s: string) => <span style={{ opacity: 0.5, fontWeight: 400 }}> {s}</span>

const EXT_LABEL: Record<string, string> = {
  md: 'markdown', csv: 'csv', log: 'log', parquet: 'parquet',
  json: 'json', yaml: 'yaml',
}

/** `prefix` → what's under it, as `2 dirs · markdown`. Built once from
 *  the fixture's keys: the demo's store is an object literal, so this is
 *  a `Object.keys` walk, not a crawl. */
const DIR_SUMMARY: Record<string, string> = (() => {
  const dirs: Record<string, { subdirs: Set<string>; exts: Set<string> }> = {}
  for (const key of Object.keys(DEMO_FIXTURE)) {
    const parts = key.split('/')
    for (let i = 0; i < parts.length - 1; i++) {
      const prefix = parts.slice(0, i + 1).join('/') + '/'
      const d = (dirs[prefix] ??= { subdirs: new Set(), exts: new Set() })
      if (i + 2 < parts.length) d.subdirs.add(parts[i + 1]!)
      // Extensions are counted *recursively* — `data/` holds only
      // subdirectories, and "2 dirs" alone doesn't answer the question
      // you opened it to answer.
      d.exts.add(parts[parts.length - 1]!.split('.').pop()!.toLowerCase())
    }
  }
  return Object.fromEntries(Object.entries(dirs).map(([prefix, { subdirs, exts }]) => {
    const bits: string[] = []
    if (subdirs.size) bits.push(`${subdirs.size} dir${subdirs.size === 1 ? '' : 's'}`)
    const named = [...exts].map(e => EXT_LABEL[e] ?? e).sort()
    if (named.length) bits.push(named.join(', '))
    return [prefix, bits.join(' · ')]
  }))
})()

const renderCell: CellRenderer = ({ entry, column, defaultNode }) => {
  if (column !== 'name') return defaultNode
  const summary = entry.key.endsWith('/') ? DIR_SUMMARY[entry.key] : undefined
  if (summary) return <>{defaultNode}{label(summary)}</>
  const m = QUARTER.exec(entry.key)
  return m ? <>{defaultNode}{label(`${m[2].toUpperCase()} ${m[1]}`)}</> : defaultNode
}

export function MockDemo() {
  const store = useMemo(() => MockStore(DEMO_FIXTURE, { pageSize: 100 }), [])
  // Held here, beside the tree rather than inside it: the panel is a
  // *sibling* of the table, which is the whole reason these are
  // callbacks and not a render slot the viewer could fill.
  const [asideState, setAsideState] = useState<AsideState>({ page: null, cell: null })
  const aside = useCallback((s: Partial<AsideState>) => setAsideState(prev => ({ ...prev, ...s })), [])
  const parquetOptions = useParquetOptions(aside)
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <div style={{ display: 'flex', gap: '1em', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
      <FileTree
        store={store}
        routeBase="/mock"
        title="MockStore demo"
        markdownRenderer={renderMarkdown}
        parquetRenderer={ParquetViewer}
        parquetOptions={parquetOptions}
        viewers={VIEWERS}
        renderCell={renderCell}
        jsonRenderer={renderJsonTree}
        csvRenderer={CsvViewer}
        notebookRenderer={NotebookViewer}
        codeRenderer={renderCode}
        viewerActions={renderViewerActions}
        usePersistedState={useUrlPersistedState}
      />
      </div>
      {asideState.page && <PageAside {...asideState} />}
      </div>
      <details style={{ marginTop: '2em', fontSize: '0.9em', opacity: 0.85 }}>
        <summary>How this works</summary>
        <p>
          <strong>Render hooks.</strong> Everything a consumer can customize is on this page.
          In <code>samples/events.parquet</code>: <code>region</code> cells are{' '}
          <em>FK links</em> into <code>docs/regions/</code>, <code>value</code> is reformatted as
          currency (which is also what hides float noise), and <code>id</code> is marked on rows
          currency, and <code>s2_cell</code> is a <em>whole widget</em> — hover a token to see its
          footprint drawn over the region's coastline and points. That preview also reads a{' '}
          <em>sibling</em> column: it needs <code>row.region</code> to know which place to draw. In <code>data/2024/</code>, the listing's own{' '}
          <code>renderCell</code> appends a quarter label to each key.
        </p>
        <p>
          The S2 preview is deliberately <strong>tile-free</strong>: a map instance per hovered row
          would mean an API key, rate limits, attribution, and a GL context per cell, to answer a
          question an inline SVG answers with no network at all. It's also{' '}
          <em>consumer</em> code — <code>@rdub/file-tree</code> knows nothing about S2. The library
          hands you <code>renderCell</code>; what you decode in it is your business.
        </p>
        <p>
          <strong>Format controls</strong> sit on the columns that have a real choice, and only
          those: a temporal column offers <code>auto / ISO / epoch</code>, <code>value</code> offers{' '}
          <code>USD / raw / SI</code>, and <code>id</code> offers nothing — a control on every
          column is noise that stops meaning anything. (The honest end state is a typed format
          expression; this is one step short.) Page forward, then change one: the table{' '}
          <em>keeps its page</em>, because the choice reaches the hooks as props via{' '}
          <code>parquetOptions</code>. Rebinding <code>makeParquetViewer</code> per toggle would
          mint a new component type and remount the table, resetting the pager and dropping its
          row-group cache.
        </p>
        <p>
          Each hook is handed the node the library <em>would</em> have rendered, as{' '}
          <code>defaultNode</code> — so decorating never means reimplementing the default (the
          link, icon, and size formatting all survive). All of them also receive{' '}
          <code>path</code>, so one viewer serves a whole tree of unrelated schemas.
        </p>
        <p>
          The fixture is an <code>{'{ key: content }'}</code> object literal in{' '}
          <code>site/src/fixtures/demo.ts</code>. <code>MockStore</code> wraps it with the same{' '}
          <code>Store</code> interface real backends (R2, HTTP, …) implement, so{' '}
          <code>&lt;FileTree&gt;</code> renders identically.
        </p>
        <pre><code>{`import { FileTree, type CellRenderer, type ViewerEntry } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'

const store = MockStore({
  'README.md': '# fixture',
  'data/q1.csv': 'a,b\\n1,2\\n',
  'docs/intro.md': '...',
})

<FileTree store={store} routeBase="/mock" />`}</code></pre>
      </details>
    </div>
  )
}
