/** YAML as a collapsible tree, rather than syntax-highlighted text.
 *
 *  Almost nothing here: YAML's data model is JSON's plus a few scalar
 *  types, so parsing it to a value and handing that to the JSON tree
 *  gets the whole viewer — collapsible nodes, substring search, the
 *  depth controls, copy-path, **and jq** — for free. "yq" isn't a
 *  separate thing to build: jq operates on the parsed value, and by
 *  then YAML and JSON are the same value.
 *
 *  The parser is an optional peer, lazily imported on first use, so a
 *  page that never opens a `.yaml` never downloads one. Same bargain as
 *  `jq-web` in the JSON renderer.
 *
 *  Wire as `<FileTree extraTexty={['yaml', 'yml']} jsonRenderer={…}>`,
 *  or register it through `viewers` to keep it out of the main bundle
 *  entirely. */
import type { ReactNode } from 'react'
import { makeJsonTreeRenderer, type JsonKeyCtx, type JsonTreeOptions } from './json'

type YamlDoc = {
  toJS: () => unknown
  contents: unknown
}
type YamlModule = {
  parse: (src: string) => unknown
  parseDocument: (src: string) => YamlDoc
}

let cached: Promise<YamlModule> | null = null

/** `yaml` (eemeli/yaml) — the maintained one, and it handles YAML 1.2,
 *  anchors/aliases, and multi-document streams. Cached so a tree of
 *  YAML files imports it once. */
function loadYaml(): Promise<YamlModule> {
  cached ??= import('yaml')
    .then(m => m as unknown as YamlModule)
    .catch(() => {
      cached = null   // let a later attempt retry rather than caching the failure
      throw new Error('YAML rendering requires the `yaml` peer dep — install it in your app to enable.')
    })
  return cached
}

/** Comments are the reason to write YAML instead of JSON, and they are
 *  *not in the data model* — `parse()` drops them silently, so a tree of
 *  parsed values loses the thing the author cared most about.
 *
 *  So parse to a document, walk it once collecting jq-path → comment,
 *  and hand those to the tree's `renderKey`. Both kinds are kept:
 *  `commentBefore` (the lines above a key) and `comment` (trailing, on
 *  the same line).
 *
 *  Keyed by path rather than attached to values because comments belong
 *  to *keys* — including keys whose value is a container, which is
 *  exactly where `renderValue` can't reach. */
const comments = new WeakMap<object, Map<string, string>>()

/** jq path segment, matching the JSON tree's own `jqKeySegment`. */
function seg(k: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`
}

type YamlNode = {
  items?: unknown[]
  key?: { value?: unknown }
  value?: unknown
  comment?: string | null
  commentBefore?: string | null
}

function collect(node: unknown, path: string, out: Map<string, string>): void {
  const n = node as YamlNode | null
  if (!n || typeof n !== 'object' || !Array.isArray(n.items)) return
  n.items.forEach((item, i) => {
    const pair = item as YamlNode
    // A map's items are key/value pairs; a sequence's are bare nodes.
    if (pair && typeof pair === 'object' && 'key' in pair) {
      const k = pair.key?.value
      if (typeof k !== 'string') return
      const childPath = `${path}${seg(k)}`
      // `commentBefore` hangs off the *key* node (the lines above it);
      // the trailing `# …` hangs off the value. Both are the key's as
      // far as a reader is concerned.
      const key = pair.key as YamlNode | undefined
      const val = pair.value as YamlNode | undefined
      const parts = [key?.commentBefore, val?.comment]
        .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        .map(c => c.split('\n').map(l => l.replace(/^#?\s*/, '').trim()).filter(Boolean).join(' '))
      if (parts.length) out.set(childPath, parts.join(' — '))
      collect(pair.value, childPath, out)
    } else {
      collect(pair, `${path}[${i}]`, out)
    }
  })
}

export async function parseYaml(source: string): Promise<unknown> {
  const { parseDocument } = await loadYaml()
  const doc = parseDocument(source)
  const value = doc.toJS()
  if (value !== null && typeof value === 'object') {
    const map = new Map<string, string>()
    collect(doc.contents, '', map)
    if (map.size) comments.set(value, map)
  }
  return value
}

/** Appends the comment a key carried in the source. Composes with a
 *  consumer's own `renderKey` rather than replacing it. */
function commentRenderKey(user?: (ctx: JsonKeyCtx) => ReactNode) {
  return (ctx: JsonKeyCtx) => {
    const node = user ? user(ctx) : ctx.defaultNode
    const { root } = ctx
    const map = root !== null && typeof root === 'object' ? comments.get(root) : undefined
    const c = map?.get(ctx.path)
    if (!c) return node
    // Above the key, on its own line — where YAML puts them, and the
    // only place that doesn't cut the `key: value` line in half.
    return (
      <>
        <div style={{ opacity: 0.45, fontStyle: 'italic', fontWeight: 400, whiteSpace: 'normal' }}># {c}</div>
        {node}
      </>
    )
  }
}

/** Same options as the JSON tree (`renderValue`, `initialOpenDepth`) —
 *  minus `parse`/`label`, which this supplies. */
export type YamlTreeOptions = Omit<JsonTreeOptions, 'parse' | 'label'>

export function makeYamlTreeRenderer(opts: YamlTreeOptions = {}) {
  return makeJsonTreeRenderer({
    ...opts,
    parse: parseYaml,
    label: 'YAML',
    renderKey: commentRenderKey(opts.renderKey),
  })
}

export const renderYamlTree = makeYamlTreeRenderer()
