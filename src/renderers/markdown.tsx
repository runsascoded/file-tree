/** Markdown renderer. Plug into `<FileTree markdownRenderer={renderMarkdown}>`.
 *  Requires optional peers `react-markdown` + `remark-gfm`. */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function renderMarkdown(source: string) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
