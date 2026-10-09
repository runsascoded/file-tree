/** The boxed README rendered below a directory or archive listing. */
import type { MarkdownRenderer } from './FileTree'
import type { MarkdownCtx } from './markdownLinks'
import { basename } from './parsePath'
import { readmeFormat } from './readme'

export interface ReadmePanelProps {
  /** Key (or archive member path) of the README; labels the box. */
  name: string
  text: string
  /** Renders `.md` / `.markdown` READMEs; others (and markdown, when
   *  omitted) render as preformatted text. */
  markdownRenderer?: MarkdownRenderer
  ctx: MarkdownCtx
}

export function ReadmePanel({ name, text, markdownRenderer, ctx }: ReadmePanelProps) {
  const md = readmeFormat(name) === 'markdown' && markdownRenderer
  return (
    <div
      className="rdub-file-tree-default-readme"
      data-readme-key={name}
      style={{
        marginTop: '1.5em',
        padding: '0.8em 1em',
        border: '1px solid rgba(127,127,127,0.25)',
        borderRadius: 6,
        background: 'rgba(127,127,127,0.04)',
      }}
    >
      <div style={{ fontSize: '0.8em', opacity: 0.6, fontFamily: 'ui-monospace, monospace', marginBottom: '0.5em' }}>
        {basename(name)}
      </div>
      {md
        ? markdownRenderer(text, ctx)
        : <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{text}</pre>}
    </div>
  )
}
