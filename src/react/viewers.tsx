/** The viewer registry: how a path finds the component that renders it.
 *
 *  `<FileTree>` grew one prop per format (`parquetRenderer`,
 *  `csvRenderer`, `notebookRenderer`, …), which has two problems that
 *  compound as the list grows. Adding a format means editing the
 *  library — so nobody can teach it about HDF5 or `.rtf` without a PR.
 *  And the props are eagerly-imported components, so a page browsing
 *  CSVs still bundles `hyparquet`.
 *
 *  A registry fixes both. Consumers compose an ordered list, first
 *  match wins, and `load` is a dynamic import — so the bundler splits
 *  each viewer into its own chunk and a page pays only for the formats
 *  it actually opens.
 *
 *  See `specs/viewer-registry.md`. */
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import type { Store } from '../types'
import type { PersistedState } from './persistedState'
import { extOf } from './parsePath'

/** What a viewer is handed. Every viewer takes these; anything else it
 *  needs comes from its entry's `options`. */
export interface ViewerProps {
  store: Store
  path: string
  usePersistedState?: PersistedState
}

/** What `match` gets to decide on. Deliberately a predicate rather than
 *  an extension list: plenty of real dispatch isn't extension-shaped —
 *  `manifest.jsonl` wanting a different viewer than other `.jsonl`,
 *  `part-*.parquet` under a directory that should render as one logical
 *  table, or a key with no extension at all. */
export interface ViewerMatchCtx {
  /** Store key of the file. */
  path: string
  /** Lower-cased extension, or `''` when there isn't one. */
  ext: string
}

export interface ViewerEntry<O = Record<string, unknown>> {
  /** Stable identity for the lazy component this entry resolves to.
   *
   *  Required, and it must be stable across renders: `React.lazy`
   *  mints a component *type*, and a new type each render remounts the
   *  viewer (dropping whatever it had cached). Keying the cache on a
   *  string rather than the entry object means an inline `viewers={[…]}`
   *  array still behaves — which is the mistake everyone makes once. */
  id: string
  /** First match wins, so array order is the consumer's priority. */
  match: (ctx: ViewerMatchCtx) => boolean
  /** Dynamic import of the viewer's module. Nothing is fetched until a
   *  matching path is opened. */
  load: () => Promise<{ default: ComponentType<ViewerProps & O> }>
  /** Forwarded to the viewer as props. */
  options?: O
}

/** `React.lazy` per entry id, not per entry object — see `id` above. */
const lazyCache = new Map<string, ComponentType<ViewerProps & Record<string, unknown>>>()

function lazyFor(entry: ViewerEntry<never>): ComponentType<ViewerProps & Record<string, unknown>> {
  let C = lazyCache.get(entry.id)
  if (!C) {
    C = lazy(entry.load as () => Promise<{ default: ComponentType<ViewerProps> }>) as ComponentType<ViewerProps & Record<string, unknown>>
    lazyCache.set(entry.id, C)
  }
  return C
}

export function findViewer(viewers: readonly ViewerEntry<never>[] | undefined, path: string): ViewerEntry<never> | undefined {
  if (!viewers?.length) return undefined
  const ctx: ViewerMatchCtx = { path, ext: extOf(path) }
  return viewers.find(v => v.match(ctx))
}

export function RegistryViewer({ entry, store, path, usePersistedState, fallback }: {
  entry: ViewerEntry<never>
  store: Store
  path: string
  usePersistedState?: PersistedState
  fallback?: ReactNode
}) {
  const Component = lazyFor(entry)
  return (
    <Suspense fallback={fallback ?? <div style={{ opacity: 0.6 }}>loading viewer…</div>}>
      <Component store={store} path={path} usePersistedState={usePersistedState} {...(entry.options ?? {})} />
    </Suspense>
  )
}
