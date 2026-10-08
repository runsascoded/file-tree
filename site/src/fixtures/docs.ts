/** The project's own docs as a `MockStore` fixture: `README.md` plus
 *  `docs/*.md`, read from the repo at build time. The landing page browses
 *  them with `<FileTree>` itself, so relative links between them (README →
 *  `docs/tables.md`) navigate in-app, and GitHub renders the same files. */
import readme from '../../../README.md?raw'

const pages = import.meta.glob<string>('../../../docs/*.md', { query: '?raw', import: 'default', eager: true })

export const DOCS_FIXTURE: Record<string, string> = {
  'README.md': readme,
  ...Object.fromEntries(Object.entries(pages).map(([path, src]) => [path.replace(/^(\.\.\/)+/, ''), src])),
}
