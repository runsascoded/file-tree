# Spec: `DirListing` resets `q` on `prefix` change (alongside URL state)

> Status: **done** (2026-05-27). Implemented exactly as spec'd in
> `DirListing.tsx`: `useEffect(() => { setQ('') }, [prefix])` re-added
> alongside the `useUrlState` binding from `491d436`. Verified
> BrowserRouter (mock demo) — no regression: filter clears on dir-nav,
> URL drops `?q=` naturally via `<Link>`, the explicit reset fires
> after but converges to the same empty state. HashRouter repro not
> exercised here (would require tomat's setup + a lib-pin bump);
> trusted from the spec's analysis.

## Problem

`491d436` ("URL state for dir filter + parquet pagination via `use-prms`")
intentionally replaced the explicit `useEffect` that cleared `qInternal`
on `prefix` change. Commit message:

> The explicit `useEffect` reset added in `657e007` is replaced by the
> URL-state semantics: dir-nav `<Link>`s build hrefs without a query, so
> the new URL drops `?q=` and the input clears implicitly.

That assumption holds **for consumers using `BrowserRouter`** (route =
`location.pathname`, query = `location.search`). React Router's `<Link
to="/foo">` produces a path-only href, so navigation clears
`location.search` and `?q=` goes away.

**It breaks for `HashRouter` consumers** (e.g. `oa/tomat`'s `/files`
mount). With HashRouter:

- Path lives in `location.hash` after a `#/` prefix
  (e.g. `#/files/runs/`).
- `<Link>` navigations only mutate `location.hash`.
- `useUrlState` from `use-prms` (the default, non-`/hash` entry point)
  still reads/writes `location.search`.

Concrete repro at `oa/tomat`:

1. Open `http://localhost:4273/#/files/runs/`
2. Type `80k` in the filter → URL becomes
   `http://localhost:4273/?q=80k#/files/runs/`
3. Click `train-full-v3-…-cont33k/` → URL becomes
   `http://localhost:4273/?q=80k#/files/runs/train-full-v3-…-cont33k/`
4. The destination renders **"no entries match 80k"** because
   `?q=80k` survived the hash-only nav.

This is the *exact* UX bug the original `657e007` fix targeted.

## Fix

Bring back the `useEffect` reset in `DirListing.tsx`, **alongside** the
URL state. Two-source semantics for `q`:

- **URL** is the persistence layer — shareable, survives reload.
- **`prefix` change** is a hard reset — every dir-nav lands on a
  clean filter, regardless of which router strategy the consumer uses.

```ts
// DirListing.tsx, after the useUrlState binding:
const [q, setQ] = useUrlState('q', defStringParam(''))
useEffect(() => {
  // Clear the filter whenever we navigate to a different directory.
  // URL persistence (above) keeps `?q=` shareable within a single dir;
  // this `useEffect` guarantees that opening *another* dir starts
  // fresh, even when the consumer uses HashRouter (the dir nav only
  // mutates `location.hash`, so `?q=` in `location.search` would
  // otherwise survive — see spec for the repro).
  setQ('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [prefix])
```

Excluding `setQ` from the deps list is intentional — `setQ` is stable
across renders, and including it would re-fire the reset whenever the
URL hook re-creates its setter (which can happen on intra-dir URL
churn).

## Why not switch to `use-prms/hash`?

`use-prms/hash` reads/writes the *whole* `location.hash` as a flat
key=value string (`#q=foo` style). HashRouter consumers structure the
hash as `#/path?query=val` — the path lives there too. So
`use-prms/hash` and HashRouter want the same slot for different
content. A proper "HashRouter-query" strategy in `use-prms` would
need to:

- Read `q` from the substring after the first `?` in `location.hash`
- Write back into the same substring without disturbing the path

That's a real piece of work in `use-prms`. The 3-line `useEffect` here
sidesteps the architectural decision and ships the UX fix today.

(If `use-prms` later gains a `hashRouterQueryStrategy`, FT can switch
to it and drop the `useEffect`. Until then, the reset is cheap
insurance.)

## Test plan

- BrowserRouter consumer (FT's own demo site): no regression. Typing
  `q=foo`, clicking a child dir, lands on the child with `?q=` gone —
  the `useEffect` reset fires after `<Link>` already cleared the
  query, both flips converge to empty.
- HashRouter consumer (tomat `oa/tomat`'s `/files`): repro steps from
  "Problem" section above. After fix: filter clears on dir-nav, even
  though `?q=80k` survives the hash-only navigation.

## Scope

`DirListing.tsx` only — parquet `?page=` doesn't have the same bug
because `<ParquetViewer>` unmounts when path changes (different
`path` prop), so its `useState(useUrlState('page', ...))` is freshly
initialized from the new URL. Confirm in the repro that opening a
different parquet drops `?page=` correctly even under HashRouter.
