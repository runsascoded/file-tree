import * as react_jsx_runtime from 'react/jsx-runtime';
import { M as MarkdownCtx } from '../markdownLinks-CyvzSz5A.js';
import 'react';
import '../index.js';

/** With `ctx` (passed by `<FileTree>`), relative links resolve against the
 *  file's place in the tree and navigate in-app on a plain click (keeping a
 *  real `href`, so cmd-click / middle-click / copy-link still work), and
 *  relative images load from the store. Without it, links render as written. */
declare function renderMarkdown(source: string, ctx?: MarkdownCtx): react_jsx_runtime.JSX.Element;

export { renderMarkdown };
