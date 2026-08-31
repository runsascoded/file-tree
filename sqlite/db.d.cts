import { StoreVFSOptions, RangeReader, VFSStats } from './vfs.cjs';
import '../index.cjs';

/** Where the SQLite wasm comes from. Exactly one is required. */
interface SqliteWasmSource {
    /** URL of `wa-sqlite-async.wasm`, fetched at load time. The usual
     *  browser case; under Vite,
     *  `new URL('wa-sqlite/dist/wa-sqlite-async.wasm', import.meta.url).href`. */
    wasmUrl?: string;
    /** The bytes, already in hand. Node and tests. */
    wasmBinary?: ArrayBuffer | Uint8Array;
    /** An already-compiled module. Cloudflare Workers, where `.wasm`
     *  imports arrive compiled and there is no fetch to make. */
    wasmModule?: WebAssembly.Module;
}
/** The emscripten module + the API surface bound to it. Reusable across
 *  databases, and worth reusing: instantiating costs a few ms and a
 *  megabyte of wasm. */
type SqliteRuntime = SQLiteAPI;
/** Instantiate wa-sqlite's Asyncify build.
 *
 *  The Asyncify build (not the smaller synchronous one) is required:
 *  `StoreVFS.xRead` is async, and only Asyncify can suspend wasm across
 *  an await. */
declare function createSqliteModule(source: SqliteWasmSource): Promise<SqliteRuntime>;
/** A table, view, or other `sqlite_master` entry worth showing. */
interface SqliteObject {
    name: string;
    type: 'table' | 'view';
    /** The `CREATE …` statement, as SQLite stored it. */
    sql: string | null;
}
interface SqliteColumn {
    name: string;
    /** The declared type, verbatim — `INTEGER`, `TEXT`, `VARCHAR(20)`, or
     *  `''` for an untyped column. SQLite's affinity rules mean this is a
     *  hint, not a guarantee about the values. */
    declaredType: string;
    notNull: boolean;
    primaryKey: boolean;
}
interface SqliteRows {
    columns: string[];
    rows: Record<string, unknown>[];
}
/** Quote an identifier for interpolation.
 *
 *  Table and column names reach us from `sqlite_master` and from URL
 *  state, and neither can be bound as a parameter — SQLite only binds
 *  *values*. Doubling embedded quotes is the whole escape rule. */
declare function quoteIdent(name: string): string;
interface OpenSqliteOptions extends StoreVFSOptions {
    /** Reuse a runtime across databases rather than instantiating wasm
     *  per file. */
    runtime?: SqliteRuntime;
}
/** A read-only connection. One instance owns one VFS, one file, and the
 *  page cache the VFS accumulated — so keeping it open between queries
 *  is what makes the second query cheap. */
declare class SqliteDb {
    private readonly sqlite3;
    private readonly vfs;
    private readonly db;
    private closed;
    /** A SQLite connection is not reentrant: two `sqlite3_step` loops
     *  interleaved on one handle is misuse, and SQLite says so
     *  (`SQLITE_MISUSE`, "bad parameter or other API misuse"). Every
     *  `await` in `select` is a chance for that to happen — a filter
     *  keystroke landing mid-page-load is enough, and React's
     *  double-invoked effects in development guarantee it. So work is
     *  chained rather than run concurrently. */
    private queue;
    private constructor();
    static open(reader: RangeReader, source: SqliteWasmSource, opts?: OpenSqliteOptions): Promise<SqliteDb>;
    /** Ranged reads and cache hits so far — the number a UI can show to
     *  explain why something was fast or slow. */
    get stats(): Readonly<VFSStats>;
    /** Run `work` after everything already queued on this connection. */
    private serialize;
    close(): Promise<void>;
    /** Run `sql`, binding `params` positionally. */
    select(sql: string, params?: (string | number | null)[]): Promise<SqliteRows>;
    /** Tables and views, in name order.
     *
     *  Excludes SQLite's own `sqlite_%` bookkeeping, which is never what
     *  someone opening a `.db` came to look at. */
    objects(): Promise<SqliteObject[]>;
    /** Columns of one table or view, in declaration order. */
    columns(table: string): Promise<SqliteColumn[]>;
    /** `select count(*)`, which SQLite answers from the smallest covering
     *  index rather than the table. Still a scan of *something*, so it's
     *  separate from `page` — a caller that doesn't need a total shouldn't
     *  pay for one. */
    count(table: string, where?: {
        sql: string;
        params: (string | number | null)[];
    }): Promise<number>;
}

export { type OpenSqliteOptions, type SqliteColumn, SqliteDb, type SqliteObject, type SqliteRows, type SqliteRuntime, type SqliteWasmSource, createSqliteModule, quoteIdent };
