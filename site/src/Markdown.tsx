/** Markdown renderer for the demo site. Plugged into `<FileTree
 *  markdownRenderer={renderMarkdown}>` so `.md` files render as rich
 *  markdown and any `README.md` shows below its dir listing.
 *
 *  Lives in the site (not the lib) so the lib's bundle stays free of
 *  `react-markdown`/`remark-gfm`; consumers wire whichever renderer
 *  they prefer (or none). */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function renderMarkdown(source: string) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
