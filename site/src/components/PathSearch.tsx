import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HotkeysProvider, Omnibar, SearchIcon, SearchTrigger, useOmnibarEndpoint, type OmnibarEntry } from 'use-kbd'
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

/** ⌘K path search: this folder's subtree first (unlabeled; each hit's path
 *  says where it is), then the rest of the tree (minus this folder, so
 *  nothing is listed twice) under "Elsewhere". */
function Endpoints({ source, routeBase }: { source: TreeSource; routeBase: string }) {
  const dir = currentDir(useLocation().pathname, routeBase)
  const here = useMemo(() => treePathEndpoint(source, { routeBase, path: dir, group: null, priority: 50 }), [source, routeBase, dir])
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
      {/* Pinned to the top-right of the tree, level with its `<h1>` title,
          rather than a row of its own above it. */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '0.1em', right: 0 }}>
          <SearchTrigger ariaLabel="Search paths (⌘K)">
            <SearchIcon /> <kbd style={{ fontSize: '0.8em', opacity: 0.75 }}>⌘K</kbd>
          </SearchTrigger>
        </div>
        {children}
      </div>
    </HotkeysProvider>
  )
}
