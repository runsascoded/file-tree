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
    /** Where this store's data actually lives, for display —
     *  `r2://my-bucket/prefix/`, `s3://…`, `gs://…`.
     *
     *  The breadcrumb's root reads "root" otherwise, which obscures the
     *  one thing a reader can't infer from the page: *which* bucket they
     *  are looking at. Only the store knows — an `HttpStore` client sees
     *  an API base and nothing about what's behind it, so this has to come
     *  from the store rather than be guessed by the UI.
     *
     *  Display only. It isn't parsed, isn't a URL to fetch, and stores
     *  that would rather not disclose their backing location simply omit
     *  it — in which case the root crumb stays "root". */
    describe?(): string | undefined;
    /** Direct downloadable URL for `path`, when the store can produce one.
     *  The UI uses this to render a `<a href download>` link (browser
     *  streams the bytes — no client buffering). Stores that can't expose a
     *  GET-able URL (in-memory, CFW R2 binding, presigning-required) omit
     *  this and the UI hides the download affordance. */
    getUrl?(path: string): string;
    /** Like `getUrl(path)` but async — for stores that mint URLs on demand
     *  (SigV4 presigning, redirect lookups). The returned URL should point
     *  directly at the underlying storage so the browser streams bytes
     *  without the worker in the data path. Implementations should set a
     *  `response-content-disposition` query param (or equivalent) so the
     *  saved file is named after the object basename, regardless of origin.
     *
     *  Precedence: `<FileTree>` prefers `getDownloadUrl` when present,
     *  falling back to `getUrl` for stores whose URL is static.
     *
     *  `opts.expiresIn` is a hint to stores that mint short-lived URLs
     *  (presigning); ignored by stores that don't. */
    getDownloadUrl?(path: string, opts?: {
        expiresIn?: number;
    }): Promise<string>;
    /** Optional zip-aware shortcut: return the central-directory listing
     *  for a zip at `path`. When defined, `<FileTree>`'s default zip view
     *  delegates here (e.g. a server-side inflate worker). When undefined,
     *  the lib parses the central directory client-side via range reads
     *  on `get(path, range)`. Implement only if you have an existing
     *  server-side path; the client default works for any store. */
    getZipEntries?(path: string): Promise<ZipEntriesResult>;
    /** Optional zip-aware shortcut: return the raw uncompressed bytes for
     *  one entry inside a zip at `path`. Same delegation rules as
     *  `getZipEntries`. Stores omitting this fall back to client-side
     *  inflate via `DecompressionStream('deflate-raw')`. */
    getZipEntry?(path: string, entry: string, opts?: {
        max?: number;
    }): Promise<GetResult>;
}
interface ZipEntry {
    /** Entry name (path inside the zip). */
    name: string;
    /** Uncompressed size in bytes. */
    size: number;
    /** Compressed size in bytes. */
    compressedSize: number;
    /** zip compression method: `0` = stored, `8` = DEFLATE. */
    method: number;
    /** Byte offset of the entry's local file header within the zip. */
    localHeaderOffset: number;
    /** Last-modified timestamp (DOS time), ISO-8601 when known. */
    lastModified?: string;
}
interface ZipEntriesResult {
    entries: ZipEntry[];
    /** Sum of `size` across all entries. */
    totalSize: number;
    /** Sum of `compressedSize` across all entries. */
    totalCompressed: number;
}
/** Sentinel error type stores throw for missing keys, so UI can render
 *  a 404-like state distinct from network/auth errors. */
declare class NotFoundError extends Error {
    constructor(path: string);
}

export { type Entry, type GetResult, type ListOptions, type ListResult, NotFoundError, type Range, type Store, type StoreCapabilities, type ZipEntriesResult, type ZipEntry };
