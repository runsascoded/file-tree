import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';

interface JsonValueCtx {
    /** The scalar itself (string / number / boolean / null). */
    value: unknown;
    /** jq-style path to it, e.g. `.foo[0].bar`. */
    path: string;
    /** Object key it sits under; `undefined` for array elements + root. */
    key?: string;
    /** What the tree would have rendered for it. */
    defaultNode: ReactNode;
}
/** Per-scalar render hook: called for every string / number / boolean /
 *  null in the document; return `ctx.defaultNode` for the ones you don't
 *  care about. Use it to annotate domain-specific values — epoch
 *  timestamps as dates, byte counts as KiB, ids as names:
 *
 *    renderValue: ({ key, value, defaultNode }) =>
 *      key === 'ts' && typeof value === 'number'
 *        ? <>{defaultNode} <em>{new Date(value * 1000).toISOString()}</em></>
 *        : defaultNode
 *
 *  Containers (objects / arrays) are not passed through it — they own
 *  the disclosure carets and child layout. */
type JsonValueRenderer = (ctx: JsonValueCtx) => ReactNode;
/** A key line, before the `:`. Separate from `renderValue` because
 *  `renderValue` only fires for scalars, and the things worth hanging
 *  off a key — a YAML comment, a schema description, a unit — belong on
 *  containers too. */
interface JsonKeyCtx {
    key: string;
    /** jq-style path to the *value* under this key. */
    path: string;
    /** The whole parsed document. A renderer keyed on side-band data —
     *  YAML comments, a JSON Schema — needs something to look it up
     *  against, and the root is the only stable handle it has. */
    root: unknown;
    /** What the tree would have rendered for the key. */
    defaultNode: ReactNode;
}
type JsonKeyRenderer = (ctx: JsonKeyCtx) => ReactNode;
interface JsonTreeOptions {
    renderValue?: JsonValueRenderer;
    /** Decorate key labels (see `JsonKeyRenderer`). */
    renderKey?: JsonKeyRenderer;
    /** How many container levels start expanded. 1 (default) opens the
     *  root and nothing else; 2 also opens its immediate children, etc.
     *  `Infinity` opens everything. Depth counts containers, so a
     *  document of flat records — `[{…}, {…}]` — needs 2 to be legible. */
    initialOpenDepth?: number;
    /** How `source` becomes a value. Defaults to `JSON.parse`; the YAML
     *  renderer passes a YAML parse and gets the whole viewer — tree,
     *  search, depth controls, and jq — for free, since everything
     *  downstream operates on the parsed value rather than the text.
     *
     *  Async so a parser can be lazily imported: nobody browsing JSON
     *  should download a YAML parser. */
    parse?: (source: string) => unknown | Promise<unknown>;
    /** Named in parse errors ("YAML" rather than "JSON"). */
    label?: string;
    /** Milliseconds to wait after typing before running the jq filter and
     *  writing it to the URL. Default 300.
     *
     *  A jq expression is only valid at a few points while you type it, so
     *  running each keystroke means a stream of `null`s and errors for
     *  half-written filters. The right value depends on how expensive the
     *  filter is over *your* documents, so it's a knob rather than a
     *  constant: 0 disables (useful in tests, where a debounce is just
     *  latency). */
    jqDebounceMs?: number;
    /** How a jq expression is applied. Defaults to `jq-web` (an optional
     *  peer, dynamically imported on first use).
     *
     *  A strategy rather than a flag: `jq-web` is a ~2.8 MB wasm module,
     *  and a consumer may already ship a jq build, prefer `jaq`, or want
     *  to run the filter server-side where the document lives. Hard-wiring
     *  it left them no way in. */
    runJq?: (value: unknown, expr: string) => Promise<unknown>;
}
/** Build a `jsonRenderer` with per-value decoration. `renderJsonTree` is
 *  this with no options; both take `(source, usePersistedState?)`. */
declare function makeJsonTreeRenderer({ renderValue, renderKey, initialOpenDepth, parse, label, jqDebounceMs, runJq }?: JsonTreeOptions): (source: string, usePersistedState?: PersistedState) => react_jsx_runtime.JSX.Element;
/** Accepts an optional `usePersistedState` hook; the default
 *  `renderJsonTree` (no second arg) wires plain `useState`. Consumers
 *  who want URL state pass `useUrlPersistedState` via `<FileTree>`'s
 *  `jsonRenderer` and forward it. */
declare const renderJsonTree: (source: string, usePersistedState?: PersistedState) => react_jsx_runtime.JSX.Element;
/** Lazy-load `jq-web` (optional peer) and apply `expr` to `value`.
 *  Throws a clear error if the peer isn't installed so the consumer
 *  can act on it (the `?jq=` input is the natural place).
 *
 *  `jq-web` ships its default export as a Promise that resolves once
 *  the WASM module is initialized — hence the double-await. */
/** Default `runJq`: the `jq-web` optional peer, imported on first use.
 *  Exported so a consumer wrapping it (caching, a worker) doesn't have
 *  to reimplement the import + error message. */
declare function defaultRunJq(value: unknown, expr: string): Promise<unknown>;

export { type JsonKeyCtx, type JsonKeyRenderer, type JsonTreeOptions, type JsonValueCtx, type JsonValueRenderer, defaultRunJq, makeJsonTreeRenderer, renderJsonTree };
