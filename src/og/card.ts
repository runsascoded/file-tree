/** Open Graph card renderer — a share image for any path in a tree.
 *
 *  Two layers, split by purity:
 *   - `renderOgCard(data)` — pure `OgCardData → SVG` string. No `Store`,
 *     no network, no React, no DOM; runs in a Worker and is tested by
 *     asserting SVG structure. A *file* card is breadcrumb + name + size
 *     + type badge; a *dir* card draws its children as a treemap via
 *     `@rdub/treemap`'s pure `squarify` + `DEFAULT_PALETTE`, so the
 *     share image and the interactive view read the same.
 *   - `ogCardData({ store, treeSource?, splat })` — the impure resolver
 *     that fills `OgCardData` from a `Store` (+ optional `TreeSource`).
 *     Degrades: no `treeSource`, or a `TreeTooLargeError`, → a plain dir
 *     card (no treemap), never a throw.
 *
 *  The edge (the demo's Worker, `site/worker/src/og.ts`) resolves data,
 *  renders SVG, and rasterizes to PNG with `@resvg/resvg-wasm`;
 *  unfurlers want PNG at 1200×630. `@rdub/treemap` is an optional peer here, imported
 *  statically and marked `external`, exactly as `renderers/treemap` does.
 *  See `specs/done/cfw-og-images.md`.
 */
import { squarifyRemainder, DEFAULT_PALETTE } from '@rdub/treemap'
import type { Store } from '../types'
import { fmtSize } from '../react/fmt'
import { basename, keyToSplat, parsePath, extOf, type ParsePathOptions } from '../react/parsePath'
import type { TreeSource } from '../renderers/treeSource'

/** The standard Open Graph image box. */
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

/** One child tile of a directory treemap card. */
export interface OgTreemapChild { name: string; size: number }

/** Everything `renderOgCard` needs, already resolved. */
export interface OgCardData {
  /** Ancestor segments from the root, excluding the leaf itself. */
  crumbs: readonly string[]
  /** Leaf name (the file, the directory, or the store label at root). */
  name: string
  kind: 'file' | 'dir'
  /** Bytes; a dir's is its recursive total. `null`/absent when unknown. */
  size?: number | null
  /** Store label for the header (e.g. `mock://demo-bucket`). */
  storeLabel?: string
  /** Right-aligned meta badge — an extension, `N items`, a mime, etc. */
  badge?: string
  /** For a dir: children to draw as a treemap. Omit for a plain card. */
  treemap?: readonly OgTreemapChild[]
}

export interface OgCardOptions {
  /** Wordmark in the footer. Default `@rdub/file-tree`. */
  brand?: string
  /** Background / ink / muted colors. Defaults are a dark card. */
  background?: string
  ink?: string
  muted?: string
  /** Palette for treemap tiles. Default `@rdub/treemap`'s. */
  palette?: readonly string[]
  /** Font families to put first in the sans / monospace stacks. A
   *  rasterizer with bundled fonts (resvg in a Worker) should name them
   *  here: resvg-wasm doesn't map the generic `monospace` to its
   *  configured family, so without a concrete name mono text falls back
   *  to the default (sans) font. */
  sansFont?: string
  monoFont?: string
}

const DEFAULTS = {
  brand: '@rdub/file-tree',
  background: '#0e0f13',
  ink: '#f4f4f5',
  muted: '#9aa0aa',
} as const

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const SANS_STACK = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

function esc(s: string): string {
  return s.replace(/[<>&"']/g, c => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;'
  ))
}

/** Truncate to `n` chars with a middle ellipsis (keeps the tail — a
 *  path's most specific part — visible). */
function clipMiddle(s: string, n: number): string {
  if (s.length <= n) return s
  const head = Math.ceil((n - 1) / 2)
  const tail = Math.floor((n - 1) / 2)
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`
}

/** Render `OgCardData` to a 1200×630 SVG string. Pure. */
export function renderOgCard(data: OgCardData, opts: OgCardOptions = {}): string {
  const o = { ...DEFAULTS, ...opts }
  const palette = opts.palette ?? DEFAULT_PALETTE
  const W = OG_WIDTH, H = OG_HEIGHT
  const pad = 60
  const SANS = opts.sansFont ? `'${esc(opts.sansFont)}', ${SANS_STACK}` : SANS_STACK
  const MONO = opts.monoFont ? `'${esc(opts.monoFont)}', ${MONO_STACK}` : MONO_STACK

  // At a store's root the title already *is* the store label; don't
  // repeat it as the header.
  const atRoot = data.crumbs.length === 0 && data.name === data.storeLabel
  const header = atRoot ? '' : [data.storeLabel, ...data.crumbs].filter(Boolean).join(' / ')
  const title = clipMiddle(data.name || 'root', 34)
  const sizeStr = data.size == null ? '' : fmtSize(data.size)
  const meta = [sizeStr, data.badge].filter(Boolean).join('  ·  ')

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  parts.push(`<rect width="${W}" height="${H}" fill="${o.background}"/>`)
  // Top accent — a thin band from the palette, so the brand carries color.
  parts.push(`<rect x="0" y="0" width="${W}" height="8" fill="${palette[0]}"/>`)

  // Header (store + breadcrumb), monospace, muted.
  if (header) {
    parts.push(`<text x="${pad}" y="96" font-family="${MONO}" font-size="30" fill="${o.muted}">${esc(clipMiddle(header, 64))}</text>`)
  }
  // Title.
  const iconGap = 0
  parts.push(`<text x="${pad + iconGap}" y="176" font-family="${SANS}" font-size="76" font-weight="700" fill="${o.ink}">${esc(title)}</text>`)
  // Meta line (size · badge).
  if (meta) {
    parts.push(`<text x="${pad}" y="228" font-family="${MONO}" font-size="34" fill="${o.muted}">${esc(meta)}</text>`)
  }

  // Body: dir treemap, or a minimal file/plain-dir card.
  const bodyY = 268
  const bodyH = H - bodyY - 92
  const bodyW = W - pad * 2
  if (data.kind === 'dir' && data.treemap && data.treemap.length > 0) {
    parts.push(renderTreemapBody(data.treemap, pad, bodyY, bodyW, bodyH, palette, o.ink, MONO))
  } else {
    // A big type mark — the path leaf's extension for a file, a folder
    // for a dir. The folder is a `<path>`, not an emoji: a rasterizer
    // with only a text font bundled (resvg in a Worker) has no emoji
    // glyphs, and would draw a blank or a `.notdef` box.
    parts.push(`<rect x="${pad}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="16" fill="#ffffff" fill-opacity="0.04"/>`)
    if (data.kind === 'dir') {
      parts.push(folderMark(W / 2, bodyY + bodyH / 2, o.muted))
    } else {
      const glyph = `.${data.badge || 'file'}`
      parts.push(`<text x="${W / 2}" y="${bodyY + bodyH / 2 + 24}" text-anchor="middle" font-family="${MONO}" font-size="72" fill="${o.muted}">${esc(clipMiddle(glyph, 28))}</text>`)
    }
  }

  // Footer wordmark.
  parts.push(`<text x="${W - pad}" y="${H - 40}" text-anchor="end" font-family="${MONO}" font-size="28" fill="${o.muted}">${esc(o.brand)}</text>`)
  parts.push(`</svg>`)
  return parts.join('')
}

/** A 140×110 folder silhouette (tab + body, rounded) centered on
 *  `(cx, cy)`. */
function folderMark(cx: number, cy: number, fill: string): string {
  const x = cx - 70, y = cy - 55
  const d = `M${x} ${y + 12}q0-12 12-12h40l14 16h62q12 0 12 12v70q0 12-12 12h-116q-12 0-12-12z`
  return `<path d="${d}" fill="${fill}" fill-opacity="0.6"/>`
}

/** The squarified-rects body for a directory card. */
function renderTreemapBody(
  children: readonly OgTreemapChild[],
  x: number,
  y: number,
  w: number,
  h: number,
  palette: readonly string[],
  ink: string,
  mono: string,
): string {
  // `squarifyRemainder` gives a dominant-child tree's long tail its own
  // legible 2D band instead of unreadable slivers; it falls back to a
  // plain squarify when nothing is cramped, so it's safe unconditionally.
  // The card body is short and wide (~1080×270), so a "sliver" here is a
  // column tens of px wide — raise `minSide` past that so the tail is
  // detected, and give the band ~a quarter of the width so it reads.
  const rects = squarifyRemainder([...children], x, y, w, h, c => c.size, 48, 0.24)
  const out: string[] = []
  rects.forEach((r, i) => {
    const fill = palette[i % palette.length]
    out.push(`<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="${fill}" stroke="#0e0f13" stroke-width="3"/>`)
    // Label only where it fits — same "no text on slivers" discipline as
    // the interactive map.
    if (r.w > 96 && r.h > 40) {
      const lx = r.x + 12
      const ly = r.y + 34
      // A 24px monospace glyph advances ~0.6em ≈ 14.5px; clip to what
      // fits inside the tile's side padding.
      out.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="${mono}" font-size="24" font-weight="600" fill="${ink}">${esc(clipMiddle(r.it.name, Math.max(4, Math.floor((r.w - 16) / 14.5))))}</text>`)
      if (r.h > 70) {
        out.push(`<text x="${lx.toFixed(1)}" y="${(ly + 30).toFixed(1)}" font-family="${mono}" font-size="22" fill="${ink}" fill-opacity="0.85">${esc(fmtSize(r.it.size))}</text>`)
      }
    }
  })
  return out.join('')
}

export interface OgCardDataOptions {
  store: Store
  /** URL splat identifying the path, as `<FileTree>` parses it. */
  splat: string
  /** Recursive-size source; when present a dir card gets a treemap. */
  treeSource?: TreeSource
  /** Matches `<FileTree rootPrefix>` so paths line up. */
  rootPrefix?: string
  /** Forwarded to `parsePath` (extra text extensions). */
  parseOptions?: ParsePathOptions
  /** Cap the treemap to the N largest children (keeps the card legible
   *  and the SVG small). Default 40. */
  maxTiles?: number
}

/** Resolve `OgCardData` from a `Store` (+ optional `TreeSource`). Impure;
 *  degrades to a plain card on any tree failure. */
export async function ogCardData(opts: OgCardDataOptions): Promise<OgCardData> {
  const { store, splat, treeSource, rootPrefix = '', parseOptions, maxTiles = 40 } = opts
  const parsed = parsePath(splat, { rootPrefix, ...parseOptions })
  const storeLabel = store.describe?.()
  const key = parsed.kind === 'dir' ? parsed.prefix : parsed.path
  const treePath = keyToSplat(key, rootPrefix).replace(/^\/+|\/+$/g, '')
  const segs = treePath ? treePath.split('/') : []
  const name = segs.length ? segs[segs.length - 1] : (storeLabel ?? 'root')
  const crumbs = segs.slice(0, -1)

  if (parsed.kind === 'dir') {
    if (treeSource) {
      try {
        const level = await treeSource.children({ path: treePath })
        const kids = level.children
          .filter(c => (c.size ?? 0) > 0)
          .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
          .slice(0, maxTiles)
          .map(c => ({ name: c.name, size: c.size ?? 0 }))
        return {
          crumbs, name: name === '' ? (storeLabel ?? 'root') : name, kind: 'dir',
          size: level.node.size, storeLabel,
          badge: `${level.node.nChildren ?? level.children.length} items`,
          ...(kids.length ? { treemap: kids } : {}),
        }
      } catch {
        // fall through to a plain dir card
      }
    }
    return { crumbs, name: name === '' ? (storeLabel ?? 'root') : name, kind: 'dir', storeLabel }
  }

  // A file: its size comes from the parent listing.
  const ext = extOf(parsed.path)
  let size: number | null = null
  try {
    const parentKey = parsed.path.includes('/') ? parsed.path.replace(/[^/]+$/, '') : ''
    const leaf = basename(parsed.path)
    const { entries } = await store.list(parentKey)
    size = entries.find(e => !e.isDir && basename(e.key) === leaf)?.size ?? null
  } catch {
    size = null
  }
  return {
    crumbs, name: basename(parsed.path), kind: 'file',
    size, storeLabel, ...(ext ? { badge: ext } : {}),
  }
}
