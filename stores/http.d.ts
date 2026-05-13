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
}
declare function HttpStore(apiBase: string, opts?: HttpStoreOptions): Store;

export { HttpStore, type HttpStoreOptions };
