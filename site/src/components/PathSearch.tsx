import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HotkeysProvider, Omnibar, SearchTrigger, useOmnibarEndpoint, type OmnibarEntry } from 'use-kbd'
import 'use-kbd/styles.css'
import type { TreeSource } from '@rdub/file-tree/react'
import { treePathEndpoint } from '@rdub/file-tree/omnibar'

/** The folder the URL is showing (tree-relative): the dir itself for a
 *  `…/dir/` URL, the parent of a file view. */
function currentDir(pathname: string, routeBase: string): string {
  const rest = decodeURIComponent(pathname.slice(routeBase.length)).replace(/^\/+/, '')
  if (!rest || rest.endsWith('/')) return rest.replace(/\/+$/, '')
  const i = rest.lastIndexOf('/')
  return i < 0 ? '' : rest.slice(0, i)
}

/** ⌘K path search: this folder's subtree first, then the rest of the tree
 *  (minus this folder, so nothing is listed twice) in a lower-priority group. */
function Endpoints({ source, routeBase }: { source: TreeSource; routeBase: string }) {
  const dir = currentDir(useLocation().pathname, routeBase)
  const here = useMemo(() => treePathEndpoint(source, { routeBase, path: dir, group: dir ? `In ${dir}/` : 'Files', priority: 50 }), [source, routeBase, dir])
  const rest = useMemo(() => treePathEndpoint(source, { routeBase, excludePath: dir, group: 'Elsewhere', priority: 40, enabled: !!dir }), [source, routeBase, dir])
  useOmnibarEndpoint('files-here', here)
  useOmnibarEndpoint('files-elsewhere', rest)
  return null
}

export function PathSearch({ source, routeBase, children }: { source: TreeSource; routeBase: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  // SPA navigation for link entries; the Omnibar's default is a full-page
  // `window.location` assignment.
  const onExecuteRemote = (e: OmnibarEntry) => { if ('href' in e && e.href) navigate(e.href) }
  return (
    <HotkeysProvider>
      <Endpoints source={source} routeBase={routeBase} />
      <Omnibar placeholder="Search paths…" onExecuteRemote={onExecuteRemote} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SearchTrigger ariaLabel="Search paths (⌘K)" />
      </div>
      {children}
    </HotkeysProvider>
  )
}
