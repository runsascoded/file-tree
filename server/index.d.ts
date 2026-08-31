import { Store } from '../index.js';

/** Server-side HTTP handlers that expose any `Store` over HTTP.
 *
 * Wire these into your CFW (or Node) router. The companion `HttpStore`
 * client (`@rdub/file-tree/stores/http`) speaks to this protocol.
 *
 * Endpoints (all GET):
 *   /list?prefix=<p>&cursor=<c>&limit=<n>     → ListResult JSON
 *   /get?path=<p>                              → object bytes (Range honored)
 *   /presign?path=<p>&expires=<s>              → { url } JSON
 *     Only mounted when the underlying store implements `getDownloadUrl`.
 *     `expires` is forwarded to the store (caller hint); stores that
 *     ignore it use their built-in default.
 */

/** The parts of Cloudflare's `ExecutionContext` a handler can use.
 *
 *  Structural on purpose: a Worker passes its `ctx` straight through,
 *  and a Node or test caller passes nothing. */
interface HandlerContext {
    /** Keep `p` alive past the response — cache writes, metrics. */
    waitUntil?(p: Promise<unknown>): void;
}
interface Handlers {
    /** Try to handle `request`. Returns `null` if the URL doesn't match a
     *  file-tree endpoint, so callers can chain other routes. */
    handle(request: Request, ctx?: HandlerContext): Promise<Response | null>;
}
interface CreateHandlersOptions {
    /** Path under which the endpoints live. Defaults to `/`. The `/list`,
     *  `/get` endpoints are appended to this base. */
    basePath?: string;
    /** CORS origin to advertise. Defaults to `*`. Set to `null` to skip
     *  CORS headers. */
    corsOrigin?: string | null;
}
declare function createHandlers(store: Store, opts?: CreateHandlersOptions): Handlers;

export { type CreateHandlersOptions, type HandlerContext, type Handlers, createHandlers };
