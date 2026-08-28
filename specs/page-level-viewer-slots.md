# Page-level viewer slots — surfacing the current page's rows

*Motivated by ctbk, which stores S2 cell IDs in parquet columns and wants a map
next to the table showing the entries on the current page — pan/zoom the table,
the map follows.*

## The gap

Every hook the viewer has today points *inward*: `renderCell` / `renderHeader` /
`cellProps` are called by the viewer, per cell, and return a node the viewer
places. That covers a lot — a per-cell map preview for an S2 column is already
just a `renderCell` returning a component, with any shared tile cache closed over
via `parquetOptions`.

What none of them can express is data flowing **outward**. Nothing tells a
sibling component "here are the 100 rows currently on screen". A consumer wanting
one widget for the whole page has to re-read the row group itself — duplicating
the fetch the viewer just did, and re-deriving the pagination maths to know which
slice is showing.

## Shape options

**A. Callback.** `onPage?: (rows: Record<string, unknown>[], meta: PageMeta) => void`

Simple, and the widget can live anywhere in the consumer's tree. But it's state
mirrored into the consumer via an effect, which invites the usual staleness and
double-render problems, and the consumer has to hold it somewhere.

**B. Render slot.** `renderAside?: (ctx: { rows, meta }) => ReactNode`, rendered
by the viewer above or below the table.

No mirrored state — rows are in scope where they're used. But the viewer now
owns the widget's placement, which is exactly the kind of layout opinion the
library has so far avoided.

**C. Both.** `renderAside` for the common case, `onPage` for consumers who need
the data somewhere the viewer can't reach (a map in a different pane, a URL
param, an analytics ping).

Leaning **C**, starting with `onPage` — it's the smaller commitment, and
`renderAside` can be built on top of it later without a break. Worth confirming
against ctbk's actual layout first: if the map sits beside the table rather than
above/below it, `renderAside` never fits and A is the whole answer.

## Open questions

1. **Fire on what?** Page change is the obvious trigger, but a row group is the
   fetch unit and a page is a slice of one — so paging within a cached row group
   is cheap while crossing groups isn't. Does the consumer care about the
   distinction? Probably wants rows either way, but `meta` should carry enough
   (`rowGroup`, `pageStart`, `pageRows`, `totalRows`) to tell.
2. **Rows or columns?** A map wants `{lat, lng}` per row; a histogram wants one
   column. Handing over row objects is the general answer, but for a wide table
   that's a lot of object churn per page — worth measuring before assuming.
3. **Scope.** Parquet first. CSV has the same shape (`csv.tsx` is also
   range-paginated) and should get the same hook once it settles, which argues
   for naming the types so they aren't parquet-specific from day one.
4. **Does it belong in the options bag?** `ParquetOptionsOf<R>` derives from the
   renderer, so adding `onPage` to `ParquetViewerOptions` needs no `src/react/`
   change — the plumbing is already there. That's the cheap path and probably
   the right one.

## A second driver: the hover drawer

Same gap, different direction. A tooltip is a bad home for a *rich* preview —
it's transient, it's sized to not cover the table, and every hover rebuilds it.
The alternative is one fixed panel somewhere on the page that shows a rich view
of whatever cell the cursor is on: bigger map, full row, related records,
whatever the consumer wants.

That needs the viewer to publish **which cell is active**, not just which rows
are on screen:

```ts
onCellHover?: (ctx: TableCellCtx | null) => void   // null on leave
```

Cheap to add and it composes with `onPage` — the drawer gets the hovered cell,
the map gets the page. Two open questions: whether hover is the right trigger
(click-to-pin is the usual complement, and a pinned cell wants to survive
paging), and whether it should be throttled inside the viewer or left to the
consumer (leaning: leave it — a consumer that wants `requestAnimationFrame` can
wrap, and the library guessing wrong is worse).

Note this makes the per-cell tooltip and the page drawer the *same* content at
two sizes, which is an argument for the consumer rendering both from one
component rather than the library offering two hooks.

## Static basemaps for the locators

The S2 preview in `site/` draws points and a footprint, with no basemap — so it
answers "whereabouts in this cluster" but not "where on Earth". The fix isn't
tiles (see the tile-free reasoning above); it's a **static vector outline
bundled once**:

- [Natural Earth] land / coastline / urban-area polygons are public domain — no
  key, no attribution requirement, no runtime fetch. Clipped to the demo's three
  city bboxes and simplified, that's single-digit KB of coordinates.
- Draw as SVG `<path>` under the existing points. Same renderer, one more layer.

This also removes the honest caveat currently in `site/src/fixtures/parquet.ts`:
a synthetic scatter can't fake a recognizable city, but a real coastline under
it doesn't have to — the outline does the recognizing and the points just sit on
it.

[Natural Earth]: https://www.naturalearthdata.com/

## Per-column format controls, done properly

The demo currently puts an identical `⌗` raw/formatted toggle on *every* column,
which is a fair demonstration of the plumbing and a bad model of what a consumer
wants:

- **Most columns need no control at all.** A control per column is visual noise
  that stops meaning anything, the same way underlining every cell would.
- **The control differs by column.** A temporal column wants `auto | ISO |
  epoch | relative`; a float wants `raw | currency | SI | fixed(n)`; a string
  column usually wants nothing.
- **Two states is often too few.** Several timestamp renderings are equally
  reasonable, and the honest end state is a *format expression* — [d3-format]
  for numbers, something strftime-ish for dates — typed by the reader.

None of this needs library support beyond what `renderHeader` already gives: the
consumer returns whatever control it wants, and the state lives in the
consumer's hands (`parquetOptions`, or a context). The demo should model the
realistic version rather than the uniform one, because as written it teaches the
wrong lesson.

[d3-format]: https://d3js.org/d3-format

## Not in scope

Selection / cross-filtering (click the map, filter the table) is the natural
follow-on and a much bigger design: it means the viewer accepting a filter it
didn't compute, which touches pagination, row-group choice, and URL state. Worth
keeping in mind so the `onPage` shape doesn't foreclose it, but not part of this.

## What ctbk actually has today (checked, 2026-08-28)

- **The per-cell preview is built** — `www/src/components/S2CellTip.tsx`, a hover tooltip on the `cell` / `s2_cell` column. Live at
  <https://ctbk.dev/files/avail-v6/1d/128d/2026-01-27.parquet>.
- **It uses no maps API.** It projects `/assets/stations-regional.json` into a 190×150 SVG — the station dots draw a recognizable city outline — and marks the S2 footprint as a rect, with a locator ring when the cell is under ~14px. Its docstring: *"no tiles, no map instance per hover, and the asset is one the app already ships."* Stadia is used elsewhere in ctbk (`StationMap`, Leaflet raster, keyless tier), but deliberately not here. A per-hover tiled map would be the "terrible against a maps API" outcome; this sidesteps keys, rate limits, attribution, and cost.
- **There is no page-level map.** `pages/Files.tsx` is `<FileTree>` inside a `RawColsProvider` and nothing else — so the callback-vs-slot question below is *unforced* by existing layout. Worth re-asking once a real one exists.

## Demoed here

`site/` now carries the per-cell half: `components/S2CellPreview.tsx` + `lib/s2geo.ts`, over an
`s2_cell` column in the fixture. Same tile-free approach as ctbk, and a useful reference for what
the hook can carry — the cell is a floating-ui tooltip with an SVG locator in it. Both files live
in `site/`, not `src/`: an S2 column is consumer domain knowledge, and the library gains no
dependency from the demo having one.

The page-level half below is still unbuilt.

## Prior art in this repo

`specs/done/consumer-render-ergonomics.md` — the inward-facing hooks, and why
`parquetOptions` derives its type from the renderer rather than importing it.
