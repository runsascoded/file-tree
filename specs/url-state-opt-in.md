# Spec: make URL state opt-in (drop `use-prms` from default bundle)

## Problem

`491d436` ("URL state for dir filter + parquet pagination via `use-prms`")
and `ce16ce7` (JSON renderer pizazz) both added direct `import` of
`use-prms` from `src/react/DirListing.tsx`, `src/renderers/parquet.tsx`,
and `src/renderers/json.tsx`. `use-prms` is declared in `dependencies`
(not peer), so:

1. **Every consumer ships `use-prms`** (~5 KB gz) whether or not they
   want URL state.
2. **Consumers with their own URL-state library** (nuqs, raw
   `URLSearchParams`, react-router's `useSearchParams`, etc.) can't
   swap it in — they get `use-prms` writes to their URL whether they
   like it or not.
3. **Consumers who want NO URL state** (modal embeds, multi-instance
   pages where `?q=` collides, tests, etc.) can't turn it off —
   `?q=` and `?page=` always get written.
4. **Router-strategy collisions** — `use-prms` writes
   `location.search`, but a `HashRouter` consumer keeps the path in
   `location.hash`. The two persistence layers don't compose cleanly;
   `858d7ba` patched one symptom (filter not clearing on dir-nav under
   HashRouter), but the root cause is "lib hardcodes one URL strategy."

## Design

Single DI prop on `<FileTree>`, default = `useState`. Lib's main entry
never imports `use-prms`. A shipped helper at
`@rdub/file-tree/url-state` is the one place that imports `use-prms`;
consumers who don't import it tree-shake the dep out.

### Type

```ts
export type PersistedState = <T extends string | number>(
  key: string,
  defaultValue: T,
) => [T, (value: T) => void]
```

`string | number` covers every current call site (`q`, `json-q`, `jq`
are strings; `page` is a number). Future call sites that need other
types can widen the constraint.

### Public surface

```ts
// @rdub/file-tree/react
interface FileTreeProps {
  // ... existing
  usePersistedState?: PersistedState
}

// @rdub/file-tree/url-state  (new sub-path)
export const useUrlPersistedState: PersistedState
```

### Default impl (in-memory)

```ts
const defaultUseState: PersistedState = (_key, dv) => useState(dv)
```

### Shipped helper

```ts
// src/url-state/index.ts
import { useUrlState, defStringParam, intParam } from 'use-prms'

export const useUrlPersistedState: PersistedState = <T extends string | number>(
  key: string,
  dv: T,
): [T, (v: T) => void] => {
  if (typeof dv === 'number') {
    return useUrlState(key, intParam(dv as number)) as [T, (v: T) => void]
  }
  return useUrlState(key, defStringParam(dv as string)) as [T, (v: T) => void]
}
```

The internal `as` casts are the unavoidable cost of bridging a
`typeof`-dispatched implementation to a generic interface — confined
to this file; call-site UX stays clean.

### Distribution mechanism

`<FileTree>` resolves the active hook once, threads via React context:

```ts
const PersistedStateContext = createContext<PersistedState>(defaultUseState)

// in FileTree.tsx:
const resolved = usePersistedState ?? defaultUseState
return (
  <PersistedStateContext.Provider value={resolved}>
    {/* ... */}
  </PersistedStateContext.Provider>
)

// in DirListing / parquet / json:
const use = useContext(PersistedStateContext)
const [q, setQ] = use('q', '')
```

Renderers (`ParquetViewer`, `JsonViewer`) read from the same context
even though they're imported separately by consumers — context bridges
the gap without per-renderer prop drilling.

## Call sites to change

| File | Today | After |
|---|---|---|
| `src/react/DirListing.tsx` | `useUrlState('q', defStringParam(''))` | `useContext(PersistedStateContext)('q', '')` |
| `src/renderers/parquet.tsx` | `useUrlState('page', intParam(0))` | `useContext(PersistedStateContext)('page', 0)` |
| `src/renderers/json.tsx` | `useUrlState('json-q', …)` + `useUrlState('jq', …)` | same via context |

Drop the `import { useUrlState, defStringParam, intParam } from 'use-prms'`
lines from all three. Drop `use-prms` from `dependencies`.

## Package changes

- `package.json`: remove `"use-prms"` from `dependencies`. Keep `tsup`'s
  `external` entry (defensive).
- `tsup.config.ts`: add `'src/url-state/index.ts'` entry.
- `package.json#exports`: add `./url-state` sub-path.
- `package.json#devDependencies`: add `use-prms` so the `/url-state`
  build can resolve it; (no peer dep — it's bundled into the
  `/url-state` output? or external? **Decision needed during impl.**)
  - If external: consumers importing `/url-state` must install
    `use-prms` themselves.
  - If bundled: consumers don't need to install it; lib's `/url-state`
    sub-bundle carries the ~5 KB.
  - Recommend: external + add to `peerDependencies` (optional). Matches
    the pattern for the other renderer peers (`hyparquet`, etc.).

## Migration impact

Three current consumers (ctbk, crashes, tomat) each add one import +
one prop to keep today's behavior:

```diff
+ import { useUrlPersistedState } from '@rdub/file-tree/url-state'
  <FileTree
    store={store}
    routeBase="/files"
+   usePersistedState={useUrlPersistedState}
  />
```

Each consumer is one diff. None of them blocks until they bump their
file-tree pin, so the rollout is per-consumer at their pace.

Bring-your-own consumers (nuqs etc.) write their own:

```ts
const myHook: PersistedState = (key, dv) => {
  if (typeof dv === 'number') return useQueryState(key, parseAsInteger.withDefault(dv))
  return useQueryState(key, parseAsString.withDefault(dv))
}
<FileTree usePersistedState={myHook} />
```

## Verification

- `pnpm typecheck` clean.
- `pnpm test` (80/80) clean.
- Site demo (`/mock`): verify default behavior — no `?q=` writes when
  typing in the filter (because the demo will be updated to NOT pass
  `usePersistedState`; flip-flop a flag to confirm both paths).
  - Then update site demo to pass `useUrlPersistedState` so the URL
    state demo stays exercised in CI.
- Build size check: confirm `dist/react/index.js` no longer imports
  `use-prms`. Confirm `dist/url-state/index.js` does.

## Out of scope

- Replacing `use-prms` with a different URL-state library by default.
  Still the right default opt-in choice when consumers want URL state;
  this spec just stops mandating it.
- Per-instance namespacing (`paramPrefix`) for multiple `<FileTree>`
  on one page. Deferred until a consumer asks; the DI prop already
  lets them wire a prefix-aware hook themselves.
- Cleanup of `858d7ba`'s `useEffect` reset on prefix change. Still
  needed under URL-state-on; harmless under URL-state-off (setQ
  reduces to a no-op `useState` reset). Leave it.

## Commit shape

One commit. Touches ~5 files, ~150 LOC delta. Site demo's `<FileTree>`
callsites get the one-line `useUrlPersistedState` opt-in so the demo's
URL-state behavior keeps working.
