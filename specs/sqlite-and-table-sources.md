# SQLite, and the abstraction it exposes we're missing

*Two things, and the second is the reason the first is worth doing carefully.*

## First, a correction

I'd been calling this "the container registry" — generalising the `zip`/`zipEntry`
pattern to any file that browses like a directory, with SQLite as the "second
data point" needed to justify it. That put a speculative refactor in front of a
feature. **Build the SQLite renderer because it's wanted.** Whether zip + SQLite
later justify a shared container abstraction is a smaller question, answerable
from evidence once both exist.

## Prior art: `~/c/ire/www` (gitlab.com/runsascoded/ire/www)

Two branches, and between them they've already built two of the three modes:

- **`static`** — `@rdub/react-sql.js-httpvfs` in the browser. `SqliteBlob` reads
  `SELECT * FROM sqlite_master`, renders one paginated table per `type='table'`.
- **`server`** — the *same UI* against Next API routes (`/api/sqlite-page`,
  `/api/sqlite-tables`) backed by the `sqlite` / `sqlite3` **native** Node
  bindings. No wasm on the server side.

### The thing worth stealing

`src/table/index.ts` abstracts the **data source**, not the renderer:

```ts
abstract class Table<C extends Col = Col> {
  abstract page<Row>(opts: { offset, num, sort?, filters? }): AR<{ rows: Row[], total: number }>
  abstract get cols(): AR<C[]>
  abstract maybeComputeTotal(): AR<number>
  abstract format(value: string, col: F<C>): string
  abstract get ilike(): string        // dialect seam
}
```

`SqliteTable` and `ParquetTable` implement it, and — the important part — the
*client* and *server* branches satisfy the same interface. The browser version
runs the query in wasm; the server version POSTs `PageOpts` to an API route. The
UI above it doesn't change. That's what made a two-mode deployment tractable.

**We don't have this.** file-tree abstracts *storage* (`Store`) and
*presentation* (`TableViewerOptions`), and then each viewer hand-rolls its own
paging against raw bytes: `useRowGroup`, `useCsvPage`, sort over a
fully-materialised array, filter as substring or row-group pruning. Every one of
those is a private re-answer to "give me rows `[offset, offset+n)`, sorted and
filtered."

That's fine for two formats. It is not fine for SQLite, whose whole point is
that the *engine* does the paging, sorting and filtering — pushing `LIMIT` /
`ORDER BY` / `WHERE` down instead of loading and sorting in JS.

### What ire's arch does *not* argue for

The `Table` classes carry `fp-ts`-flavoured task types (`AR<T>`, `map`, `flatMap`,
`par`) and a `Tables` factory hierarchy. That's a 2024-vintage choice and not
worth emulating — plain `Promise` and a function returning an object are enough,
and match the hook-shaped API here. Take the *seam*, not the machinery.

Also: ire renders every table in the file at once, each independently paginated.
Fine for a handful; a `.db` with 40 tables wants the tree treatment — which is
the container question, and the reason it will eventually be worth answering.

## Proposal: `TableSource`

```ts
interface TableSource {
  columns(): Promise<TableColumn[]>
  /** Rows `[offset, offset+limit)`. `total` may be undefined when the
   *  source genuinely can't know it (CSV streaming). */
  page(opts: {
    offset: number
    limit: number
    sort?: { column: string; dir: 'asc' | 'desc' }
    filter?: string | Predicate
  }): Promise<{ rows: Record<string, unknown>[]; total?: number }>
}
```

Everything already built becomes an implementation or a wrapper:

| source | paging | sort / filter |
|---|---|---|
| parquet | row group | in-memory below threshold; RG pruning above |
| CSV | byte range | in-memory below threshold; none above |
| **SQLite (wasm, client)** | `LIMIT`/`OFFSET` | pushed down |
| **SQLite (over HTTP)** | server does it | pushed down |

The small-table-mode work is then honestly what it is: a *default* `TableSource`
that materialises everything and sorts in JS, because parquet and CSV can't push
down. SQLite doesn't need it, and shouldn't pay for it.

**This is a refactor of working code**, so it's only worth doing because SQLite
forces the question — not on its own.

## The three deployment modes

The user's framing, with what I can and can't confirm:

**1. Fully static — sql.js-httpvfs in the browser.**
Works (ire's `static` branch is proof). Perf is the known problem: every B-tree
seek is a browser→origin range request, so an index lookup that's ~5 local reads
becomes ~5 round-trips. Worse over a slow link, and it needs the blob readable by
the browser — so it can't serve private data without handing out credentials.

**2. Thin client ↔ Cloudflare Worker.**
**CFW is JS + WebAssembly only — no native binaries**, so this is wasm SQLite in
the Worker, not a `sqlite3` process. What makes it the *right* default anyway:
the Worker holds an R2 **binding**, so its range reads are colocated with the
data. The seeking that makes mode 1 slow happens inside Cloudflare; the browser
makes one request per query and receives only the rows. Private data never
leaves the Worker's trust boundary.

*Verified* — see **Spike results** below. It instantiates, and a query is
single-digit milliseconds.

**3. Thin client ↔ non-JS server.**
What ire's `server` branch does, with native `sqlite3` — the fastest option and
the least portable. Worth supporting *because the interface is the same*, not as
a separate build.

### Recommendation

**Support all three, because `TableSource` makes them the same shape** — that's
precisely the leverage ire's `Table` seam bought, and the reason its two branches
share a UI.

Concretely, in order:

1. **A SQLite VFS over our existing `Store`.** This is the piece that makes the
   modes interchangeable rather than three forks: `Store.get(path, {offset,
   length})` is already exactly what a VFS `xRead` needs. The *same* VFS runs
   over `HttpStore` in a browser (mode 1) or `R2Store` inside a Worker (mode 2),
   with no branching.
2. **`TableSource`, with SQLite as the first pushdown implementation**, and
   parquet/CSV adapted behind the same interface.
3. **Mode 2 as the documented default**, mode 1 as the zero-backend fallback,
   mode 3 as a `TableSource` a consumer can supply.

Modes then stop being an architectural choice and become a wiring one.

## Spike results

Harness: `tmp/sqlite-spike/` — a `StoreVFS` over a bare
`read(offset, length) => Promise<Uint8Array>` (i.e. `Store.get(path, {offset,
length})`), driven three ways against a 10.8 MB / 200k-row / 2650-page test
database.

**All three modes work, on one VFS.** Node (fs-backed read), workerd (R2
binding, `wrangler dev --local`), and Chrome (HTTP `Range`) each ran the same
`StoreVFS` unmodified. `wa-sqlite`'s Asyncify build (`wa-sqlite-async.mjs`,
1.1 MB wasm) is what makes an async VFS possible; the sync build can't await.

### The workerd gotcha, because it cost an hour

Two changes are needed to load the emscripten glue in a Worker, and the second
one is nasty:

```js
SQLiteESMFactory({
  // Without this the glue evaluates `new URL('…wasm', import.meta.url)`,
  // which workerd rejects ("Invalid URL string") — and does so *before*
  // `instantiateWasm` is consulted. The value is never fetched.
  locateFile: name => name,
  instantiateWasm(imports, receiveInstance) {
    const instance = new WebAssembly.Instance(wasmModule, imports)
    return receiveInstance(instance)   // NOT `instance.exports`
  },
})
```

The usual emscripten-in-Workers recipe is `receiveInstance(instance); return
instance.exports`. That is wrong for an Asyncify build: the glue is
`var Y = function(){ … return f.instantiateWasm(b, a) }()`, and `a` returns the
*Asyncify-instrumented* exports. Returning the raw exports overwrites them.
Everything then works right up to the first async VFS call, which unwinds
correctly and throws `Y[…] is not a function` on rewind — inside a `.then` with
no catch, so workerd surfaces it only as "your Worker's code had hung". Add an
`unhandledrejection` listener to see it at all.

### Cold-cache round-trips per query

A fresh VFS per query, so `reads` is what mode 1 pays in serial HTTP requests.

| query | 4 KiB block | 32 KiB | 256 KiB |
|---|---|---|---|
| list tables (`sqlite_master`) | 1 | 1 | 1 |
| `select *` limit 25 | 4 | 2 | 2 |
| limit 25 offset 2 475 | 25 | 5 | 2 |
| **limit 25 offset 99 975** | **900** | **114** | **15** |
| `where id > 99975 limit 25` | 4 | 3 | 2 |
| `where region='sf' order by ts limit 25` (indexed) | 5 | 3 | 3 |
| `count(*)` / `group by` | 821 | 105 | 15 |

Same queries in workerd over an R2 binding, 32 KiB blocks: 1–5 reads and 3–6 ms
for everything except the deep offset (114 reads, 45 ms) and the full scans
(105 reads, 36–53 ms). At 256 KiB blocks the worst case is 9–21 ms. In Chrome
over HTTP range on *localhost*, the deep offset took 114 requests / 242 ms —
over a real link at 50 ms RTT that is closer to six seconds, since SQLite's
reads are dependent and can't be pipelined.

### Three things that fall out of the numbers

1. **Metadata is free.** Listing tables and reading a schema is *one* 4 KiB
   read, cold. Whatever the multi-table UI ends up being, it costs nothing to
   populate — unlike parquet, where the footer is proportional to the file.

2. **`OFFSET` is the enemy, not wasm.** Deep offset pagination is O(offset)
   *page reads* — 900 round-trips for page 4000. Keyset pagination on an
   indexed column (`where id > ?`) is 4 reads at any depth. This is a direct
   constraint on `TableSource.page`: an offset-shaped interface is what a pager
   UI wants, but the SQLite implementation must be able to take a cursor
   instead. Options: carry an opaque `cursor` alongside `offset` for
   next/prev (random jumps still pay), or let the source declare that it
   prefers keyset and have the pager offer next/prev rather than page numbers.
   **Decide this before the interface hardens.**

3. **Block size is the mode-1/mode-2 dial.** Big blocks convert round-trips
   into bandwidth: 256 KiB turns 900 reads into 15, but makes a trivial query
   download 512 KiB. Mode 1 wants small blocks for first paint and large ones
   for scans — i.e. adaptive readahead that grows on sequential access. Mode 2
   can just use large blocks, because R2→Worker bandwidth is local and free.

### What this settles

Mode 2 is a sound default and mode 1 is a real fallback, on one implementation.
The remaining risk in mode 2 is not feasibility but *shape*: a Worker holds no
state between requests, so every request re-instantiates wasm (~6 ms, tolerable)
and re-reads the pages the last query already had (not tolerable for scans).
A Durable Object holding an open connection plus its page cache is the obvious
fix and is worth measuring before mode 2 is documented as the default.

## Where the code lives, and how easily it leaves

The renderer will be substantial and SQLite-specific — a VFS, a wasm peer
dependency, a schema browser, a query box. Two notes on that.

**It is already the demo's third-party-renderer story.** `ViewerEntry.load` is
a dynamic import of *any* module, so

```ts
{ id: 'sqlite', match: ({ ext }) => ext === 'db' || ext === 'sqlite',
  load: () => import('@rdub/file-tree/renderers/sqlite') }
```

and a `load` pointing at some unrelated npm package are the same shape. Nothing
reaches the main bundle until a `.db` is opened — including the 1.1 MB wasm,
which the split chunk fetches at runtime. So the demo registering SQLite this
way *is* the worked example of loading an external renderer lazily; it doesn't
need a separate one.

**Keep it extractable by construction.** Whether it later moves to its own
package should stay a packaging decision, not a refactor. It stays that way if
the renderer imports only from the public subpath exports
(`@rdub/file-tree/renderers/table`, `/renderers/tableControls`, …) and never
reaches sideways with `../react/…`. Today the in-repo renderers *do* reach
sideways, and two of the things they reach for aren't exported at all:
`src/react/fmt` and `src/react/asyncBuffer`. An external renderer can't have
those. Either export them or duplicate them — but find out by building SQLite
against the public surface only, since that's the cheapest possible test of
whether the surface is sufficient.

The non-React half — the VFS — belongs in `src/sqlite/vfs.ts`, not under
`src/renderers/`: a Worker needs it with no React in sight. It's `Store`-shaped
and backend-agnostic, so it doesn't violate the "no storage-backend-specific
logic outside `src/stores/`" rule, and SQLite stays a *view* concern rather than
a `Store` capability.

## Open

- **Multi-table UI.** A `.db` is a directory of tables. ire stacks them all;
  a tree is probably right past ~5. This is where the container question comes
  back, now with two real instances to generalise from.
- **Query box.** ire has none — you get the tables it found. A SQL input is
  obvious for SQLite and has no analogue in parquet/CSV, so it likely belongs to
  the SQLite viewer rather than `TableSource`.
- **Does `TableSource` subsume `onPage`?** Probably — `onPage` publishes what a
  source just returned. Worth checking they don't end up as two ways to say it.
