/** S2 cell → lat/lng geometry, trimmed to what the cell preview needs.
 *
 *  Pure geometry, no React — the preview draws SVG, but nothing here
 *  knows that. Adapted from ctbk's `www/src/lib/s2geo.ts`, which feeds
 *  both a Leaflet overlay and the same kind of tooltip.
 *
 *  Note this lives in `site/`, not in the library: an S2 column is a
 *  *consumer's* domain knowledge, exactly like ctbk's. The library
 *  ships the `renderCell` hook; what you decode in it is your business,
 *  and `@rdub/file-tree` gains no dependency from this file existing. */
import { s2 } from 's2js'

const { cellid, Cell } = s2
const { atan2, hypot, min, max, PI, sin, cos, asin, sqrt } = Math
const R2D = 180 / PI

/** Mean Earth radius (m), for edge-length estimates. */
const EARTH_R = 6371008.8

export type LatLng = [number, number]
export interface LatLngBounds { latMin: number; latMax: number; lngMin: number; lngMax: number }

const toLL = (v: { x: number; y: number; z: number }): LatLng =>
  [atan2(v.z, hypot(v.x, v.y)) * R2D, atan2(v.y, v.x) * R2D]

/** Level, or `null` if `s` isn't a valid S2 token. Doubles as the
 *  validity check — a cell column may also hold values that aren't
 *  tokens at all, which must fall through to the viewer's default
 *  rather than render as an empty cell. */
export function s2CellLevel(token: string): number | null {
  if (!/^[0-9a-f]{1,16}$/.test(token)) return null
  let ci: bigint
  try { ci = cellid.fromToken(token) } catch { return null }
  if (!cellid.valid(ci)) return null
  const lvl = cellid.level(ci)
  return lvl >= 0 && lvl <= 30 ? lvl : null
}

export function isS2Token(s: string): boolean {
  return s2CellLevel(s) !== null
}

/** The cell's four corners. Enough for a footprint at these sizes — a
 *  cell edge is a great-circle arc and bows off a straight lat/lng
 *  segment, but only visibly at levels far coarser than a city. */
export function s2CellVertices(token: string): LatLng[] {
  const cell = Cell.fromCellID(cellid.fromToken(token))
  return [0, 1, 2, 3].map(i => toLL(cell.vertex(i)))
}

export function s2CellBounds(token: string): LatLngBounds {
  let latMin = 90, latMax = -90, lngMin = 180, lngMax = -180
  for (const [lat, lng] of s2CellVertices(token)) {
    latMin = min(latMin, lat); latMax = max(latMax, lat)
    lngMin = min(lngMin, lng); lngMax = max(lngMax, lng)
  }
  return { latMin, latMax, lngMin, lngMax }
}

export function haversine([aLat, aLng]: LatLng, [bLat, bLng]: LatLng): number {
  const p = PI / 180
  const dLat = (bLat - aLat) * p, dLng = (bLng - aLng) * p
  const s = sin(dLat / 2) ** 2 + cos(aLat * p) * cos(bLat * p) * sin(dLng / 2) ** 2
  return 2 * EARTH_R * asin(sqrt(s))
}

/** Mean edge length, as a human-sized handle on "how big is L14?". */
export function s2CellEdgeMeters(token: string): number {
  const vs = s2CellVertices(token)
  let total = 0
  for (let i = 0; i < 4; i++) total += haversine(vs[i]!, vs[(i + 1) & 3]!)
  return total / 4
}

export function fmtMeters(m: number): string {
  if (m >= 10000) return `${(m / 1000).toFixed(0)} km`
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  if (m >= 100) return `${Math.round(m / 10) * 10} m`
  return `${m.toFixed(0)} m`
}

/** Equirectangular fit of `bounds` into `w`×`h`, with a `cos(lat)`
 *  correction so the city isn't stretched. Fine at this scale; the
 *  point is recognizability, not cartography. */
export function projector(bounds: LatLngBounds, w: number, h: number) {
  const { latMin, latMax, lngMin, lngMax } = bounds
  const kx = cos(((latMin + latMax) / 2) * PI / 180)
  const dLng = max(1e-9, (lngMax - lngMin) * kx)
  const dLat = max(1e-9, latMax - latMin)
  const s = min(w / dLng, h / dLat)
  const padX = (w - dLng * s) / 2
  const padY = (h - dLat * s) / 2
  return {
    x: (lng: number) => (lng - lngMin) * kx * s + padX,
    y: (lat: number) => h - ((lat - latMin) * s + padY),
  }
}

export function boundsOf(points: LatLng[]): LatLngBounds {
  let latMin = 90, latMax = -90, lngMin = 180, lngMax = -180
  for (const [lat, lng] of points) {
    latMin = min(latMin, lat); latMax = max(latMax, lat)
    lngMin = min(lngMin, lng); lngMax = max(lngMax, lng)
  }
  return { latMin, latMax, lngMin, lngMax }
}
