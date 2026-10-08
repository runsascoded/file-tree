/** Views that render bytes the real store doesn't hold as an object — a
 *  decompressed `foo.csv.gz`, a tarball member — by wrapping them in a
 *  one-file {@link bytesStore} and handing that to whatever viewer the
 *  inner name dispatches to (`render`). */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Store } from '../types'
import { bytesStore } from './bytesStore'
import { decompress, MAX_COMPRESSED_BYTES } from './decompress'
import { fmtSize } from './fmt'
import type { Codec } from './parsePath'
import { readTar, tarEntryBytes } from './tar'

/** `compressed`: the object's size before decompression, when there was one. */
type Loaded = { bytes: Uint8Array; truncated: boolean; compressed?: number }

function useLoaded(load: () => Promise<Loaded>, deps: unknown[]) {
  const [state, setState] = useState<{ loaded?: Loaded; error?: string }>({})
  useEffect(() => {
    let cancelled = false
    setState({})
    load()
      .then(loaded => { if (!cancelled) setState({ loaded }) })
      .catch(e => { if (!cancelled) setState({ error: String(e) }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function Note({ children }: { children: ReactNode }) {
  return <div style={{ opacity: 0.7, fontSize: '0.85em', margin: '0 0 0.5em' }}>{children}</div>
}

function Virtual({ vkey, state, label, render }: {
  vkey: string
  state: { loaded?: Loaded; error?: string }
  label: (l: Loaded) => ReactNode
  render: (store: Store, key: string) => ReactNode
}) {
  const { loaded, error } = state
  const store = useMemo(
    () => loaded ? bytesStore(vkey, async () => loaded.bytes) : null,
    [vkey, loaded])
  if (error) return <div style={{ color: 'salmon' }}>error: {error}</div>
  if (!loaded || !store) return <div style={{ opacity: 0.6 }}>reading {vkey}…</div>
  return (
    <>
      <Note>{label(loaded)}</Note>
      {render(store, vkey)}
    </>
  )
}

/** `foo.jsonl.gz` → the JSONL viewer over the decompressed bytes. */
export function CompressedView({ store, path, codec, inner, render }: {
  store: Store
  path: string
  codec: Codec
  /** `path` minus the codec extension; the virtual file's key. */
  inner: string
  render: (store: Store, key: string) => ReactNode
}) {
  const state = useLoaded(async () => {
    const r = await store.get(path, store.capabilities?.range ? { offset: 0, length: MAX_COMPRESSED_BYTES } : undefined)
    const raw = r.bytes.byteLength > MAX_COMPRESSED_BYTES ? r.bytes.subarray(0, MAX_COMPRESSED_BYTES) : r.bytes
    const compressed = r.totalSize ?? r.bytes.byteLength
    const d = await decompress(raw, codec, { inputTruncated: compressed > raw.byteLength })
    return { ...d, compressed }
  }, [store, path, codec])
  return (
    <Virtual
      vkey={inner}
      state={state}
      render={render}
      label={l => (
        <span data-testid="decompressed-note">
          {codec}: {fmtSize(l.compressed)} → {fmtSize(l.bytes.byteLength)}
          {l.truncated && <b> (truncated: showing the first {fmtSize(l.bytes.byteLength)})</b>}
        </span>
      )}
    />
  )
}

/** One member of a tarball, rendered by its own name's viewer. */
export function TarMember({ store, path, entry, codec, render }: {
  store: Store
  path: string
  entry: string
  codec?: Codec
  render: (store: Store, key: string) => ReactNode
}) {
  const state = useLoaded(async () => {
    const archive = await readTar(store, path, codec)
    const e = archive.entries.find(x => x.name === entry)
    if (!e) throw new Error(`tar: no member ${entry} in ${path}`)
    const bytes = tarEntryBytes(archive, e)
    return { bytes, truncated: bytes.byteLength < e.size }
  }, [store, path, entry, codec])
  return (
    <Virtual
      vkey={`${path}!/${entry}`}
      state={state}
      render={render}
      label={l => (
        <span data-testid="tar-member-note">
          member of <code>{path}</code> · {fmtSize(l.bytes.byteLength)}
          {l.truncated && <b> (truncated: the archive read stopped partway through this member)</b>}
        </span>
      )}
    />
  )
}
