import { Store } from '../index.cjs';

/** In-memory `Store` for tests + demos. Holds a flat map of
 *  `key → bytes`, with directory entries synthesized at list time
 *  via path-segment grouping (matching how R2/S3 expose
 *  delimiter-grouped listings).
 *
 * Usage:
 *   import { MockStore } from '@rdub/file-tree/stores/mock'
 *   const store = MockStore({
 *     'foo/a.txt': 'hello',
 *     'foo/bar/b.txt': new Uint8Array([1, 2, 3]),
 *   })
 */

interface MockStoreFile {
    bytes: Uint8Array;
    /** ISO-8601 string. Defaults to a fixed test-friendly date. */
    lastModified?: string;
    /** Optional content-type. */
    contentType?: string;
}
interface MockStoreOptions {
    /** Page size for `list`. Default 100 — small enough to exercise
     *  cursor logic in the conformance harness. */
    pageSize?: number;
    /** Default `lastModified` for files that don't specify one. */
    defaultLastModified?: string;
    /** Label for the breadcrumb root (`Store.describe`). */
    describe?: string;
}
type MockStoreInput = Record<string, string | Uint8Array | MockStoreFile>;
declare function MockStore(input: MockStoreInput, opts?: MockStoreOptions): Store;

export { MockStore, type MockStoreFile, type MockStoreInput, type MockStoreOptions };
