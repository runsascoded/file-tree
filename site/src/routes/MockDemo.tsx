import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileTree, type CellRenderer } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { DEMO_FIXTURE } from '../fixtures/demo'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'
import { makeParquetViewer, type ParquetViewerOptions } from '@rdub/file-tree/renderers/parquet'
import { renderJsonTree } from '@rdub/file-tree/renderers/json'
import { CsvViewer } from '@rdub/file-tree/renderers/csv'
import { NotebookViewer } from '@rdub/file-tree/renderers/notebook'
import { renderCode } from '@rdub/file-tree/renderers/code'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { renderViewerActions } from '../viewerActions'
import { isS2Cell, S2Cell } from '../components/S2CellPreview'

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
  cellProps: (col, path) => (path === EVENTS && col.name === 'region' ? { style: { textAlign: 'center', opacity: 0.85 } } : undefined),
  headerProps: (col, path) => (path === EVENTS && col.name === 'region' ? { style: { textAlign: 'center' } } : undefined),
})

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

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
function useParquetOptions(): ParquetViewerOptions {
  const [rawCols, setRawCols] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = useCallback((col: string) => setRawCols(prev => {
    const next = new Set(prev)
    next.delete(col) || next.add(col)
    return next
  }), [])

  return useMemo((): ParquetViewerOptions => ({
  renderCell: ({ column, value, row, path, defaultNode }) => {
    if (path !== EVENTS) return defaultNode
    if (rawCols.has(column.name)) return rawText(value)

    // FK link — the cell becomes a link to another file in this same
    // tree, so clicking `nyc` opens `docs/regions/nyc.md`. This is the
    // shape a consumer wants for id-like columns: the target can be a
    // route in the surrounding app just as easily as a sibling file.
    if (column.name === 'region') {
      return <Link to={`/mock/docs/regions/${value}.md`} title={`about ${value}`}>{defaultNode}</Link>
    }

    // A cell can be a whole widget. `s2_cell` holds S2 tokens, which
    // are unreadable on their own, so hovering draws the footprint over
    // the region's points — see `S2CellPreview` for why it's tile-free.
    // Guarded on the value, not just the column: a non-token falls
    // through to the default rather than rendering blank.
    if (column.name === 's2_cell' && isS2Cell(value)) {
      return <S2Cell token={value} region={String(row['region'] ?? '')} />
    }

    // Replacing the value rather than wrapping it — note this is what
    // hides float noise like `36.960000000000004`, which is why
    // formatting has to happen here and not in CSS.
    if (column.name === 'value' && typeof value === 'number') {
      return usd.format(value)
    }

    // Decorating a *neighbouring* column's meaning: `row` is the whole
    // row, so a cell can render against a sibling it doesn't own.
    if (column.name === 'id' && row['region'] === 'nyc') {
      return <><span style={{ opacity: 0.45 }}>◆ </span>{defaultNode}</>
    }

    return defaultNode
  },
  renderHeader: ({ column, stats, path, defaultNode }) => {
    if (path !== EVENTS) return defaultNode
    const isRaw = rawCols.has(column.name)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35em' }}>
        {defaultNode}
        {stats?.nullCount ? <span style={{ opacity: 0.5, fontWeight: 400 }}>∅</span> : null}
        <button
          type="button"
          onClick={() => toggle(column.name)}
          aria-pressed={isRaw}
          title={isRaw ? `show formatted ${column.name}` : `show raw ${column.name}`}
          style={{
            font: 'inherit', fontSize: '0.85em', lineHeight: 1, cursor: 'pointer',
            padding: '0.1em 0.35em', borderRadius: 3,
            border: '1px solid rgba(127,127,127,0.4)',
            background: isRaw ? 'rgba(127,127,127,0.25)' : 'transparent',
            color: 'inherit', opacity: isRaw ? 1 : 0.55,
          }}
        >{isRaw ? 'raw' : '⌗'}</button>
      </span>
    )
  },
  }), [rawCols, toggle])
}

/** Directory-listing hooks, the same `defaultNode` convention one level
 *  up: decorate a key whose name encodes something the listing can't
 *  know (here, a quarter), without reimplementing the icon + `<Link>`. */
const QUARTER = /^data\/(\d{4})\/(q[1-4])\.csv$/
const label = (s: string) => <span style={{ opacity: 0.5, fontWeight: 400 }}> {s}</span>

const renderCell: CellRenderer = ({ entry, column, defaultNode }) => {
  if (column !== 'name') return defaultNode
  const m = QUARTER.exec(entry.key)
  return m ? <>{defaultNode}{label(`${m[2].toUpperCase()} ${m[1]}`)}</> : defaultNode
}

export function MockDemo() {
  const store = useMemo(() => MockStore(DEMO_FIXTURE, { pageSize: 100 }), [])
  const parquetOptions = useParquetOptions()
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <FileTree
        store={store}
        routeBase="/mock"
        title="MockStore demo"
        markdownRenderer={renderMarkdown}
        parquetRenderer={ParquetViewer}
        parquetOptions={parquetOptions}
        renderCell={renderCell}
        jsonRenderer={renderJsonTree}
        csvRenderer={CsvViewer}
        notebookRenderer={NotebookViewer}
        codeRenderer={renderCode}
        viewerActions={renderViewerActions}
        usePersistedState={useUrlPersistedState}
      />
      <details style={{ marginTop: '2em', fontSize: '0.9em', opacity: 0.85 }}>
        <summary>How this works</summary>
        <p>
          <strong>Render hooks.</strong> Everything a consumer can customize is on this page.
          In <code>samples/events.parquet</code>: <code>region</code> cells are{' '}
          <em>FK links</em> into <code>docs/regions/</code>, <code>value</code> is reformatted as
          currency (which is also what hides float noise), and <code>id</code> is marked on rows
          whose <code>region</code> is <code>nyc</code> — a cell rendering against a sibling
          column, and <code>s2_cell</code> is a <em>whole widget</em> — hover a token to see its
          footprint drawn over the region's points. In <code>data/2024/</code>, the listing's own{' '}
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
          Every header carries a <strong>raw/formatted toggle</strong> (<code>⌗</code>) — each
          rendering above is a guess about intent, so the honest complement is flipping a column
          back to its literal value in place. Page forward, then toggle: the table <em>keeps its
          page</em>, because the toggle's state reaches the hooks as props via{' '}
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
        <pre><code>{`import { FileTree, type CellRenderer } from '@rdub/file-tree/react'
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
