/** Collapsible JSON tree with search + jq filter + expand/collapse-all
 *  + copy-jq-path. Wire as `<FileTree jsonRenderer={renderJsonTree}>`.
 *
 *  URL state (via `use-prms`):
 *    - `?json-q=foo` — substring search; matches highlighted inline +
 *      ancestor paths auto-expanded.
 *    - `?jq=.foo[].bar` — applies a jq filter to the parsed JSON before
 *      rendering. Requires `jq-web` as an optional peer; lazy-loaded
 *      on first use.
 *
 *  On parse failure falls back to a plain `<pre>` of the raw text so
 *  the user always sees something. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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

export interface JsonTreeOptions {
  renderValue?: JsonValueRenderer
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
}

/** Build a `jsonRenderer` with per-value decoration. `renderJsonTree` is
 *  this with no options; both take `(source, usePersistedState?)`. */
export function makeJsonTreeRenderer({ renderValue, initialOpenDepth = 1, parse, label = 'JSON' }: JsonTreeOptions = {}) {
  return function renderJson(source: string, usePersistedState?: PersistedState) {
    return (
      <JsonViewer
        source={source}
        usePersistedState={usePersistedState}
        renderValue={renderValue}
        initialOpenDepth={initialOpenDepth}
        {...(parse ? { parse } : {})}
        label={label}
      />
    )
  }
}

/** Accepts an optional `usePersistedState` hook; the default
 *  `renderJsonTree` (no second arg) wires plain `useState`. Consumers
 *  who want URL state pass `useUrlPersistedState` via `<FileTree>`'s
 *  `jsonRenderer` and forward it. */
export const renderJsonTree = makeJsonTreeRenderer()

function JsonViewer({ source, usePersistedState, renderValue, initialOpenDepth, parse, label }: {
  source: string; usePersistedState?: PersistedState; renderValue?: JsonValueRenderer
  initialOpenDepth: number; parse?: (source: string) => unknown | Promise<unknown>; label: string
}) {
  const use = usePersistedState ?? defaultUseState
  const [q, setQ] = use<string>('json-q', '')
  const [jq, setJq] = use<string>('jq', '')
  // Bumped when "expand all" / "collapse all" is clicked. Each `Node`
  // tracks the last version it acted on; when the version changes,
  // re-derive its `open` state from `forceOpen`.
  const [expandVersion, setExpandVersion] = useState(0)
  // `null` = no standing force; a number opens every container
  // shallower than it. Expand-all is `Infinity`, collapse-all is `0`,
  // and "depth N" is just N — one mechanism instead of three.
  const [forceDepth, setForceDepth] = useState<number | null>(null)
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
    if (parseError || jq.trim() === '') {
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
  }, [source, jq, parseError])

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
          value={jq}
          onChange={e => setJq(e.target.value)}
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
            onClick={() => { setForceDepth(Infinity); setExpandVersion(v => v + 1) }}
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

function Node({ value, path, depth, initialOpenDepth, keyName, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue }: NodeProps) {
  const scalar = scalarNode(value, q)
  if (scalar !== null) {
    if (!renderValue) return <>{scalar}</>
    return <>{renderValue({ value, path, key: keyName, defaultNode: scalar })}</>
  }
  const rest = { path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, copyPath, renderValue, initialOpen: depth < initialOpenDepth }
  if (Array.isArray(value)) {
    return <ArrayNode value={value} {...rest} />
  }
  if (typeof value === 'object') {
    return <ObjectNode value={value as Record<string, unknown>} {...rest} />
  }
  return <span>{String(value)}</span>
}

function ArrayNode({ value, path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, initialOpen, copyPath, renderValue }: NodeProps & { value: unknown[]; initialOpen: boolean }) {
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
                <Node value={v} path={childPath} depth={depth + 1} initialOpenDepth={initialOpenDepth} q={q} matches={matches} forceDepth={forceDepth} forceOpenVersion={forceOpenVersion} copyPath={copyPath} renderValue={renderValue} />
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

function ObjectNode({ value, path, depth, initialOpenDepth, q, matches, forceDepth, forceOpenVersion, initialOpen, copyPath, renderValue }: NodeProps & { value: Record<string, unknown>; initialOpen: boolean }) {
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
                <KeyLabel keyName={k} q={q} path={childPath} copyPath={copyPath} />
                <span style={{ color: COLORS.punct }}>: </span>
                <Node value={value[k]} path={childPath} depth={depth + 1} initialOpenDepth={initialOpenDepth} keyName={k} q={q} matches={matches} forceDepth={forceDepth} forceOpenVersion={forceOpenVersion} copyPath={copyPath} renderValue={renderValue} />
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
function useOpenState(initialOpen: boolean, forceOpen: boolean | null, forceOpenVersion: number, matchedHere: boolean) {
  // A node mounts either at first render or because an ancestor just
  // opened — including as a *result* of expand-all. In that second case
  // the version-bump below can't help it (it seeds `lastVersion` to the
  // already-bumped value), so a standing `forceOpen` has to be honored
  // at mount. Without this, expand-all only reaches the frontier of
  // mounted nodes: one click per level of nesting.
  const [open, setOpen] = useState(forceOpen ?? initialOpen)
  const [lastVersion, setLastVersion] = useState(forceOpenVersion)
  // expand/collapse-all: snap to forceOpen on a version bump.
  if (forceOpenVersion !== lastVersion) {
    setLastVersion(forceOpenVersion)
    if (forceOpen !== null) setOpen(forceOpen)
  }
  // search match: open if this node is in the matched-ancestors set.
  // Don't override "user closed it" — the match → open is one-way, on
  // entry. (matchedHere flips back to false when q clears; user
  // toggling closed mid-search persists.)
  useEffect(() => {
    if (matchedHere) setOpen(true)
  }, [matchedHere])
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
function jqKeySegment(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `.${key}`
  return `["${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}

/** Walk `value` and return the set of paths that lead to a match (every
 *  ancestor of a match is also in the set, so the tree auto-expands to
 *  reveal them). Match = case-insensitive substring on a key or a
 *  string-typed value. */
function collectMatchPaths(value: unknown, q: string): Set<string> {
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
async function runJq(value: unknown, expr: string): Promise<unknown> {
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
