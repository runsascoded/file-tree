/** `<BucketBrowser>` — per-bucket page. Reads the slug from the URL,
 *  looks up the matching entry in `<seeds> ∪ <LS>`, constructs a
 *  `Store` via the supplied factory, and mounts `<FileTree>` at
 *  `<routeBase>/<slug>`.
 *
 *  If the slug isn't found (LS cleared on another device, etc.) it
 *  shows a "bucket not configured" message linking back to the list. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FileTree } from '@rdub/file-tree/react'
import type { Store } from '@rdub/file-tree'
import { renderMarkdown } from '@rdub/file-tree/renderers/markdown'
import { ParquetViewer } from '@rdub/file-tree/renderers/parquet'
import { renderJsonTree } from '@rdub/file-tree/renderers/json'
import { CsvViewer } from '@rdub/file-tree/renderers/csv'
import { NotebookViewer } from '@rdub/file-tree/renderers/notebook'
import { renderCode } from '@rdub/file-tree/renderers/code'
import { useUrlPersistedState } from '@rdub/file-tree/url-state'
import { renderViewerActions } from '../viewerActions'
import type { BucketEntry } from './BucketsPage'

export interface BucketBrowserProps {
  /** Hardcoded seed entries (must match what `BucketsPage` uses). */
  seeds: BucketEntry[]
  /** LocalStorage key for user-added entries. */
  lsKey: string
  /** Route base, e.g. `/s3`. The `<FileTree routeBase>` will be
   *  `<routeBase>/<slug>`. */
  routeBase: string
  /** Factory: given an entry, build a Store. */
  buildStore: (entry: BucketEntry) => Store
}

function loadFromLS(key: string): BucketEntry[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function BucketBrowser({ seeds, lsKey, routeBase, buildStore }: BucketBrowserProps) {
  const params = useParams<{ slug?: string }>()
  const slug = params.slug ? decodeURIComponent(params.slug) : undefined
  const [added, setAdded] = useState<BucketEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setAdded(loadFromLS(lsKey))
    setHydrated(true)
  }, [lsKey])

  const entry = useMemo(
    () => [...seeds, ...added].find(e => e.bucket === slug),
    [seeds, added, slug],
  )

  const store = useMemo(() => (entry ? buildStore(entry) : null), [entry, buildStore])

  if (!hydrated) return null

  if (!slug) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
        <p>No bucket selected. <Link to={routeBase}>← back to list</Link></p>
      </div>
    )
  }

  if (!entry || !store) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
        <p>
          Bucket <code>{slug}</code> isn't configured.{' '}
          <Link to={routeBase}>← back to list</Link> to add it.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5em' }}>
      <p style={{ fontSize: '0.9em', marginTop: 0 }}>
        <Link to={routeBase}>← all buckets</Link>
      </p>
      <FileTree
        store={store}
        routeBase={`${routeBase}/${encodeURIComponent(slug)}`}
        title={entry.label ?? entry.bucket}
        markdownRenderer={renderMarkdown}
        parquetRenderer={ParquetViewer}
        jsonRenderer={renderJsonTree}
        csvRenderer={CsvViewer}
        notebookRenderer={NotebookViewer}
        codeRenderer={renderCode}
        viewerActions={renderViewerActions}
        usePersistedState={useUrlPersistedState}
      />
    </div>
  )
}
