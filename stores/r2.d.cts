import { Store } from '../index.cjs';

/** Cloudflare Workers R2 binding-backed Store.
 *
 * Wraps a `R2Bucket` from the CFW runtime. Native binding — no HTTP, no
 * signing. Only callable from inside a Worker.
 *
 * Usage:
 *   import { R2Store } from '@rdub/file-tree/stores/r2'
 *   const store = R2Store(env.R2, { prefixes: ['raw/'] })
 */

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
interface R2StoreOptions {
    /** Allow-list of key prefixes. Any list/get for paths outside these is
     *  rejected. Use `['']` to allow the whole bucket (escape-hatch). */
    prefixes?: string[];
}
declare function R2Store(bucket: R2Bucket, opts?: R2StoreOptions): Store;

export { type R2Bucket, R2Store, type R2StoreOptions };
