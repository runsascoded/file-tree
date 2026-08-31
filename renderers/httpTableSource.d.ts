import { TableSourceCapabilities, TableCatalog } from './tableSource.js';
import '../table-BDoOyrVw.js';
import 'react';
import '../persistedState-CB_wfbcb.js';

interface HttpTableCatalogOptions {
    /** Base URL the endpoints hang off, e.g. `https://api.example.com/tables`.
     *  `/objects` and `/page` are appended. */
    baseUrl: string;
    /** Store key of the file being browsed, forwarded as `path`. */
    path: string;
    /** Version of the file's *contents* — an etag, or the `lastModified`
     *  the directory listing already carries.
     *
     *  Forwarded as `version`, and the server's shared block cache is
     *  keyed on it. Omit it and that cache is skipped entirely: a key of
     *  path alone would serve a re-uploaded database out of the previous
     *  one's pages, and a wrong hit is silent corruption where a miss is
     *  only a read. Costs nothing to send, so send it when you have it. */
    version?: string;
    /** Escape hatch for auth headers, credentials, an `AbortSignal`, or a
     *  test double. Defaults to global `fetch`. */
    fetch?: typeof fetch;
    /** What the server can push down. The client can't discover this, and
     *  guessing wrong means offering a sort that silently does nothing —
     *  so it's declared. Defaults to everything, which is what the
     *  bundled SQLite handler does. */
    capabilities?: TableSourceCapabilities;
}
declare function httpTableCatalog(opts: HttpTableCatalogOptions): TableCatalog;

export { type HttpTableCatalogOptions, httpTableCatalog };
