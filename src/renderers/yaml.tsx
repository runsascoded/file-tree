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
import { makeJsonTreeRenderer, type JsonTreeOptions } from './json'

type YamlModule = { parse: (src: string) => unknown }

let cached: Promise<YamlModule> | null = null

/** `yaml` (eemeli/yaml) — the maintained one, and it handles YAML 1.2,
 *  anchors/aliases, and multi-document streams. Cached so a tree of
 *  YAML files imports it once. */
function loadYaml(): Promise<YamlModule> {
  cached ??= import('yaml')
    .then(m => ({ parse: (src: string) => (m as unknown as YamlModule).parse(src) }))
    .catch(() => {
      cached = null   // let a later attempt retry rather than caching the failure
      throw new Error('YAML rendering requires the `yaml` peer dep — install it in your app to enable.')
    })
  return cached
}

export async function parseYaml(source: string): Promise<unknown> {
  const { parse } = await loadYaml()
  return parse(source)
}

/** Same options as the JSON tree (`renderValue`, `initialOpenDepth`) —
 *  minus `parse`/`label`, which this supplies. */
export type YamlTreeOptions = Omit<JsonTreeOptions, 'parse' | 'label'>

export function makeYamlTreeRenderer(opts: YamlTreeOptions = {}) {
  return makeJsonTreeRenderer({ ...opts, parse: parseYaml, label: 'YAML' })
}

export const renderYamlTree = makeYamlTreeRenderer()
