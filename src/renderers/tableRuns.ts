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
import { compareValues } from './tableSort'
import type { TableColumn } from './table'

/** How a run of equal values in a column is drawn:
 *  - `'mark'`: every cell after the first renders `〃` (value on its title).
 *  - `'sticky'`: the run's cells merge into one, whose value floats at the
 *    top of the run's visible part as the table scrolls.
 *  - `'line'`: the first cell shows the value; a thin rule runs down through
 *    the rest and ends with a tick on the run's last row.
 *  - `'none'`: runs are computed (see `TableCellCtx.run`) but not drawn — a
 *    `renderCell` draws its own treatment. */
export type RunMode = 'mark' | 'sticky' | 'line' | 'none'

export interface RunSpec {
  mode: RunMode
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
    for (const c of ditto) out.set(c, { mode: 'mark', min: 2 })
    return out
  }
  for (const [c, s] of Object.entries(ditto)) {
    const spec = typeof s === 'string' ? { mode: s } : s
    out.set(c, { mode: spec.mode, min: spec.min ?? 2, ...(spec.key ? { key: spec.key } : {}) })
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
  spec: Pick<ResolvedRunSpec, 'key' | 'min'>,
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

/** One row of the rendered body: a data row (`i` indexes the page), or a
 *  synthetic parent row that `'tree'` path mode inserts above a group. */
export type BodyItem =
  | { kind: 'row'; i: number; tree?: { last: boolean } }
  | { kind: 'parent'; column: string; prefix: string; first: number }

/** The page as the body draws it. */
export interface TableLayout {
  items: BodyItem[]
  /** Per run column, one entry per page row (see {@link computeRuns}). */
  runs: Map<string, (TableRun | undefined)[]>
  specs: Map<string, ResolvedRunSpec>
  /** Per path column, the mode in effect on this page (`'tree'` falls back
   *  to `'dim'` on an unsorted page). */
  paths: Map<string, PathMode>
  /** The column grouping rows into a tree, if any. */
  tree?: string
  /** A note per column whose requested mode isn't in effect, for its
   *  header's tooltip. */
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

/** Lay out a page: runs for the `ditto` columns, the path mode in effect
 *  per `paths` column (see {@link pathModes}), and — with a `'tree'`
 *  column — the parent rows to insert. */
export function tableLayout(
  rows: readonly Record<string, unknown>[],
  columns: readonly Pick<TableColumn, 'name'>[],
  opts: { ditto?: DittoOption; paths?: PathsOption },
): TableLayout {
  const shown = new Set(columns.map(c => c.name))
  const specs = new Map([...normalizeDitto(opts.ditto)].filter(([c]) => shown.has(c)))
  const runs = new Map([...specs].map(([c, s]) => [c, computeRuns(rows, c, s)]))
  const pm = pathModes(rows, columns, opts.paths)
  const items: BodyItem[] = pm.tree === undefined ? rows.map((_, i) => ({ kind: 'row' as const, i })) : treeItems(rows, pm.tree)
  return { items, runs, specs, ...pm }
}

/** Group consecutive rows sharing a (non-empty) parent under one parent
 *  row. A group of one stays a plain row. */
function treeItems(rows: readonly Record<string, unknown>[], column: string): BodyItem[] {
  const parents = rows.map(r => {
    const v = r[column]
    return typeof v === 'string' ? splitParent(v)[0] : ''
  })
  const items: BodyItem[] = []
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && parents[j] === parents[i]) j++
    if (parents[i] !== '' && j - i >= 2) {
      items.push({ kind: 'parent', column, prefix: parents[i], first: i })
      for (let k = i; k < j; k++) items.push({ kind: 'row', i: k, tree: { last: k === j - 1 } })
    } else {
      for (let k = i; k < j; k++) items.push({ kind: 'row', i: k })
    }
    i = j
  }
  return items
}
