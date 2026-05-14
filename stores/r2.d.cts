import { Store } from '../index.cjs';

/** Cloudflare's `R2Bucket` shape — minimal subset we use. Avoid pulling in
 *  `@cloudflare/workers-types` as a dep so non-CFW consumers can install
 *  the package without a phantom type. Exported for tests / mock impls. */
interface R2Bucket {
    list(opts: {
        prefix?: string;
        delimiter?: string;
        cursor?: string;
        limit?: number;
    }): Promise<{
        objects: Array<{
            key: string;
            size: number;
            uploaded: Date;
            httpMetadata?: {
                contentType?: string;
            };
        }>;
        delimitedPrefixes?: string[];
        truncated: boolean;
        cursor?: string;
    }>;
    get(key: string, opts?: {
        range?: {
            offset: number;
            length: number;
        };
    }): Promise<{
        body: ReadableStream<Uint8Array>;
        arrayBuffer: () => Promise<ArrayBuffer>;
        size: number;
        httpMetadata?: {
            contentType?: string;
        };
    } | null>;
}
interface R2PresignOptions {
    /** R2 S3-compatible endpoint, e.g. `https://<account>.r2.cloudflarestorage.com`. */
    endpoint: string;
    /** Bucket name (used in the path-style URL the signer presigns). */
    bucket: string;
    /** R2 access-key ID (S3-compat). */
    accessKeyId: string;
    /** R2 secret access key (S3-compat). */
    secretAccessKey: string;
    /** Default URL lifetime in seconds. Default `3600` (1h). Per-call
     *  override via `getDownloadUrl(path, { expiresIn })`. */
    expiresIn?: number;
    /** Region passed to SigV4. R2 ignores it; default `'auto'`. */
    region?: string;
}
interface R2StoreOptions {
    /** Allow-list of key prefixes. Any list/get for paths outside these is
     *  rejected. Use `['']` to allow the whole bucket (escape-hatch). */
    prefixes?: string[];
    /** Public base URL the bucket is reachable at — either an `r2.dev`
     *  subdomain (dev/casual; CF rate-limits these) or a custom domain
     *  attached to the bucket (production). When set, exposes a sync
     *  `getUrl(path)` returning `${publicBaseUrl}/${key}`. Cheapest path:
     *  no signing, no expiry, no token, browser GETs direct from R2.
     *
     *  Caveat: cross-origin `<a download>` only force-downloads when the
     *  response carries `Content-Disposition: attachment`. R2 sets that
     *  header iff each object's `httpMetadata.contentDisposition` was set
     *  at upload time. Without it, the browser navigates to the file
     *  (which is fine for text/image/video but may show garbage for raw
     *  binary). For guaranteed force-download on already-public buckets,
     *  configure object metadata or use `presign` instead.
     *
     *  Precedence: if both `publicBaseUrl` and `presign` are set, the
     *  UI's async `getDownloadUrl` (presign) wins per `<FileTree>`'s
     *  precedence rule. Usually you want one or the other. */
    publicBaseUrl?: string;
    /** S3-compatible credentials enabling `getDownloadUrl()` (presigned
     *  GETs). When set, the worker can mint URLs the browser uses to
     *  stream bytes directly from R2 — no proxying through `/get`. */
    presign?: R2PresignOptions;
}
declare function R2Store(bucket: R2Bucket, opts?: R2StoreOptions): Store;

export { type R2Bucket, type R2PresignOptions, R2Store, type R2StoreOptions };
