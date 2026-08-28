/** Markdown renderer. Plug into `<FileTree markdownRenderer={renderMarkdown}>`.
 *  Requires optional peers `react-markdown` + `remark-gfm`.
 *
 *  The peer ranges are deliberately wide (`react-markdown` ^7–^10). All
 *  this uses is the default export with `remarkPlugins` and a string
 *  child, which is unchanged across every one of those majors — so
 *  narrowing to the newest would break consumers pinned to an older one
 *  for no benefit we'd get back. ctbk hit exactly that on a repin. */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function renderMarkdown(source: string) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
