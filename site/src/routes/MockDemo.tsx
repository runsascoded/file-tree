import { useMemo } from 'react'
import { FileTree } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { DEMO_FIXTURE } from '../fixtures/demo'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'
import { makeParquetViewer } from '@rdub/file-tree/renderers/parquet'
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
 *  inside it. `renderHeader` marks it so the two are visibly paired. */
const ParquetViewer = makeParquetViewer({
  cellProps: col => (col.name === 'region' ? { style: { textAlign: 'center', opacity: 0.85 } } : undefined),
  headerProps: col => (col.name === 'region' ? { style: { textAlign: 'center' } } : undefined),
  renderHeader: ({ column, stats, defaultNode }) =>
    column.name === 'region'
      ? <>{defaultNode}<span style={{ opacity: 0.5, fontWeight: 400 }}> (hooked)</span></>
      : stats?.nullCount
        ? <>{defaultNode}<span style={{ opacity: 0.5, fontWeight: 400 }}> ∅</span></>
        : defaultNode,
})

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
          The fixture is an <code>{'{ key: content }'}</code> object literal in{' '}
          <code>site/src/fixtures/demo.ts</code>. <code>MockStore</code> wraps it with the same{' '}
          <code>Store</code> interface real backends (R2, HTTP, …) implement, so{' '}
          <code>&lt;FileTree&gt;</code> renders identically.
        </p>
        <pre><code>{`import { FileTree } from '@rdub/file-tree/react'
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
