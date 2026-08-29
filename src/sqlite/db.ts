/** A read-only SQLite connection over a `StoreVFS`.
 *
 *  Thin on purpose: it opens a database, answers what's in it, and runs
 *  queries. Everything about *pagination policy* lives one layer up in
 *  `TableSource`, and everything about rendering lives above that.
 *
 *  The wasm has to come from somewhere, and that somewhere differs per
 *  environment — a URL in a browser, a pre-compiled `WebAssembly.Module`
 *  in a Cloudflare Worker, bytes in Node. `createSqliteModule` takes all
 *  three and hides the emscripten-specific incantations each needs.
 */
/// <reference types="wa-sqlite" />
import * as SQLite from 'wa-sqlite'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs'
import { SQLITE_FILENAME, StoreVFS, type RangeReader, type StoreVFSOptions, type VFSStats } from './vfs'

/** Where the SQLite wasm comes from. Exactly one is required. */
export interface SqliteWasmSource {
  /** URL of `wa-sqlite-async.wasm`, fetched at load time. The usual
   *  browser case; under Vite,
   *  `new URL('wa-sqlite/dist/wa-sqlite-async.wasm', import.meta.url).href`. */
  wasmUrl?: string
  /** The bytes, already in hand. Node and tests. */
  wasmBinary?: ArrayBuffer | Uint8Array
  /** An already-compiled module. Cloudflare Workers, where `.wasm`
   *  imports arrive compiled and there is no fetch to make. */
  wasmModule?: WebAssembly.Module
}

/** The emscripten module + the API surface bound to it. Reusable across
 *  databases, and worth reusing: instantiating costs a few ms and a
 *  megabyte of wasm. */
export type SqliteRuntime = SQLiteAPI

/** Instantiate wa-sqlite's Asyncify build.
 *
 *  The Asyncify build (not the smaller synchronous one) is required:
 *  `StoreVFS.xRead` is async, and only Asyncify can suspend wasm across
 *  an await. */
export async function createSqliteModule(source: SqliteWasmSource): Promise<SqliteRuntime> {
  const config: Record<string, unknown> = {}

  if (source.wasmModule) {
    // Workers reject the glue's `new URL('…', import.meta.url)` with
    // "Invalid URL string", and evaluate it *before* consulting
    // `instantiateWasm` — so `locateFile` is needed to take the other
    // branch even though nothing ever fetches the value.
    config.locateFile = (name: string) => name
    config.instantiateWasm = (
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance) => unknown,
    ) => {
      const instance = new WebAssembly.Instance(source.wasmModule!, imports)
      // Return what the callback returns, *not* `instance.exports`. The
      // glue assigns this return value over the Asyncify-instrumented
      // exports the callback just installed; handing back the raw ones
      // works until the first async VFS call, which unwinds and then
      // fails to rewind — surfacing only as a hung request.
      return receiveInstance(instance)
    }
  } else if (source.wasmBinary) {
    config.wasmBinary = source.wasmBinary
  } else if (source.wasmUrl) {
    config.locateFile = () => source.wasmUrl!
  } else {
    throw new Error('createSqliteModule: one of wasmUrl, wasmBinary or wasmModule is required')
  }

  return SQLite.Factory(await SQLiteESMFactory(config))
}

/** A table, view, or other `sqlite_master` entry worth showing. */
export interface SqliteObject {
  name: string
  type: 'table' | 'view'
  /** The `CREATE …` statement, as SQLite stored it. */
  sql: string | null
}

export interface SqliteColumn {
  name: string
  /** The declared type, verbatim — `INTEGER`, `TEXT`, `VARCHAR(20)`, or
   *  `''` for an untyped column. SQLite's affinity rules mean this is a
   *  hint, not a guarantee about the values. */
  declaredType: string
  notNull: boolean
  primaryKey: boolean
}

export interface SqliteRows {
  columns: string[]
  rows: Record<string, unknown>[]
}

/** Quote an identifier for interpolation.
 *
 *  Table and column names reach us from `sqlite_master` and from URL
 *  state, and neither can be bound as a parameter — SQLite only binds
 *  *values*. Doubling embedded quotes is the whole escape rule. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

let uniqueVfsName = 0

export interface OpenSqliteOptions extends StoreVFSOptions {
  /** Reuse a runtime across databases rather than instantiating wasm
   *  per file. */
  runtime?: SqliteRuntime
}

/** A read-only connection. One instance owns one VFS, one file, and the
 *  page cache the VFS accumulated — so keeping it open between queries
 *  is what makes the second query cheap. */
export class SqliteDb {
  private readonly sqlite3: SqliteRuntime
  private readonly vfs: StoreVFS
  private readonly db: number
  private closed = false

  private constructor(sqlite3: SqliteRuntime, vfs: StoreVFS, db: number) {
    this.sqlite3 = sqlite3
    this.vfs = vfs
    this.db = db
  }

  static async open(
    reader: RangeReader,
    source: SqliteWasmSource,
    opts: OpenSqliteOptions = {},
  ): Promise<SqliteDb> {
    const { runtime, ...vfsOpts } = opts
    const sqlite3 = runtime ?? await createSqliteModule(source)
    const vfs = new StoreVFS(reader, vfsOpts)
    // VFS names are global to the runtime, so they have to be unique
    // even when two viewers share one.
    vfs.name = `file-tree-${uniqueVfsName++}`
    // Cast for the same reason `StoreVFS` retypes its base: wa-sqlite
    // 1.0.0's `SQLiteVFS` type describes a newer contract than the code
    // it ships. `StoreVFS` satisfies the shipped one — the tests run
    // real queries through it — but not the declared one.
    sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false)
    const db = await sqlite3.open_v2(SQLITE_FILENAME, SQLite.SQLITE_OPEN_READONLY, vfs.name)
    return new SqliteDb(sqlite3, vfs, db)
  }

  /** Ranged reads and cache hits so far — the number a UI can show to
   *  explain why something was fast or slow. */
  get stats(): Readonly<VFSStats> { return this.vfs.stats }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.sqlite3.close(this.db)
  }

  /** Run `sql`, binding `params` positionally. */
  async select(sql: string, params: (string | number | null)[] = []): Promise<SqliteRows> {
    const rows: Record<string, unknown>[] = []
    let columns: string[] = []
    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      if (params.length) this.sqlite3.bind_collection(stmt, params)
      columns = this.sqlite3.column_names(stmt)
      while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
        const values = this.sqlite3.row(stmt)
        rows.push(Object.fromEntries(columns.map((c, i) => [c, values[i] ?? null])))
      }
    }
    return { columns, rows }
  }

  /** Tables and views, in name order.
   *
   *  Excludes SQLite's own `sqlite_%` bookkeeping, which is never what
   *  someone opening a `.db` came to look at. */
  async objects(): Promise<SqliteObject[]> {
    const { rows } = await this.select(
      `select name, type, sql from sqlite_master
       where type in ('table','view') and name not like 'sqlite_%'
       order by type, name`)
    return rows.map(r => ({
      name: String(r.name),
      type: r.type === 'view' ? 'view' : 'table',
      sql: r.sql === null ? null : String(r.sql),
    }))
  }

  /** Columns of one table or view, in declaration order. */
  async columns(table: string): Promise<SqliteColumn[]> {
    // `pragma_table_info` is the table-valued form, which — unlike
    // `PRAGMA table_info(x)` — takes a bound parameter instead of
    // interpolation.
    const { rows } = await this.select(
      'select name, type, "notnull", pk from pragma_table_info(?)', [table])
    return rows.map(r => ({
      name: String(r.name),
      declaredType: String(r.type ?? ''),
      notNull: Number(r.notnull) === 1,
      primaryKey: Number(r.pk) > 0,
    }))
  }

  /** `select count(*)`, which SQLite answers from the smallest covering
   *  index rather than the table. Still a scan of *something*, so it's
   *  separate from `page` — a caller that doesn't need a total shouldn't
   *  pay for one. */
  async count(table: string, where?: { sql: string; params: (string | number | null)[] }): Promise<number> {
    const { rows } = await this.select(
      `select count(*) as n from ${quoteIdent(table)}${where ? ` where ${where.sql}` : ''}`,
      where?.params ?? [])
    return Number(rows[0]?.n ?? 0)
  }
}
