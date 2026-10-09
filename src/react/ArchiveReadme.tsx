/** An archive listing's README (see `pickArchiveReadme`), read out of the
 *  archive and rendered below the member table. Relative links resolve to
 *  sibling members (`<archive>!/<member>`); relative images are left as
 *  written, since a member has no URL of its own. */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Store } from '../types'
import type { MarkdownRenderer } from './FileTree'
import { markdownCtx } from './markdownLinks'
import { pickArchiveReadme } from './readme'
import { ReadmePanel } from './ReadmePanel'

/** READMEs past this are cut (the panel is a preview, not a viewer). */
export const ARCHIVE_README_MAX_BYTES = 1 << 20

export interface ArchiveReadmeProps {
  store: Store
  /** Store key of the archive. */
  path: string
  /** Member names (file members; directory names end in `/`). */
  names: readonly string[]
  /** A member's bytes. */
  load: (name: string) => Promise<Uint8Array>
  markdownRenderer: MarkdownRenderer
  routeBase: string
  rootPrefix?: string
}

export function ArchiveReadme({ store, path, names, load, markdownRenderer, routeBase, rootPrefix = '' }: ArchiveReadmeProps) {
  const navigate = useNavigate()
  const name = useMemo(() => pickArchiveReadme(names), [names])
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    setText(null)
    if (!name) return
    let cancelled = false
    load(name).then(b => {
      if (!cancelled) setText(new TextDecoder().decode(b.subarray(0, ARCHIVE_README_MAX_BYTES)))
    }).catch(() => { /* swallow — README is best-effort */ })
    return () => { cancelled = true }
  }, [name, load])
  if (!name || text == null) return null
  const ctx = { ...markdownCtx(`${path}!/${name}`, { store, routeBase, rootPrefix, navigate }), resolveSrc: (src: string) => src }
  return <ReadmePanel name={name} text={text} markdownRenderer={markdownRenderer} ctx={ctx} />
}
