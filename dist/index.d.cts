/** Core types for `@rdub/file-tree`.
 *
 * A `Store` is the unifying abstraction: anything you can list + range-read
 * looks the same to the React UI. Implementations live under
 * `@rdub/file-tree/stores/*`.
 */
interface Entry {
    /** Store-relative path. Directories end with `/`. */
    key: string;
    /** Bytes. Absent for directories. */
    size?: number;
    /** ISO-8601 string. Absent if the store doesn't track it. */
    lastModified?: string;
    isDir: boolean;
}
interface ListResult {
    entries: Entry[];
    /** Opaque continuation token for pagination. Absent → list complete. */
    cursor?: string;
}
interface ListOptions {
    cursor?: string;
    /** Max entries per page. Stores may cap this. */
    limit?: number;
}
interface Range {
    /** Byte offset into the object (inclusive). */
    offset: number;
    /** Number of bytes to read. */
    length: number;
}
interface GetResult {
    bytes: Uint8Array;
    /** Total object size — populated when known (e.g. R2 head, S3 Content-Range). */
    totalSize?: number;
    /** MIME type from the store, when known. */
    contentType?: string;
}
interface StoreCapabilities {
    /** Whether `get(_, range)` honors range reads. Required for text Range
     *  views and zip-entry parsing. */
    range: boolean;
}
interface Store {
    /** List one page of entries under `prefix`. The store presents directories
     *  as entries with `isDir: true` and `key` ending in `/`. */
    list(prefix: string, opts?: ListOptions): Promise<ListResult>;
    /** Fetch one object's bytes, optionally a byte range. Throws on 404. */
    get(path: string, range?: Range): Promise<GetResult>;
    /** Optional metadata. UI can use this to disable features the store
     *  doesn't support (e.g. zip preview when `range` is false). */
    capabilities?: StoreCapabilities;
}
/** Sentinel error type stores throw for missing keys, so UI can render
 *  a 404-like state distinct from network/auth errors. */
declare class NotFoundError extends Error {
    constructor(path: string);
}

export { type Entry, type GetResult, type ListOptions, type ListResult, NotFoundError, type Range, type Store, type StoreCapabilities };
