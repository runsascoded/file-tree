import { Store } from '../index.js';

/** HTTP client Store: hits a server that exposes the file-tree HTTP API
 *  (see `@rdub/file-tree/server`). Used by browser-side code where you
 *  can't talk to the underlying storage directly.
 *
 * Usage:
 *   import { HttpStore } from '@rdub/file-tree/stores/http'
 *   const store = HttpStore('https://api.example.com/v1/files')
 */

interface HttpStoreOptions {
    /** Extra headers to include on every request (auth tokens, etc.). */
    headers?: Record<string, string>;
    /** Custom fetch impl, defaults to global. */
    fetch?: typeof globalThis.fetch;
    /** When `true`, expose `getDownloadUrl(path)` that calls `/presign` on
     *  the backend. The server only mounts `/presign` when its underlying
     *  store can mint signed URLs, so consumers must opt in deliberately
     *  to avoid stalling the UI's download icon against a 404 endpoint. */
    presign?: boolean;
}
declare function HttpStore(apiBase: string, opts?: HttpStoreOptions): Store;

export { HttpStore, type HttpStoreOptions };
