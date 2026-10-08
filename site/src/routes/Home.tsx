import { useMemo } from 'react'
import { FileTree, walkTreeSource } from '@rdub/file-tree/react'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'
import { renderCode } from '@rdub/file-tree/renderers/code'
import { renderJsonTree } from '@rdub/file-tree/renderers/json'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { DOCS_FIXTURE } from '../fixtures/docs'
import { PathSearch } from '../components/PathSearch'

/** The landing page is the component, browsing the project's own docs:
 *  the root lists `README.md` + `docs/` and renders the README beneath, and
 *  every doc is a route (`/docs/tables.md`). Mounted at the site root, so it
 *  owns every path the demo routes don't. */
export function Home() {
  const store = useMemo(() => MockStore(DOCS_FIXTURE, { describe: 'file-tree' }), [])
  const treeSource = useMemo(() => walkTreeSource(store), [store])
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5em' }}>
      <PathSearch source={treeSource} routeBase="">
        <FileTree
          store={store}
          routeBase=""
          treeSource={treeSource}
          markdownRenderer={renderMarkdown}
          codeRenderer={renderCode}
          jsonRenderer={renderJsonTree}
          usePersistedState={useUrlPersistedState}
        />
      </PathSearch>
    </div>
  )
}
