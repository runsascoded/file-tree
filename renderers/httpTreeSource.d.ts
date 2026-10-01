import { TreeSourceCapabilities, TreeSource } from './treeSource.js';

interface HttpTreeSourceOptions {
    /** Base URL the endpoints hang off, e.g. `https://api.example.com/tree`. */
    baseUrl: string;
    /** What the server's source can do. The client can't discover this
     *  synchronously, and guessing wrong means offering chrome that fails —
     *  so it's declared, mirroring the server's source. Default: a plain
     *  lazy tree (`history`/`diff`/`scan` off); methods for disabled
     *  capabilities are omitted. */
    capabilities?: Partial<TreeSourceCapabilities>;
    /** Auth headers, an `AbortSignal`, or a test double. Defaults to
     *  global `fetch`. */
    fetch?: typeof fetch;
}
declare function httpTreeSource(opts: HttpTreeSourceOptions): TreeSource;

export { type HttpTreeSourceOptions, httpTreeSource };
