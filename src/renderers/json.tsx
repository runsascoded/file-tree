/** Collapsible JSON tree with search + jq filter + expand/collapse-all
 *  + copy-jq-path. Wire as `<FileTree jsonRenderer={renderJsonTree}>`.
 *
 *  URL state (via `use-prms`):
 *    - `?q=foo` — substring search; matches highlighted inline +
 *      ancestor paths auto-expanded.
 *    - `?jq=.foo[].bar` — applies a jq filter to the parsed JSON before
 *      rendering. Requires `jq-web` as an optional peer; lazy-loaded
 *      on first use.
 *
 *  On parse failure falls back to a plain `<pre>` of the raw text so
 *  the user always sees something. */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultUseState, type PersistedState } from '../react/persistedState'

const COLORS = {
  key: 'rgb(180, 200, 240)',
  string: 'rgb(220, 180, 130)',
  number: 'rgb(150, 220, 180)',
  bool: 'rgb(220, 150, 200)',
  null: 'rgb(200, 200, 200)',
  punct: 'rgba(180, 180, 180, 0.8)',
  caret: 'rgba(200, 200, 200, 0.8)',
  match: 'rgba(255, 220, 0, 0.35)',
}

const FONT = 'ui-monospace, monospace'
const INDENT = '1.4em'

export interface JsonValueCtx {
  /** The scalar itself (string / number / boolean / null). */
  value: unknown
  /** jq-style path to it, e.g. `.foo[0].bar`. */
  path: string
  /** Object key it sits under; `undefined` for array elements + root. */
  key?: string
  /** What the tree would have rendered for it. */
  defaultNode: ReactNode
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
export type JsonValueRenderer = (ctx: JsonValueCtx) => ReactNode

/** A key line, before the `:`. Separate from `renderValue` because
 *  `renderValue` only fires for scalars, and the things worth hanging
 *  off a key — a YAML comment, a schema description, a unit — belong on
 *  containers too. */
export interface JsonKeyCtx {
  key: string
  /** jq-style path to the *value* under this key. */
  path: string
  /** The whole parsed document. A renderer keyed on side-band data —
   *  YAML comments, a JSON Schema — needs something to look it up
   *  against, and the root is the only stable handle it has. */
  root: unknown
  /** What the tree would have rendered for the key. */
  defaultNode: ReactNode
}

export type JsonKeyRenderer = (ctx: JsonKeyCtx) => ReactNode

export interface JsonTreeOptions {
  renderValue?: JsonValueRenderer
  /** Decorate key labels (see `JsonKeyRenderer`). */
  renderKey?: JsonKeyRenderer
  /** How many container levels start expanded. 1 (default) opens the
   *  root and nothing else; 2 also opens its immediate children, etc.
   *  `Infinity` opens everything. Depth counts containers, so a
   *  document of flat records — `[{…}, {…}]` — needs 2 to be legible. */
  initialOpenDepth?: number
  /** How `source` becomes a value. Defaults to `JSON.parse`; the YAML
   *  renderer passes a YAML parse and gets the whole viewer — tree,
   *  search, depth controls, and jq — for free, since everything
   *  downstream operates on the parsed value rather than the text.
   *
   *  Async so a parser can be lazily imported: nobody browsing JSON
   *  should download a YAML parser. */
  parse?: (source: string) => unknown | Promise<unknown>
  /** Named in parse errors ("YAML" rather than "JSON"). */
  label?: string
  /** Milliseconds to wait after typing before running the jq filter and
   *  writing it to the URL. Default 300.
   *
   *  A jq expression is only valid at a few points while you type it, so
   *  running each keystroke means a stream of `null`s and errors for
   *  half-written filters. The right value depends on how expensive the
   *  filter is over *your* documents, so it's a knob rather than a
   *  constant: 0 disables (useful in tests, where a debounce is just
   *  latency). */
  jqDebounceMs?: number
  /** How a jq expression is applied. Defaults to `jq-web` (an optional
   *  peer, dynamically imported on first use).
   *
   *  A strategy rather than a flag: `jq-web` is a ~2.8 MB wasm module,
   *  and a consumer may already ship a jq build, prefer `jaq`, or want
   *  to run the filter server-side where the document lives. Hard-wiring
   *  it left them no way in. */
  runJq?: (value: unknown, expr: string) => Promise<unknown>
}

/** Build a `jsonRenderer` with per-value decoration. `renderJsonTree` is
 *  this with no options; both take `(source, usePersistedState?)`. */
export function makeJsonTreeRenderer({ renderValue, renderKey, initialOpenDepth = 1, parse, label = 'JSON', jqDebounceMs = 300, runJq = defaultRunJq }: JsonTreeOptions = {}) {
  return function renderJson(source: string, usePersistedState?: PersistedState) {
    return (
      <JsonViewer
        source={source}
        usePersistedState={usePersistedState}
        renderValue={renderValue}
        renderKey={renderKey}
        initialOpenDepth={initialOpenDepth}
        {...(parse ? { parse } : {})}
        label={label}
        jqDebounceMs={jqDebounceMs}
        runJq={runJq}
      />
    )
  }
}

/** Accepts an optional `usePersistedState` hook; the default
 *  `renderJsonTree` (no second arg) wires plain `useState`. Consumers
 *  who want URL state pass `useUrlPersistedState` via `<FileTree>`'s
 *  `jsonRenderer` and forward it. */
export const renderJsonTree = makeJsonTreeRenderer()

function JsonViewer({ source, usePersistedState, renderValue, renderKey, initialOpenDepth, parse, label, jqDebounceMs, runJq }: {
  source: string; usePersistedState?: PersistedState; renderValue?: JsonValueRenderer; renderKey?: JsonKeyRenderer
  initialOpenDepth: number; parse?: (source: string) => unknown | Promise<unknown>; label: string
  jqDebounceMs: number; runJq: (value: unknown, expr: string) => Promise<unknown>
}) {
  const use = usePersistedState ?? defaultUseState
  // `q` is shared with the directory listing's filter deliberately: they
  // are the same affordance ("the search box on this page") and
  // `<FileTree>` shows a listing or a file, never both.
  const [q, setQ] = use<string>('q', '')
  const [jq, setJq] = use<string>('jq', '')
  // Debounced: a jq filter is only valid at a few points while you type
  // it, so running (and URL-writing) every keystroke means a stream of
  // `null`s and errors for expressions you're halfway through.
  const [jqDraft, setJqDraft] = useState(jq)
  useEffect(() => setJqDraft(jq), [jq])
  useEffect(() => {
    if (jqDraft === jq) return
    if (jqDebounceMs <= 0) { setJq(jqDraft); return }
    const t = setTimeout(() => setJq(jqDraft), jqDebounceMs)
    return () => clearTimeout(t)
  }, [jqDraft, jqDebounceMs])
  // Bumped when "expand all" / "collapse all" is clicked. Each `Node`
  // tracks the last version it acted on; when the version changes,
  // re-derive its `open` state from `forceOpen`.
  const [expandVersion, setExpandVersion] = useState(0)
  // `null` = no standing force; a number opens every container
  // shallower than it. Expand-all is `Infinity`, collapse-all is `0`,
  // and "depth N" is just N — one mechanism instead of three.
  const [forceDepth, setForceDepth] = usePersistedDepth(use)
  const [copyToast, setCopyToast] = useState<string | null>(null)

  // A custom `parse` may be async (lazily-imported parser), so the
  // parsed value is state rather than derived. `JSON.parse` stays
  // synchronous — the common case shouldn't flash a loading state.
  const [asyncParsed, setAsyncParsed] = useState<{ value: unknown } | { error: string } | null>(null)
  useEffect(() => {
    if (!parse) return
    let cancelled = false
    setAsyncParsed(null)
    Promise.resolve().then(() => parse(source))
      .then(value => { if (!cancelled) setAsyncParsed({ value }) })
      .catch(e => { if (!cancelled) setAsyncParsed({ error: String(e) }) })
    return () => { cancelled = true }
  }, [source, parse])

  let parsed: unknown
  let parseError: string | null = null
  let parsing = false
  if (parse) {
    if (asyncParsed === null) parsing = true
    else if ('error' in asyncParsed) parseError = asyncParsed.error
    else parsed = asyncParsed.value
  } else {
    try { parsed = JSON.parse(source) } catch (e) { parseError = String(e) }
  }

  const [jqResult, setJqResult] = useState<{ value: unknown } | null>(null)
  const [jqError, setJqError] = useState<string | null>(null)
  const [jqLoading, setJqLoading] = useState(false)

  useEffect(() => {
    // `parsing` is load-bearing, not defensive: with an async `parse`
    // the first run of this effect sees `parsed === undefined`, and
    // `parsed` can't be a dependency (JSON re-parses to a fresh object
    // every render, which would loop). Gating on the flag makes the
    // effect re-run exactly once, when the value arrives.
    if (parseError || parsing || jq.trim() === '') {
      setJqResult(null); setJqError(null); setJqLoading(false)
      return
    }
    let cancelled = false
    setJqLoading(true); setJqError(null)
    runJq(parsed, jq).then(value => {
      if (cancelled) return
      setJqResult({ value }); setJqLoading(false)
    }).catch(e => {
      if (cancelled) return
      setJqError(String(e)); setJqResult(null); setJqLoading(false)
    })
    return () => { cancelled = true }
  }, [source, jq, parseError, parsing, runJq])

  const value = jqResult ? jqResult.value : parsed
  const matches = useMemo(() => q.trim() === '' || value === undefined ? null : collectMatchPaths(value, q), [value, q])

  if (parsing) return <div style={{ opacity: 0.6 }}>parsing {label}…</div>
  if (parseError) {
    return (
      <>
        <div style={{ color: 'salmon', fontSize: '0.85em', marginBottom: '0.4em' }}>
          {parseError} — showing raw text:
        </div>
        <RawPre>{source}</RawPre>
      </>
    )
  }

  function copyPath(path: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(path || '.').then(() => {
      setCopyToast(path || '.')
      setTimeout(() => setCopyToast(null), 1200)
    }).catch(() => { /* swallow */ })
  }

  return (
    <div style={{ fontFamily: FONT, fontSize: '0.85em' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.5em', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="search"
          style={inputStyle}
        />
        <input
          type="text"
          value={jqDraft}
          onChange={e => setJqDraft(e.target.value)}
          placeholder="jq filter (e.g. .foo[].bar)"
          style={{ ...inputStyle, minWidth: '16em' }}
          spellCheck={false}
        />
        {/* Depth targets, not just all-or-nothing: on a document of any
            size "expand" is unusable and "collapse" hides everything,
            while the level you actually want to see is usually 2 or 3. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25em' }}>
          <span style={{ opacity: 0.6, fontSize: '0.85em' }}>depth</span>
          {([0, 1, 2, 3] as const).map(d => (
            <button
              key={d}
              onClick={() => { setForceDepth(d); setExpandVersion(v => v + 1) }}
              title={d === 0 ? 'Collapse all' : `Expand to depth ${d}`}
              style={btnStyle}
            >{d}</button>
          ))}
          <button
            onClick={() => { setForceDepth(EXPAND_ALL); setExpandVersion(v => v + 1) }}
            title="Expand all"
            style={btnStyle}
          >all</button>
        </span>
        {copyToast !== null && (
          <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
            copied <code>{copyToast}</code>
          </span>
        )}
      </div>
      {jqLoading && <div style={{ opacity: 0.6, marginBottom: '0.4em' }}>running jq…</div>}
      {jqError && (
        <div style={{ color: 'salmon', fontSize: '0.85em', marginBottom: '0.4em' }}>
          jq error: {jqError}
        </div>
      )}
      <div className="rdub-file-tree-json-tree" style={{ overflowX: 'auto', maxHeight: '80vh' }}>
        <Node
          value={value}
          path=""
          depth={0}
          initialOpenDepth={initialOpenDepth}
          q={q}
          matches={matches}
          forceDepth={forceDepth}
          forceOpenVersion={expandVersion}
          copyPath={copyPath}
          renderValue={renderValue}
          renderKey={renderKey}
          root={value}
        />
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '0.3em 0.6em',
  borderRadius: 4,
  border: '1px solid rgba(127,127,127,0.4)',
  background: 'rgba(127,127,127,0.08)',
  color: 'inherit',
  fontFamily: FONT,
  fontSize: 'inherit',
  minWidth: '12em',
}

const btnStyle: React.CSSProperties = {
  fontSize: '0.85em',
  padding: '0.25em 0.7em',
  borderRadius: 4,
  border: '1px solid rgba(127,127,127,0.4)',
  background: 'rgba(127,127,127,0.08)',
  color: 'inherit',
  cursor: 'pointer',
}

function RawPre({ children }: { children: string }) {
  return (
    <pre style={{
      background: 'rgba(127,127,127,0.08)',
      padding: '0.6em 0.8em',
      borderRadius: 4,
      overflow: 'auto',
      maxHeight: '80vh',
      fontSize: '0.85em',
      fontFamily: FONT,
      whiteSpace: 'pre-wrap',
    }}>{children}</pre>
  )
}

interface NodeProps {
  value: unknown
  /** jq-style path to this node (e.g. `.foo[0].bar`, `""` at root). */
  path: string
  /** Container nesting level; 0 at the root. Compared against
   *  `initialOpenDepth` to decide whether this node starts expanded. */
  depth: number
  initialOpenDepth: number
  /** Object key this node sits under; unset for array elements + root. */
  keyName?: string
  q: string
  matches: Set<string> | null
  forceDepth: number | null
  forceOpenVersion: number
  renderKey?: JsonKeyRenderer
  root: unknown
  copyPath: (path: string) => void
  renderValue?: JsonValueRenderer
}

/** Default rendering for a scalar; `null` signals "this is a container",
 *  which `Node` hands to `ArrayNode` / `ObjectNode` instead. */
function scalarNode(value: unknown, q: string): ReactNode {
  if (value === null) return <span style={{ color: COLORS.null }}>null</span>
  if (typeof value === 'string') return <HighlightedString value={value} q={q} />
  if (typeof value === 'number') return <span style={{ color: COLORS.number }}>{value}</span>
  if (typeof value === 'boolean') return <span style={{ color: COLORS.bool }}>{String(value)}</span>
  return null
}

function Node({ value, path, depth, initialOpenDepth, keyName, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, renderKey, root }: NodeProps) {
  const scalar = scalarNode(value, q)
  if (scalar !== null) {
    if (!renderValue) return <>{scalar}</>
    return <>{renderValue({ value, path, key: keyName, defaultNode: scalar })}</>
  }
  const rest = { path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, renderKey, root, initialOpen: depth < initialOpenDepth }
  if (Array.isArray(value)) {
    return <ArrayNode value={value} {...rest} />
  }
  if (typeof value === 'object') {
    return <ObjectNode value={value as Record<string, unknown>} {...rest} />
  }
  return <span>{String(value)}</span>
}

function ArrayNode({ value, path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, initialOpen, copyPath, renderValue, renderKey, root }: NodeProps & { value: unknown[]; initialOpen: boolean }) {
  const matchedHere = matches?.has(path) ?? false
  // Resolved per container: the force is expressed as a depth, so
  // each node decides for itself whether it's inside it.
  const [open, setOpen] = useOpenState(initialOpen, forceDepth === null ? null : depth < forceDepth, forceOpenVersion, matchedHere)
  if (value.length === 0) return <span style={{ color: COLORS.punct }}>[]</span>
  return (
    <span>
      <Toggle open={open} onClick={() => setOpen(o => !o)} />
      <span style={{ color: COLORS.punct }}>[</span>
      {open ? (
        <div style={{ marginLeft: INDENT }}>
          {value.map((v, i) => {
            const childPath = `${path}[${i}]`
            return (
              <div key={i}>
                <Node value={v} path={childPath} depth={depth + 1} initialOpenDepth={initialOpenDepth} q={q} matches={matches} forceDepth={forceDepth} forceOpenVersion={forceOpenVersion} copyPath={copyPath} renderValue={renderValue} renderKey={renderKey} root={root} />
                {i < value.length - 1 && <span style={{ color: COLORS.punct }}>,</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <span style={{ color: COLORS.punct, opacity: 0.7 }}> {value.length} items </span>
      )}
      <span style={{ color: COLORS.punct }}>]</span>
    </span>
  )
}

function ObjectNode({ value, path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, initialOpen, copyPath, renderValue, renderKey, root }: NodeProps & { value: Record<string, unknown>; initialOpen: boolean }) {
  const matchedHere = matches?.has(path) ?? false
  // Resolved per container: the force is expressed as a depth, so
  // each node decides for itself whether it's inside it.
  const [open, setOpen] = useOpenState(initialOpen, forceDepth === null ? null : depth < forceDepth, forceOpenVersion, matchedHere)
  const keys = Object.keys(value)
  if (keys.length === 0) return <span style={{ color: COLORS.punct }}>{'{}'}</span>
  return (
    <span>
      <Toggle open={open} onClick={() => setOpen(o => !o)} />
      <span style={{ color: COLORS.punct }}>{'{'}</span>
      {open ? (
        <div style={{ marginLeft: INDENT }}>
          {keys.map((k, i) => {
            const childPath = `${path}${jqKeySegment(k)}`
            return (
              <div key={k}>
                {renderKey
                  ? renderKey({ key: k, path: childPath, root, defaultNode: <KeyLabel keyName={k} q={q} path={childPath} copyPath={copyPath} /> })
                  : <KeyLabel keyName={k} q={q} path={childPath} copyPath={copyPath} />}
                <span style={{ color: COLORS.punct }}>: </span>
                <Node value={value[k]} path={childPath} depth={depth + 1} initialOpenDepth={initialOpenDepth} keyName={k} q={q} matches={matches} forceDepth={forceDepth} forceOpenVersion={forceOpenVersion} copyPath={copyPath} renderValue={renderValue} renderKey={renderKey} root={root} />
                {i < keys.length - 1 && <span style={{ color: COLORS.punct }}>,</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <span style={{ color: COLORS.punct, opacity: 0.7 }}> {keys.length} keys </span>
      )}
      <span style={{ color: COLORS.punct }}>{'}'}</span>
    </span>
  )
}

/** Per-node `open` state that respects: (a) initial, (b) user toggles,
 *  (c) global expand/collapse-all bumps, (d) search-match auto-open. */
/** Expansion depth, in the URL alongside `q`/`jq` — "here's the file,
 *  opened two levels down" is exactly the kind of thing you paste to
 *  someone. `-1` is the sentinel for "untouched", since the meaningful
 *  values include 0 (collapse all) and Infinity (expand all), and the
 *  persisted-state hook carries numbers, not `null`. */
const EXPAND_ALL = 99

function usePersistedDepth(use: PersistedState): [number | null, (d: number) => void] {
  const [raw, setRaw] = use<number>('depth', -1)
  return [raw < 0 ? null : (raw === 0 ? 0 : raw), setRaw]
}

/** Open/closed state for one container, reconciling three inputs: its
 *  initial depth, a standing depth-force (expand/collapse to N), and
 *  search. Exported because getting the interaction right — search
 *  closing only what search opened, a force reaching nodes that mount
 *  *because* of it — is the fiddly part of a tree, and a fork
 *  shouldn't have to rediscover it. */
export function useOpenState(initialOpen: boolean, forceOpen: boolean | null, forceOpenVersion: number, matchedHere: boolean) {
  // A node mounts either at first render or because an ancestor just
  // opened — including as a *result* of expand-all. In that second case
  // the version-bump below can't help it (it seeds `lastVersion` to the
  // already-bumped value), so a standing `forceOpen` has to be honored
  // at mount. Without this, expand-all only reaches the frontier of
  // mounted nodes: one click per level of nesting.
  const [open, setOpenRaw] = useState(forceOpen ?? initialOpen)
  const [lastVersion, setLastVersion] = useState(forceOpenVersion)
  // expand/collapse-all: snap to forceOpen on a version bump.
  if (forceOpenVersion !== lastVersion) {
    setLastVersion(forceOpenVersion)
    if (forceOpen !== null) setOpenRaw(forceOpen)
  }

  // Search opens a node to reveal a match, and *closes it again* when
  // the node stops matching. One-way opening looks broken while typing:
  // an early prefix matches half the document, and narrowing to the
  // real query leaves everything it touched hanging open. Only nodes
  // search itself opened are closed again, so a node you opened by hand
  // stays open — hence the flag, cleared by any manual toggle.
  const openedBySearch = useRef(false)
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (matchedHere) {
      if (!openRef.current) { openedBySearch.current = true; setOpenRaw(true) }
    } else if (openedBySearch.current) {
      openedBySearch.current = false
      setOpenRaw(false)
    }
  }, [matchedHere])

  const setOpen = useCallback((v: boolean | ((o: boolean) => boolean)) => {
    openedBySearch.current = false
    setOpenRaw(v)
  }, [])
  return [open, setOpen] as const
}

function KeyLabel({ keyName, q, path, copyPath }: { keyName: string; q: string; path: string; copyPath: (p: string) => void }) {
  return (
    <span
      onClick={() => copyPath(path)}
      title={`copy ${path || '.'}`}
      style={{ color: COLORS.key, cursor: 'pointer' }}
    >
      "<HighlightedText text={keyName} q={q} />"
    </span>
  )
}

function HighlightedString({ value, q }: { value: string; q: string }) {
  return (
    <span style={{ color: COLORS.string }}>
      "<HighlightedText text={value} q={q} />"
    </span>
  )
}

function HighlightedText({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: ReactNode[] = []
  let i = 0
  while (i < text.length) {
    const found = lower.indexOf(needle, i)
    if (found < 0) { parts.push(text.slice(i)); break }
    if (found > i) parts.push(text.slice(i, found))
    parts.push(<mark key={found} style={{ background: COLORS.match, color: 'inherit', padding: 0 }}>{text.slice(found, found + needle.length)}</mark>)
    i = found + needle.length
  }
  return <>{parts}</>
}

function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: COLORS.caret,
        cursor: 'pointer',
        padding: 0,
        marginRight: '0.2em',
        fontFamily: FONT,
        fontSize: 'inherit',
      }}
      aria-label={open ? 'Collapse' : 'Expand'}
    >
      {open ? '▾' : '▸'}
    </button>
  )
}

/** jq path segment for a key: `.foo` for valid identifiers, `["weird key"]`
 *  otherwise. (jq's own rule.) */
/** jq path segment for an object key — `.foo`, or `["odd key"]` when
 *  it isn't a bare identifier. Exported because anything keying
 *  side-band data to tree paths (YAML comments, a JSON Schema) has to
 *  build the same strings `renderKey`/`renderValue` hand back. */
export function jqKeySegment(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `.${key}`
  return `["${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}

/** Walk `value` and return the set of paths that lead to a match (every
 *  ancestor of a match is also in the set, so the tree auto-expands to
 *  reveal them). Match = case-insensitive substring on a key or a
 *  string-typed value. */
/** Paths of every node matching `q`, plus their ancestors — the set
 *  the tree opens to reveal a match. Exported for a fork implementing
 *  its own search UI over the same semantics. */
export function collectMatchPaths(value: unknown, q: string): Set<string> {
  const out = new Set<string>()
  const needle = q.toLowerCase()
  function visit(v: unknown, path: string): boolean {
    let matched = false
    if (typeof v === 'string' && v.toLowerCase().includes(needle)) matched = true
    if (Array.isArray(v)) {
      v.forEach((child, i) => {
        if (visit(child, `${path}[${i}]`)) matched = true
      })
    } else if (v !== null && typeof v === 'object') {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const childPath = `${path}${jqKeySegment(k)}`
        const keyMatched = k.toLowerCase().includes(needle)
        if (keyMatched) { out.add(childPath); matched = true }
        if (visit(child, childPath)) matched = true
      }
    }
    if (matched) out.add(path)
    return matched
  }
  visit(value, '')
  return out
}

interface JqModule { json: (value: unknown, expr: string) => unknown }

/** Lazy-load `jq-web` (optional peer) and apply `expr` to `value`.
 *  Throws a clear error if the peer isn't installed so the consumer
 *  can act on it (the `?jq=` input is the natural place).
 *
 *  `jq-web` ships its default export as a Promise that resolves once
 *  the WASM module is initialized — hence the double-await. */
/** Default `runJq`: the `jq-web` optional peer, imported on first use.
 *  Exported so a consumer wrapping it (caching, a worker) doesn't have
 *  to reimplement the import + error message. */
export async function defaultRunJq(value: unknown, expr: string): Promise<unknown> {
  let mod: { default: Promise<JqModule> | JqModule }
  try {
    // @ts-expect-error jq-web has no types; treat as untyped.
    mod = (await import('jq-web')) as unknown as { default: Promise<JqModule> | JqModule }
  } catch {
    throw new Error('jq filtering requires the `jq-web` peer dep — install it in your app to enable.')
  }
  const jq = await mod.default
  return jq.json(value, expr)
}
