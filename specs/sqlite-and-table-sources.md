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

*Unverified and worth a spike before committing:* whether `sql.js` or
`wa-sqlite` instantiates cleanly under Workers' wasm-module-import rules, and
whether opening a database per request is affordable within CPU limits (or
whether it wants a Durable Object to hold one open).

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

## Open

- **Multi-table UI.** A `.db` is a directory of tables. ire stacks them all;
  a tree is probably right past ~5. This is where the container question comes
  back, now with two real instances to generalise from.
- **Query box.** ire has none — you get the tables it found. A SQL input is
  obvious for SQLite and has no analogue in parquet/CSV, so it likely belongs to
  the SQLite viewer rather than `TableSource`.
- **Does `TableSource` subsume `onPage`?** Probably — `onPage` publishes what a
  source just returned. Worth checking they don't end up as two ways to say it.
