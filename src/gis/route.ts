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

/**
 * 停車順（バス停IDの並び。同じバス停が何度出てもよい）から、区間（バス停→次のバス停）の組を作る。
 * 循環は最後→最初もつなぐ（F-2-5e）。最後が最初と同じバス停なら、すでに閉じているので足さない。
 */
export function segmentPairs(sequence: string[], loop: boolean): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < sequence.length - 1; i++) pairs.push([sequence[i], sequence[i + 1]])
  if (loop && sequence.length >= 3 && sequence[sequence.length - 1] !== sequence[0]) {
    pairs.push([sequence[sequence.length - 1], sequence[0]])
  }
  return pairs
}

/** 停車順を、最初に出てきた順に1つずつ並べたバス停IDにする */
export function uniqueInOrder(sequence: string[]): string[] {
  return [...new Set(sequence)]
}

/** 同じバス停が続けて並ばないようにする（A,A → A） */
export function collapseRepeats(sequence: string[]): string[] {
  return sequence.filter((id, i) => i === 0 || id !== sequence[i - 1])
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
 * 停車順の変更（追加・削除・並べ替え）のあとに区間を作り直す。
 * 同じ組（出発・到着バス停）の区間はそのまま使い、新しい組だけを「未計算」として返す（F-2-5a：影響する区間だけ再計算）。
 * 同じ組が停車順に何度か出てくる場合は、出てきた順に、元の区間を1つずつ使う。
 */
export function rebuildSegments(
  sequence: string[],
  loop: boolean,
  existing: Segment[],
  defaultMethod: Segment['method'] = 'auto',
): { segments: Segment[]; dirty: number[] } {
  const byPair = new Map<string, Segment[]>()
  for (const seg of existing) {
    const key = `${seg.fromStopId}>${seg.toStopId}`
    byPair.set(key, [...(byPair.get(key) ?? []), seg])
  }
  const dirty: number[] = []
  const segments = segmentPairs(sequence, loop).map(([a, b], i) => {
    const keep = byPair.get(`${a}>${b}`)?.shift()
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
 * 停車順の各位置（起点から何番目の停車か）までの距離（km）。運賃表（対キロ区間制）に使う。
 * positionKm[i] は sequence[i] までの距離。総延長を手修正した場合は、区間の距離を比例配分して合わせる。
 */
export function positionDistancesKm(
  route: Route,
  stops: Stop[],
): { positionKm: number[]; totalKm: number } {
  const seg = segmentKms(route, stops)
  const raw = seg.reduce((a, b) => a + b, 0)
  const total = routeKm(route, stops)
  const k = route.lengthOverrideKm !== null && raw > 0 ? total / raw : 1
  const positionKm = route.sequence.length ? [0] : []
  for (let i = 0; i < route.sequence.length - 1; i++) {
    positionKm.push(positionKm[i] + (seg[i] ?? 0) * k)
  }
  return { positionKm, totalKm: total }
}

/**
 * バス停から別のバス停までの乗車距離（km）の表（行＝乗車、列＝降車。順番は stopOrder）。
 * 同じバス停が停車順に何度も出てくる場合は、乗車・降車それぞれのすべての停車位置の組み合わせのうち、
 * 最も短い乗車距離を使う。
 * - 循環：進行方向に進んで着く距離（最後まで行ったら最初に戻る。1周は totalKm）
 * - 往復：行きと帰りで同じ道を通るので、停車位置の距離の差の絶対値
 */
export function stopToStopKm(
  sequence: string[],
  positionKm: number[],
  loop: boolean,
  totalKm: number,
  stopOrder: string[],
): number[][] {
  const positions = new Map<string, number[]>()
  sequence.forEach((id, i) => positions.set(id, [...(positions.get(id) ?? []), i]))
  return stopOrder.map((from) =>
    stopOrder.map((to) => {
      if (from === to) return 0
      let best = Infinity
      for (const pa of positions.get(from) ?? []) {
        for (const pb of positions.get(to) ?? []) {
          const d = positionKm[pb] - positionKm[pa]
          const km = loop ? (d >= 0 ? d : totalKm + d) : Math.abs(d)
          if (km < best) best = km
        }
      }
      return Number.isFinite(best) ? best : 0
    }),
  )
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
