import { Store } from '../index.cjs';

interface S3StoreOptions {
    /** Bucket name. Required. */
    bucket: string;
    /** AWS region. Default `'us-east-1'`. Use `'auto'` for R2. */
    region?: string;
    /** S3 endpoint override. Default builds the AWS virtual-hosted-style
     *  URL (`https://<bucket>.s3.<region>.amazonaws.com`). Set to an
     *  R2/MinIO/LocalStack endpoint to target a compatible service. When
     *  set, requests use path-style URLs (`<endpoint>/<bucket>/<key>`). */
    endpoint?: string;
    /** SigV4 access key. Omit for public/unsigned access. */
    accessKeyId?: string;
    /** SigV4 secret. Omit for public/unsigned access. */
    secretAccessKey?: string;
    /** Optional STS session token (for temporary credentials). */
    sessionToken?: string;
    /** Allow-list of key prefixes. Same semantics as `R2Store.prefixes`:
     *  empty-prefix `list('')` synthesizes a virtual root over these. */
    prefixes?: string[];
    /** Custom `fetch` impl. Defaults to global. */
    fetch?: typeof globalThis.fetch;
}
declare function S3Store(opts: S3StoreOptions): Store;

export { S3Store, type S3StoreOptions };
