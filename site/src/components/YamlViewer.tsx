/** YAML through the JSON tree, registered as a viewer so neither the
 *  YAML parser nor this module lands in the main bundle.
 *
 *  `renderYamlTree` takes `(source, usePersistedState?)` — the shape
 *  `<FileTree jsonRenderer>` wants — but a registry viewer is handed
 *  `{ store, path }`, so this reads the file and hands over the text.
 *  The read is the same one `<TextViewer>` would have done. */
import { useEffect, useState } from 'react'
import type { Store } from '@rdub/file-tree'
import type { PersistedState } from '@rdub/file-tree/react'
import { renderYamlTree } from '@rdub/file-tree/renderers/yaml'

export default function YamlViewer({ store, path, usePersistedState }: {
  store: Store; path: string; usePersistedState?: PersistedState
}) {
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSource(null); setError(null)
    store.get(path)
      .then(r => { if (!cancelled) setSource(new TextDecoder().decode(r.bytes)) })
      .catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [store, path])

  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (source === null) return <div style={{ opacity: 0.6 }}>reading…</div>
  return <>{renderYamlTree(source, usePersistedState)}</>
}
