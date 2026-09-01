#!/usr/bin/env node
/** Build the demo's reference PDF and embed it into `paper.ts` as base64.
 *
 *  The `<PdfViewer>` needs a *real* document to be worth looking at, so
 *  this authors a one-page note on the very algorithm the demo's treemap
 *  uses — squarified treemaps — with a figure drawn from a real
 *  `squarify` layout in the same spirit as the live map. Self-referential
 *  on purpose: you browse a PDF, inside a treemap, that explains treemaps.
 *
 *  Committed rather than built in-browser because pdf-lib's `save()` is
 *  async, and the `MockStore` fixture is a plain synchronous object (same
 *  reason `catalog.sqlite` is embedded and not generated at load). Edit
 *  this script and run `node tools/build-paper.mjs` to regenerate. */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PALETTE = ['#b5485f', '#4a86c5', '#5aa469', '#d8a13a', '#8e6fb0', '#5b9aa0']
const INK = '#1b1d22'
const MUTED = '#6b7280'

function hex(h) {
  const n = parseInt(h.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Squarified treemap of `items` into a top-left rect (y grows downward).
 *  A compact take on Bruls/Huizing/van Wijk: fill the shorter side with a
 *  row whose worst aspect ratio is minimized, then recurse on the rest. */
function squarify(items, x, y, w, h) {
  const total = items.reduce((s, it) => s + it.size, 0)
  const scale = (w * h) / total
  const scaled = items.map(it => ({ it, area: it.size * scale }))
  const rects = []
  let ax = x, ay = y, aw = w, ah = h
  const worst = (row, len) => {
    const sum = row.reduce((s, r) => s + r.area, 0)
    const max = Math.max(...row.map(r => r.area))
    const min = Math.min(...row.map(r => r.area))
    return Math.max((len * len * max) / (sum * sum), (sum * sum) / (len * len * min))
  }
  const flush = row => {
    const vertical = aw >= ah        // free rect is wide → stack a column on the left
    const len = vertical ? ah : aw
    const sum = row.reduce((s, r) => s + r.area, 0)
    const thick = sum / len
    let pos = vertical ? ay : ax
    for (const r of row) {
      const run = r.area / thick
      if (vertical) rects.push({ ...r.it, x: ax, y: pos, w: thick, h: run })
      else rects.push({ ...r.it, x: pos, y: ay, w: run, h: thick })
      pos += run
    }
    if (vertical) { ax += thick; aw -= thick }
    else { ay += thick; ah -= thick }
  }
  let row = []
  for (const s of scaled) {
    const len = Math.min(aw, ah)
    if (row.length && worst(row, len) < worst([...row, s], len)) {
      flush(row)
      row = []
    }
    row.push(s)
  }
  if (row.length) flush(row)
  return rects
}

function wrap(text, font, size, maxW) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    const trial = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(trial, size) > maxW) {
      lines.push(line)
      line = word
    } else line = trial
  }
  if (line) lines.push(line)
  return lines
}

const doc = await PDFDocument.create()
doc.setTitle('Squarified Treemaps')
doc.setAuthor('@rdub/file-tree')
doc.setSubject('A reference document for the file-tree PDF viewer')
const page = doc.addPage([612, 792])
const { width: W, height: H } = page.getSize()
const sans = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)
const mono = await doc.embedFont(StandardFonts.Courier)

const M = 56
const contentW = W - 2 * M

// Top accent bar, from the treemap palette.
page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: hex(PALETTE[0]) })

// Title + subtitle.
page.drawText('Squarified Treemaps', { x: M, y: H - 70, size: 30, font: bold, color: hex(INK) })
page.drawText('a reference document for the @rdub/file-tree PDF viewer', {
  x: M, y: H - 92, size: 12, font: sans, color: hex(MUTED),
})

// Body paragraphs.
const paras = [
  'A treemap turns a hierarchy into nested rectangles, each sized by a value — here, ' +
    'bytes on disk. The whole directory fills the frame, and every child is a sub-rectangle ' +
    'whose area is its share of the parent, so the biggest files are simply the biggest tiles.',
  'The naive "slice-and-dice" layout alternates split direction at each level, which strands ' +
    'small items in long, thin slivers that are impossible to read or label. Squarification ' +
    'instead packs children a row at a time, choosing each split to keep every rectangle’s ' +
    'aspect ratio as close to square as it can.',
  'The map you are reading this PDF inside of runs exactly that algorithm: squarify() lays out ' +
    'each level, and squarifyRemainder() hands a dominant child’s long tail its own legible ' +
    'band instead of slivers. The figure below is a real squarify() layout of a small directory.',
]
let cy = H - 130
const bodySize = 11
const leading = 16
for (const p of paras) {
  for (const line of wrap(p, sans, bodySize, contentW)) {
    page.drawText(line, { x: M, y: cy, size: bodySize, font: sans, color: hex(INK) })
    cy -= leading
  }
  cy -= 8
}

// Figure caption + the squarified directory.
const figTop = cy - 6
page.drawText('A directory, squarified — larger files take larger tiles:', {
  x: M, y: figTop, size: 10, font: sans, color: hex(MUTED),
})
const figY0 = M + 34            // bottom of the figure (pdf coords)
const figY1 = figTop - 12       // top of the figure
const figH = figY1 - figY0
const dir = [
  { name: 'samples', size: 44 },
  { name: 'data', size: 20 },
  { name: 'docs', size: 14 },
  { name: 'logs', size: 9 },
  { name: 'config', size: 7 },
  { name: 'README', size: 6 },
]
// Lay out in top-left coords, then flip y for pdf-lib's bottom-left origin.
for (const [i, r] of squarify(dir, 0, 0, contentW, figH).entries()) {
  const px = M + r.x
  const py = figY1 - r.y - r.h
  page.drawRectangle({ x: px, y: py, width: r.w, height: r.h, color: hex(PALETTE[i % PALETTE.length]), borderColor: hex('#ffffff'), borderWidth: 2 })
  if (r.w > 60 && r.h > 26) {
    page.drawText(r.name, { x: px + 8, y: py + r.h - 20, size: 12, font: bold, color: hex('#ffffff') })
    page.drawText(`${r.size} KB`, { x: px + 8, y: py + r.h - 36, size: 9, font: mono, color: rgb(1, 1, 1) })
  }
}

// Reference + footer wordmark.
page.drawText('Reference: M. Bruls, K. Huizing, J. J. van Wijk. "Squarified Treemaps."', {
  x: M, y: M + 6, size: 9, font: sans, color: hex(MUTED),
})
page.drawText('Proc. Joint Eurographics/IEEE TCVG Symp. on Visualization, 2000.', {
  x: M, y: M - 6, size: 9, font: sans, color: hex(MUTED),
})
page.drawText('@rdub/file-tree', { x: W - M - mono.widthOfTextAtSize('@rdub/file-tree', 9), y: M - 6, size: 9, font: mono, color: hex(MUTED) })

const bytes = await doc.save()
const b64 = Buffer.from(bytes).toString('base64')
const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../src/fixtures')
const chunks = b64.match(/.{1,100}/g) ?? []
writeFileSync(join(outDir, 'paper.ts'), `/** The \`/mock\` demo's reference PDF, base64-encoded.
 *
 *  Generated — edit \`tools/build-paper.mjs\` and run
 *  \`node tools/build-paper.mjs\`. A one-page note on squarified treemaps,
 *  authored so the \`<PdfViewer>\` has real, on-theme content to render
 *  (${(b64.length / 1024).toFixed(0)} KiB of base64 for a ${(bytes.byteLength / 1024).toFixed(0)} KiB PDF). */
const BASE64 = [
${chunks.map(l => `  '${l}',`).join('\n')}
].join('')

export const TREEMAPS_PDF: Uint8Array = Uint8Array.from(
  atob(BASE64), c => c.charCodeAt(0))

/** Content hash of the bytes, mirroring \`CATALOG_VERSION\`. */
export const TREEMAPS_PDF_VERSION = '${version}'
`)
console.log(`paper.ts: ${(b64.length / 1024).toFixed(1)} KiB base64 (${(bytes.byteLength / 1024).toFixed(1)} KiB PDF)`)
