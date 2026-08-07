import { Store } from '../index.js';

interface GcsStoreOptions {
    /** Bucket name. Required. */
    bucket: string;
    /** GCS HMAC interop access-key id (`GOOG1E...`). Omit for unsigned
     *  (public bucket) or bearer mode. */
    accessKeyId?: string;
    /** GCS HMAC interop secret. Omit for unsigned or bearer mode. */
    secretAccessKey?: string;
    /** OAuth bearer token provider. Called for every outbound request;
     *  return a valid `access_token`. When set, takes precedence over
     *  HMAC creds. Caller is responsible for caching/refreshing tokens
     *  (file-tree does not bundle a Google auth SDK). */
    getToken?: () => string | Promise<string>;
    /** Allow-list of key prefixes (same semantics as `S3Store.prefixes`). */
    prefixes?: string[];
    /** Endpoint override. Default `https://storage.googleapis.com`. */
    endpoint?: string;
    /** SigV4 credential-scope region for HMAC signing. Default `'auto'`.
     *  Not used for URL construction (GCS is single-endpoint), only for
     *  the SigV4 credential scope. */
    region?: string;
    /** Custom `fetch` impl. Defaults to global. */
    fetch?: typeof globalThis.fetch;
    /** Default presigned-URL lifetime in seconds. HMAC mode only. */
    presignExpiresIn?: number;
}
declare function GcsStore(opts: GcsStoreOptions): Store;

export { GcsStore, type GcsStoreOptions };
