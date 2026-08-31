import { TableCatalog, TableSource } from '../renderers/tableSource.cjs';
import { SqliteDb } from './db.cjs';
import '../table-ZN60aKsl.cjs';
import 'react';
import '../persistedState-CB_wfbcb.cjs';
import './vfs.cjs';
import '../index.cjs';

interface SqliteTableSourceOptions {
    /** Skip `count(*)` and report `total: null`.
     *
     *  SQLite answers `count(*)` from the smallest covering index rather
     *  than the table, which is cheap on a small database and a full
     *  index scan on a large one. A caller paging a huge table who only
     *  needs next/prev can turn it off. */
    countRows?: boolean;
}
declare function sqliteTableSource(db: SqliteDb, table: string, opts?: SqliteTableSourceOptions): TableSource;
/** Every table and view in a database, as a `TableCatalog`.
 *
 *  Sources are memoised per table so switching back and forth doesn't
 *  discard the column list and row count each already fetched. */
declare function sqliteCatalog(db: SqliteDb, opts?: SqliteTableSourceOptions): TableCatalog;

export { type SqliteTableSourceOptions, sqliteCatalog, sqliteTableSource };
