/** Markdown renderer. Plug into `<FileTree markdownRenderer={renderMarkdown}>`.
 *  Requires optional peers `react-markdown` + `remark-gfm`.
 *
 *  The peer ranges are deliberately wide (`react-markdown` ^7–^10). All
 *  this uses is the default export with `remarkPlugins`, `components`
 *  overrides for `a`/`img`, and a string child, which are unchanged across
 *  every one of those majors — so narrowing to the newest would break
 *  consumers pinned to an older one for no benefit we'd get back. ctbk hit
 *  exactly that on a repin. */
import type { MouseEvent as ReactMouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MarkdownCtx } from '../react/markdownLinks'
import { isPlainClick } from '../react/markdownLinks'

/** With `ctx` (passed by `<FileTree>`), relative links resolve against the
 *  file's place in the tree and navigate in-app on a plain click (keeping a
 *  real `href`, so cmd-click / middle-click / copy-link still work), and
 *  relative images load from the store. Without it, links render as written. */
export function renderMarkdown(source: string, ctx?: MarkdownCtx) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        {...(ctx ? {
          components: {
            a: ({ node: _node, href, ...props }) => {
              if (href === undefined) return <a {...props} />
              const { href: to, internal } = ctx.resolveHref(href)
              const onClick = internal
                ? (e: ReactMouseEvent<HTMLAnchorElement>) => { if (isPlainClick(e)) { e.preventDefault(); ctx.navigate(to) } }
                : undefined
              return <a {...props} href={to} {...(onClick ? { onClick } : {})} />
            },
            img: ({ node: _node, src, ...props }) => <img {...props} {...(typeof src === 'string' ? { src: ctx.resolveSrc(src) } : {})} />,
          },
        } : {})}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
