# Navigation

Opt-in ⌘K path search, and view state in the URL.

Live: press ⌘K on [file-tree.rbw.sh](https://file-tree.rbw.sh) or the [MockStore demo](https://file-tree.rbw.sh/mock).

## ⌘K path search — opt-in

`@rdub/file-tree/omnibar` turns the `treeSource` you already pass for dir sizes into a [`use-kbd`] omnibar endpoint: fuzzy search over every path, hits linking where a listing click would.

```tsx
import { HotkeysProvider, Omnibar, useOmnibarEndpoint } from 'use-kbd'
import { treePathEndpoint } from '@rdub/file-tree/omnibar'

function PathSearch({ treeSource }) {
  useOmnibarEndpoint('files', treePathEndpoint(treeSource, { routeBase: '/files' }))
  const navigate = useNavigate()
  // SPA navigation; the Omnibar's default is a full-page `window.location` assignment.
  return <Omnibar onExecuteRemote={e => 'href' in e && e.href && navigate(e.href)} />
}
```

Scope with `path` (a subtree) and register more endpoints for ancestors at lower `priority`, each with `excludePath` set to the nearer scope so nothing lists twice; see `site/src/components/PathSearch.tsx`. The index is enumerated on first query (bounded by `maxNodes`) and cached per source.

## URL state — opt-in

By default `<FileTree>` keeps the dir-listing filter, parquet pagination, and the JSON viewer's search/jq inputs in `useState` (in-memory, no URL writes). Opt in to shareable URL state by passing the bundled hook:

```tsx
import { FileTree } from '@rdub/file-tree/react'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'

<FileTree
  store={store}
  routeBase="/files"
  usePersistedState={useUrlPersistedState}
/>
```

The shipped helper binds: `?q=…` (dir filter), `?page=N` (parquet), `?json-q=…` + `?jq=…` (JSON viewer). Defaults are omitted from the URL.

`@rdub/file-tree/url-state` is the only path in the lib that imports `use-prms` — consumers who don't import it tree-shake the dep out. Bring-your-own (nuqs, your own `URLSearchParams` hook, etc.) by passing a function matching the `PersistedState` signature:

```ts
type PersistedState = <T extends string | number>(
  key: string,
  defaultValue: T,
) => [T, (value: T) => void]
```

[`use-kbd`]: https://github.com/runsascoded/use-kbd
