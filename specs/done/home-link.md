# Link back to the host site

## Problem

A `FileTree` is usually mounted as a sub-page of some other site (e.g. jc-taxes at `jct.rbw.sh/files`, plus the standalone `jct-files.rbw.sh` Worker). The page has a `title` and a breadcrumb that starts at "root", but nothing links back to the site it belongs to. Visitors who land on a deep link (`/files/records/payments.parquet?page=1`, shared or from search) have no visible way to reach the main app. jc-taxes currently hides a "Back to the map" action in its SpeedDial, which nobody finds.

## Proposal

1. `home?: { href: string; label: ReactNode }`: when set, render it as the **first breadcrumb segment**, before "root": `JC tax map / root / records / payments.parquet`. Same link styling as other crumbs; a normal `<a href>` (it usually leaves the router's `routeBase`, so no client-side navigation).
2. `titleHref?: string`: when set, the `title` `<h1>` is a link (inherit color, underline on hover). Typically the same `href` as `home`, or the site root.
3. `title?: ReactNode` (widen from `string`), so hosts can put a logo / icon in the title.

Default (none set): unchanged.

`renderCrumb` still applies to the `home` crumb (`index` stays 0-based over the full list, with `crumb.kind: 'home'` so renderers can tell it apart).

## Tests

- `home` set: breadcrumb renders the home link first with the given href, then "root" / … unchanged.
- `titleHref` set: title is an `<a>` with that href; unset: plain `<h1>` text.
- Neither set: DOM identical to current output.

## Consumers

- jc-taxes `www/src/Files.tsx` (mounted at `/files`): `home={{ href: '/', label: 'JC tax map' }}`, `titleHref="/"`. It has an interim hand-rolled link above `FileTree`, to remove once this lands.
- jc-taxes `files/src/Browser.tsx` (standalone `jct-files.rbw.sh`): `home={{ href: 'https://jct.rbw.sh', label: 'jct.rbw.sh' }}`.

## Resolution (2026-09-27)

Implemented as proposed:

- `home?: { href; label: ReactNode }` prepends a crumb before the store root. It's a plain `<a href>` styled like the other crumb links, and it's never the "current" (plain-text) crumb.
- `titleHref?: string` wraps the `<h1>` title in `<a>` (`color: inherit`, underline on hover via mouse-enter/leave, since inline styles can't express `:hover`).
- `title` widened to `ReactNode`.
- `Crumb.label` widened to `ReactNode` (no consumer's `renderCrumb` read it as a string), plus `Crumb.kind?: 'home'`. `renderCrumb` sees the home crumb at `index` 0. Breadcrumb React keys are now `kind:to`, so a home `href` equal to the root route can't collide.

Tests (`test/home-link.test.ts`, static markup under `MemoryRouter`, exact equality): neither set (no `<h1>`, nav starts at the store root), `home` (link first, tree crumbs unchanged), `titleHref` on/off, and `renderCrumb` indices/kinds. The MockStore demo now uses both (`home={{ href: '/', label: 'demos' }}`, `titleHref="/"`).
