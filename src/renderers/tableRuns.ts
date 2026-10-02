/** Runs and path elision for the table viewers: the pure half.
 *
 *  A table of actions or staged prefixes comes in long runs — one batch
 *  shares an actor, a timestamp, an owner, a note — and consecutive paths
 *  share most of their prefix. This module finds those runs and shared
 *  prefixes on a rendered page; `tableBody.tsx` draws them.
 *
 *  Everything here is computed per page, on display order (after
 *  sort/filter), and is pure, so it can be tested as plain data.
 *
 *  See `specs/done/table-runs-and-path-elision.md`. */
import type { ReactNode } from 'react'
import { compareValues } from './tableSort'
import type { RunRenderer, TableColumn } from './table'

/** How a run of equal values in a column is drawn:
 *  - `'mark'`: every cell after the first renders `〃` (value on its title).
 *  - `'sticky'`: the run's cells merge into one, whose value floats at the
 *    top of the run's visible part as the table scrolls.
 *  - `'line'`: the first cell shows the value; a thin rule runs down through
 *    the rest and ends with a tick on the run's last row.
 *  - `'arrow'`: `'line'`, ending in an arrowhead instead of a tick.
 *  - `'none'`: runs are computed (see `TableCellCtx.run`) but not drawn — a
 *    `renderCell` draws its own treatment. */
export type RunMode = 'mark' | 'sticky' | 'line' | 'arrow' | 'none'

export interface RunSpec {
  /** A built-in renderer. Default `'sticky'` (ignored with `render`). */
  mode?: RunMode
  /** Draw the run's merged cell yourself, instead of a built-in `mode`. */
  render?: RunRenderer
  /** Built-ins: the value floats at the top of the run's visible part as the
   *  table scrolls. Default `true`. */
  float?: boolean
  /** `'arrow'`: an arrowhead every this many rows, besides the last. Default
   *  5; `0` for the last only. */
  every?: number
  /** Key a run on this instead of the raw value: e.g. a relative-time
   *  bucket ("5w ago"), so rows a second apart don't break the run. A
   *  `null`/`undefined` key, like an empty value, is never part of a run. */
  key?: (value: unknown, row: Record<string, unknown>) => unknown
  /** Shortest run to collapse. Default 2. */
  min?: number
}

/** The viewers' `ditto` option: a list of columns (each `'mark'`), or a
 *  mode / {@link RunSpec} per column. */
export type DittoOption = readonly string[] | Readonly<Record<string, RunMode | RunSpec>>

export interface ResolvedRunSpec {
  mode: RunMode
  render?: RunRenderer
  float: boolean
  every: number
  key?: (value: unknown, row: Record<string, unknown>) => unknown
  min: number
}

/** A cell's place in a run of equal values, on the current page. */
export interface TableRun {
  /** First cell of the run. */
  start: boolean
  /** Last cell of the run. */
  end: boolean
  /** Cells in the run. */
  length: number
  /** This cell's position in the run, from 0. */
  index: number
}

/** How a column of `/`-separated paths is drawn:
 *  - `'dim'`: the whole segments shared with the row above render dimmed.
 *  - `'tree'`: consecutive rows with the same parent are grouped under a
 *    parent row showing that parent once; the rows show only their tail.
 *    Only when the page is sorted by the column; otherwise `'dim'`. */
export type PathMode = 'dim' | 'tree'

/** The viewers' `paths` option: a list of columns (each `'dim'`), or a mode
 *  per column. */
export type PathsOption = readonly string[] | Readonly<Record<string, PathMode>>

export function normalizeDitto(ditto: DittoOption | undefined): Map<string, ResolvedRunSpec> {
  const out = new Map<string, ResolvedRunSpec>()
  if (!ditto) return out
  if (isList(ditto)) {
    for (const c of ditto) out.set(c, { mode: 'mark', min: 2, float: true, every: 5 })
    return out
  }
  for (const [c, s] of Object.entries(ditto)) {
    const spec: RunSpec = typeof s === 'string' ? { mode: s } : s
    out.set(c, {
      mode: spec.mode ?? 'sticky', min: spec.min ?? 2, float: spec.float ?? true, every: spec.every ?? 5,
      ...(spec.key ? { key: spec.key } : {}), ...(spec.render ? { render: spec.render } : {}),
    })
  }
  return out
}

export function normalizePaths(paths: PathsOption | undefined): Map<string, PathMode> {
  if (!paths) return new Map()
  if (isList(paths)) return new Map(paths.map(c => [c, 'dim']))
  return new Map(Object.entries(paths))
}

function isList<T>(o: readonly string[] | Readonly<Record<string, T>>): o is readonly string[] {
  return Array.isArray(o)
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === ''

/** The value a run is keyed on, or `undefined` when the cell can't be part
 *  of one (an empty value, or a key that maps to `null`/`undefined`). */
export function runKey(spec: Pick<ResolvedRunSpec, 'key'>, value: unknown, row: Record<string, unknown>): unknown {
  if (isEmpty(value)) return undefined
  const k = spec.key ? spec.key(value, row) : value
  return k === null ? undefined : k
}

/** Runs of equal keys in `column`, one entry per row: `undefined` for a row
 *  in no run (its own value, an empty value, or a run shorter than `min`).
 *  Keys compare with `Object.is`. */
export function computeRuns(
  rows: readonly Record<string, unknown>[],
  column: string,
  spec: Pick<RunSpec, 'key' | 'min'>,
): (TableRun | undefined)[] {
  const keys = rows.map(r => runKey(spec, r[column], r))
  const out: (TableRun | undefined)[] = new Array(rows.length).fill(undefined)
  const min = Math.max(2, spec.min ?? 2)
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    if (keys[i] !== undefined) while (j < rows.length && Object.is(keys[j], keys[i])) j++
    const length = j - i
    if (keys[i] !== undefined && length >= min) {
      for (let k = i; k < j; k++) out[k] = { start: k === i, end: k === j - 1, length, index: k - i }
    }
    i = j
  }
  return out
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/** Length of the leading `scheme://` of a path, or 0. A scheme counts as
 *  part of the path's first segment, so `gs://` alone is never "shared". */
export function schemeLength(p: string): number {
  return SCHEME.exec(p)?.[0].length ?? 0
}

/** Length of the prefix `a` shares with `b` in whole `/`-segments: up to
 *  and including the last `/` both have in common, past any scheme. */
export function sharedPathPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let l = 0
  while (l < n && a[l] === b[l]) l++
  if (l === 0) return 0
  const cut = a.lastIndexOf('/', l - 1)
  return cut >= schemeLength(a) ? cut + 1 : 0
}

/** Split a path into its parent (through the last `/`) and its tail. A
 *  trailing `/` (a directory) stays on the tail: `a/b/` → `['a/', 'b/']`.
 *  A path with no parent past its scheme has parent `''`. */
export function splitParent(p: string): [string, string] {
  const body = p.endsWith('/') ? p.slice(0, -1) : p
  const cut = body.lastIndexOf('/')
  if (cut < schemeLength(p)) return ['', p]
  return [p.slice(0, cut + 1), p.slice(cut + 1)]
}

/** Whether `rows` are in order (ascending or descending, per
 *  `compareValues`) by `column` — a page sorted by it, by the viewer or by
 *  nature. */
export function isSortedBy(rows: readonly Record<string, unknown>[], column: string): boolean {
  let asc = true
  let desc = true
  for (let i = 1; i < rows.length && (asc || desc); i++) {
    const c = compareValues(rows[i - 1][column], rows[i][column])
    if (c > 0) asc = false
    if (c < 0) desc = false
  }
  return asc || desc
}

/** A group of consecutive page rows, drawn as a header row (collapsible)
 *  above its rows. Groups nest via `children`. See {@link pathGroups},
 *  {@link runGroups}, or build your own: a viewer's `groups` option is any
 *  {@link GroupRows}. */
export interface RowGroup {
  /** Stable id: collapse state persists by it (hashed, see {@link groupHash}). */
  key: string
  /** Page rows `[start, end)`. */
  start: number
  end: number
  /** The column whose cell holds the header's label. */
  column: string
  /** Header content. */
  label: ReactNode
  /** The header's tooltip. */
  title?: string
  /** For a path group, the full prefix its rows share: rows in the group
   *  show `column`'s value after it (their tail), indented. */
  prefix?: string
  children?: RowGroup[]
}

/** Groups over a page (display order). */
export type GroupRows = (rows: readonly Record<string, unknown>[]) => RowGroup[]

/** A `/`-separated path's next segment after `base` (including its `/`),
 *  or `null` when what remains is a leaf (a name, or a dir's `name/`). A
 *  scheme belongs to the first segment. */
function nextSegment(value: string, base: string): string | null {
  const rem = value.slice(base.length)
  const from = base === '' ? schemeLength(rem) : 0
  const cut = rem.indexOf('/', from)
  return cut === -1 || cut === rem.length - 1 ? null : rem.slice(0, cut + 1)
}

/** A multi-level tree over `column`'s `/`-segments: consecutive rows that
 *  share a segment (at least `min`, default 2) form a group, nested per
 *  segment. A chain of single-child levels compacts into one group
 *  (`gs://bkt/checkpoints/`, not three). Needs the page sorted by `column`
 *  (see {@link isSortedBy}); returns no groups otherwise. */
export function pathGroups(column: string, opts: { min?: number } = {}): GroupRows {
  const min = Math.max(2, opts.min ?? 2)
  return rows => {
    if (!isSortedBy(rows, column)) return []
    const vals = rows.map(r => (typeof r[column] === 'string' ? r[column] as string : ''))
    const build = (lo: number, hi: number, base: string): RowGroup[] => {
      const out: RowGroup[] = []
      let i = lo
      while (i < hi) {
        const seg = vals[i].startsWith(base) ? nextSegment(vals[i], base) : null
        if (seg === null) { i++; continue }
        let j = i + 1
        while (j < hi && vals[j].startsWith(base + seg) && nextSegment(vals[j], base) === seg) j++
        if (j - i >= min) {
          // Compact: extend the prefix while every row shares the next segment.
          let prefix = base + seg
          for (;;) {
            const next = nextSegment(vals[i], prefix)
            if (next === null) break
            let all = true
            for (let k = i + 1; k < j && all; k++) all = nextSegment(vals[k], prefix) === next
            if (!all) break
            prefix += next
          }
          out.push({
            key: `${column}:${prefix}`, start: i, end: j, column,
            label: prefix.slice(base.length), title: prefix, prefix,
            children: build(i, j, prefix),
          })
        }
        i = j
      }
      return out
    }
    return build(0, rows.length, '')
  }
}

/** Runs of equal values (or `key`s) in `column` as groups, labelled with the
 *  value; collapsed, a run is one row. */
export function runGroups(column: string, opts: Pick<RunSpec, 'key' | 'min'> = {}): GroupRows {
  return rows => {
    const runs = computeRuns(rows, column, opts)
    const seen = new Map<string, number>()
    const out: RowGroup[] = []
    runs.forEach((r, i) => {
      if (!r?.start) return
      const k = String(runKey(opts, rows[i][column], rows[i]))
      const n = (seen.get(k) ?? 0) + 1
      seen.set(k, n)
      out.push({ key: `${column}=${k}#${n}`, start: i, end: i + r.length, column, label: k, title: k })
    })
    return out
  }
}

/** A group key's persisted form: 4 base-36 chars (FNV-1a), so a list of
 *  collapsed groups is just their hashes concatenated. */
export function groupHash(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return ((h >>> 0) % 36 ** 4).toString(36).padStart(4, '0')
}

/** Parse a concatenated {@link groupHash} list. */
export function parseFolds(raw: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + 4 <= raw.length; i += 4) out.add(raw.slice(i, i + 4))
  return out
}

/** One row of the rendered body: a data row (`i` indexes the page), or a
 *  group's header row. `depth` is the number of groups enclosing it;
 *  `group` the innermost. */
export type BodyItem =
  | { kind: 'row'; i: number; depth: number; group?: RowGroup }
  | { kind: 'group'; group: RowGroup; depth: number; collapsed: boolean; size: number }

/** The page as the body draws it. */
export interface TableLayout {
  items: BodyItem[]
  /** Per run column, one entry per page row (see {@link computeRuns}),
   *  computed over the *visible* rows (a collapsed group's are skipped). */
  runs: Map<string, (TableRun | undefined)[]>
  specs: Map<string, ResolvedRunSpec>
  /** Per path column, the mode in effect on this page (`'tree'` falls back
   *  to `'dim'` on an unsorted page). */
  paths: Map<string, PathMode>
  /** The column grouping rows into a tree, if any. */
  tree?: string
  /** A note per column whose requested mode isn't in effect, for its
   *  header. */
  notes: Map<string, string>
}

export const TREE_FALLBACK_NOTE = 'Paths group into a tree only when sorted by this column; showing shared prefixes dimmed.'

/** The path mode in effect per `paths` column on a page: `'tree'` needs
 *  the page sorted by its column (else `'dim'`, with a note for the header),
 *  and only one column can group rows — a second `'tree'` column gets
 *  `'dim'`. Cheap (one pass per `'tree'` column), so a viewer can call it
 *  for header notes without memoizing. */
export function pathModes(
  rows: readonly Record<string, unknown>[],
  columns: readonly Pick<TableColumn, 'name'>[],
  paths: PathsOption | undefined,
): Pick<TableLayout, 'paths' | 'tree' | 'notes'> {
  const shown = new Set(columns.map(c => c.name))
  const modes = new Map<string, PathMode>()
  const notes = new Map<string, string>()
  let tree: string | undefined
  for (const [c, mode] of normalizePaths(paths)) {
    if (!shown.has(c)) continue
    if (mode === 'tree' && tree === undefined && isSortedBy(rows, c)) {
      tree = c
      modes.set(c, 'tree')
    } else {
      modes.set(c, 'dim')
      if (mode === 'tree') notes.set(c, TREE_FALLBACK_NOTE)
    }
  }
  return { paths: modes, ...(tree !== undefined ? { tree } : {}), notes }
}

/** Lay out a page: groups (the `groups` option, or `pathGroups` for a
 *  `'tree'` path column) with their header rows, collapsed groups' rows
 *  dropped; then runs for the `ditto` columns over the rows that remain. */
export function tableLayout(
  rows: readonly Record<string, unknown>[],
  columns: readonly Pick<TableColumn, 'name'>[],
  opts: { ditto?: DittoOption; paths?: PathsOption; groups?: GroupRows; folded?: ReadonlySet<string> },
): TableLayout {
  const shown = new Set(columns.map(c => c.name))
  const specs = new Map([...normalizeDitto(opts.ditto)].filter(([c]) => shown.has(c)))
  const pm = pathModes(rows, columns, opts.paths)
  const groupFn = opts.groups ?? (pm.tree !== undefined ? pathGroups(pm.tree) : undefined)
  const groups = groupFn ? groupFn(rows) : []
  const folded = opts.folded ?? new Set<string>()

  const items: BodyItem[] = []
  const walk = (gs: readonly RowGroup[], lo: number, hi: number, depth: number, parent?: RowGroup) => {
    let i = lo
    for (const g of gs) {
      for (; i < g.start; i++) items.push({ kind: 'row', i, depth, ...(parent ? { group: parent } : {}) })
      const collapsed = folded.has(groupHash(g.key))
      items.push({ kind: 'group', group: g, depth, collapsed, size: g.end - g.start })
      if (!collapsed) walk(g.children ?? [], g.start, g.end, depth + 1, g)
      i = g.end
    }
    for (; i < hi; i++) items.push({ kind: 'row', i, depth, ...(parent ? { group: parent } : {}) })
  }
  walk(groups, 0, rows.length, 0)

  const visible = items.flatMap(it => (it.kind === 'row' ? [it.i] : []))
  const visRows = visible.map(i => rows[i])
  const runs = new Map([...specs].map(([c, s]) => {
    const vr = computeRuns(visRows, c, s)
    const out: (TableRun | undefined)[] = new Array(rows.length).fill(undefined)
    visible.forEach((i, k) => { out[i] = vr[k] })
    return [c, out]
  }))
  return { items, runs, specs, ...pm }
}
