/**
 * ルート（バス停の並び・区間）の計算。要件 F-2-5・F-2-5a・F-2-5e・F-2-6・F-2-7。純粋関数のみ。
 */
import type { Route, Segment, Stop } from '../project/schema'

export type LngLat = [number, number]

const EARTH_R = 6371008.8
const RAD = Math.PI / 180

export function distanceM(a: LngLat, b: LngLat): number {
  const p1 = a[1] * RAD
  const p2 = b[1] * RAD
  const h =
    Math.sin((p2 - p1) / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(((b[0] - a[0]) * RAD) / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function lineLengthKm(coords: LngLat[]): number {
  let m = 0
  for (let i = 0; i < coords.length - 1; i++) m += distanceM(coords[i], coords[i + 1])
  return m / 1000
}

export const stopPoint = (s: Stop): LngLat => [s.lng, s.lat]

/** バス停の並びから、区間（バス停→次のバス停）の組を作る。循環は最後→最初もつなぐ（F-2-5e） */
export function segmentPairs(stops: Stop[], loop: boolean): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < stops.length - 1; i++) pairs.push([stops[i].id, stops[i + 1].id])
  if (loop && stops.length >= 3) pairs.push([stops[stops.length - 1].id, stops[0].id])
  return pairs
}

export function emptySegment(
  fromStopId: string,
  toStopId: string,
  method: Segment['method'] = 'auto',
): Segment {
  return {
    fromStopId,
    toStopId,
    method,
    via: [],
    coordinates: [],
    lengthKm: null,
    lengthOverrideKm: null,
  }
}

/**
 * バス停の並び替え・追加・削除のあとに区間を作り直す。
 * 同じ組（出発・到着バス停）の区間はそのまま使い、新しい組だけを「未計算」として返す（F-2-5a：影響する区間だけ再計算）。
 */
export function rebuildSegments(
  stops: Stop[],
  loop: boolean,
  existing: Segment[],
  defaultMethod: Segment['method'] = 'auto',
): { segments: Segment[]; dirty: number[] } {
  const byPair = new Map(existing.map((s) => [`${s.fromStopId}>${s.toStopId}`, s]))
  const dirty: number[] = []
  const segments = segmentPairs(stops, loop).map(([a, b], i) => {
    const keep = byPair.get(`${a}>${b}`)
    if (keep) return keep
    dirty.push(i)
    return emptySegment(a, b, defaultMethod)
  })
  return { segments, dirty }
}

/** 区間の線（計算前・直線・手描きの場合も含め、表示に使う点列） */
export function segmentLine(seg: Segment, from: Stop, to: Stop): LngLat[] {
  if (seg.method === 'straight') return [stopPoint(from), stopPoint(to)]
  if (seg.method === 'manual' || seg.coordinates.length < 2) {
    return [stopPoint(from), ...seg.via, stopPoint(to)]
  }
  return seg.coordinates
}

/** 区間の距離（km）。手修正が優先（F-2-6） */
export function segmentKm(seg: Segment, from: Stop, to: Stop): number {
  if (seg.lengthOverrideKm !== null) return seg.lengthOverrideKm
  if (seg.lengthKm !== null) return seg.lengthKm
  return lineLengthKm(segmentLine(seg, from, to))
}

/** ルート総延長（km）。手修正が優先 */
export function routeKm(route: Route, stops: Stop[]): number {
  if (route.lengthOverrideKm !== null) return route.lengthOverrideKm
  return segmentKms(route, stops).reduce((a, b) => a + b, 0)
}

export function segmentKms(route: Route, stops: Stop[]): number[] {
  const byId = new Map(stops.map((s) => [s.id, s]))
  return route.segments.map((seg) => {
    const a = byId.get(seg.fromStopId)
    const b = byId.get(seg.toStopId)
    return a && b ? segmentKm(seg, a, b) : 0
  })
}

/**
 * 起点（最初のバス停）から各バス停までの距離（km）。運賃表（対キロ区間制）に使う。
 * 総延長を手修正した場合は、区間の距離を比例配分して合わせる。
 */
export function stopDistancesKm(
  route: Route,
  stops: Stop[],
): { stopKm: number[]; totalKm: number } {
  const seg = segmentKms(route, stops)
  const raw = seg.reduce((a, b) => a + b, 0)
  const total = routeKm(route, stops)
  const k = route.lengthOverrideKm !== null && raw > 0 ? total / raw : 1
  const stopKm = [0]
  for (let i = 0; i < stops.length - 1; i++) stopKm.push(stopKm[i] + (seg[i] ?? 0) * k)
  return { stopKm, totalKm: total }
}

/** ルート全体の線（区間の線をつなげたもの） */
export function routeLine(route: Route, stops: Stop[]): LngLat[] {
  const byId = new Map(stops.map((s) => [s.id, s]))
  const out: LngLat[] = []
  for (const seg of route.segments) {
    const a = byId.get(seg.fromStopId)
    const b = byId.get(seg.toStopId)
    if (!a || !b) continue
    const line = segmentLine(seg, a, b)
    out.push(...(out.length ? line.slice(1) : line))
  }
  return out
}

/** 区間の線のどこに経由点を入れるか：線上の位置の順に並べる（F-2-5b） */
export function insertVia(seg: Segment, from: Stop, to: Stop, p: LngLat): LngLat[] {
  const pts = [stopPoint(from), ...seg.via, stopPoint(to)]
  // 新しい点を入れたときに、線の長さが最も短くなる位置に入れる
  let best = 0
  let bestAdd = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const add = distanceM(pts[i], p) + distanceM(p, pts[i + 1]) - distanceM(pts[i], pts[i + 1])
    if (add < bestAdd) {
      bestAdd = add
      best = i
    }
  }
  const via = [...seg.via]
  via.splice(best, 0, p)
  return via
}

/** 円（勢圏）の多角形。半径 m（F-2-8） */
export function circlePolygon(center: LngLat, radiusM: number, steps = 48): LngLat[] {
  const [lng, lat] = center
  const dLat = radiusM / EARTH_R / RAD
  const dLng = dLat / Math.cos(lat * RAD)
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)])
  }
  return ring
}
