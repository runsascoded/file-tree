import { useMemo } from 'react'
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

/** The other way in: `<FileTree parquetOptions>` reaches the same hooks
 *  without a bound component, which is what you want once a hook closes
 *  over live state — the renderer type stays stable, so the table isn't
 *  remounted. Merged under whatever `makeParquetViewer` already baked
 *  in, so the two compose as long as they don't set the same key. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const parquetOptions: ParquetViewerOptions = {
  renderCell: ({ column, value, row, path, defaultNode }) => {
    if (path !== EVENTS) return defaultNode

    // FK link — the cell becomes a link to another file in this same
    // tree, so clicking `nyc` opens `docs/regions/nyc.md`. This is the
    // shape a consumer wants for id-like columns: the target can be a
    // route in the surrounding app just as easily as a sibling file.
    if (column.name === 'region') {
      return <Link to={`/mock/docs/regions/${value}.md`} title={`about ${value}`}>{defaultNode}</Link>
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
  renderHeader: ({ column, stats, path, defaultNode }) =>
    path === EVENTS && column.name === 'region'
      ? <>{defaultNode}<span style={{ opacity: 0.5, fontWeight: 400 }}> (hooked)</span></>
      : stats?.nullCount
        ? <>{defaultNode}<span style={{ opacity: 0.5, fontWeight: 400 }}> ∅</span></>
        : defaultNode,
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
          column. The <code>region</code> header and column styling come from{' '}
          <code>renderHeader</code> / <code>cellProps</code>. In <code>data/2024/</code>, the
          listing's own <code>renderCell</code> appends a quarter label to each key.
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
