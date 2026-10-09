/**
 * ルート・バス停の編集操作（要件 F-2-3〜F-2-8、F-2-5a〜F-2-5e）。シナリオを受け取り、新しいシナリオを返す純粋関数。
 * 自動（道路沿い）の区間は、変更すると線を空にし、画面側が経路計算をやり直す。
 */
import {
  lineLengthKm,
  rebuildSegments,
  segmentLine,
  stopPoint,
  insertVia as insertViaPoint,
  type LngLat,
} from '../gis/route'
import type { Scenario, Segment, Stop } from './schema'

/** 区間の線を作り直す必要がある状態にする。直線・手描きはその場で距離を計算する */
function invalidate(seg: Segment, stops: Stop[]): Segment {
  const from = stops.find((s) => s.id === seg.fromStopId)
  const to = stops.find((s) => s.id === seg.toStopId)
  if (seg.method === 'auto') return { ...seg, coordinates: [], lengthKm: null }
  if (!from || !to) return seg
  const line = segmentLine({ ...seg, coordinates: [] }, from, to)
  return { ...seg, coordinates: line, lengthKm: lineLengthKm(line) }
}

function withStops(s: Scenario, stops: Stop[], loop = s.route.loop): Scenario {
  const { segments, dirty } = rebuildSegments(stops, loop, s.route.segments)
  const fixed = segments.map((seg, i) => (dirty.includes(i) ? invalidate(seg, stops) : seg))
  return { ...s, stops, route: { ...s.route, loop, segments: fixed } }
}

export function addStop(s: Scenario, stop: Stop, index = s.stops.length): Scenario {
  const stops = [...s.stops]
  stops.splice(index, 0, stop)
  return withStops(s, stops)
}

export function removeStop(s: Scenario, id: string): Scenario {
  return withStops(
    s,
    s.stops.filter((x) => x.id !== id),
  )
}

/** バス停の並べ替え（F-2-5a）。影響する区間だけが再計算の対象になる */
export function moveStopOrder(s: Scenario, from: number, to: number): Scenario {
  if (from === to || from < 0 || to < 0 || from >= s.stops.length || to >= s.stops.length) return s
  const stops = [...s.stops]
  const [x] = stops.splice(from, 1)
  stops.splice(to, 0, x)
  return withStops(s, stops)
}

export function setLoop(s: Scenario, loop: boolean): Scenario {
  return withStops(s, s.stops, loop)
}

export function updateStop(s: Scenario, id: string, patch: Partial<Omit<Stop, 'id'>>): Scenario {
  const stops = s.stops.map((x) => (x.id === id ? { ...x, ...patch } : x))
  const moved = patch.lat !== undefined || patch.lng !== undefined
  if (!moved) return { ...s, stops }
  const segments = s.route.segments.map((seg) =>
    seg.fromStopId === id || seg.toStopId === id ? invalidate(seg, stops) : seg,
  )
  return { ...s, stops, route: { ...s.route, segments } }
}

/** 全バス停の勢圏半径をまとめて変える（F-2-8） */
export function setAllCatchments(s: Scenario, m: number): Scenario {
  return { ...s, stops: s.stops.map((x) => ({ ...x, catchmentM: m })) }
}

function updateSegment(s: Scenario, i: number, fn: (seg: Segment) => Segment): Scenario {
  const segments = s.route.segments.map((seg, k) => (k === i ? fn(seg) : seg))
  return { ...s, route: { ...s.route, segments } }
}

export function setSegmentMethod(s: Scenario, i: number, method: Segment['method']): Scenario {
  return updateSegment(s, i, (seg) => invalidate({ ...seg, method }, s.stops))
}

/** 経由点を追加（ルート線のドラッグ。F-2-5b） */
export function addVia(s: Scenario, i: number, p: LngLat): Scenario {
  return updateSegment(s, i, (seg) => {
    const from = s.stops.find((x) => x.id === seg.fromStopId)!
    const to = s.stops.find((x) => x.id === seg.toStopId)!
    // 直線の区間に経由点を足したら、道路に沿わせる意図とみなして「自動」にする
    const method = seg.method === 'straight' ? 'auto' : seg.method
    return invalidate({ ...seg, method, via: insertViaPoint(seg, from, to, p) }, s.stops)
  })
}

export function moveVia(s: Scenario, i: number, k: number, p: LngLat): Scenario {
  return updateSegment(s, i, (seg) =>
    invalidate({ ...seg, via: seg.via.map((v, j) => (j === k ? p : v)) }, s.stops),
  )
}

export function removeVia(s: Scenario, i: number, k: number): Scenario {
  return updateSegment(s, i, (seg) =>
    invalidate({ ...seg, via: seg.via.filter((_, j) => j !== k) }, s.stops),
  )
}

export function setSegmentLengthOverride(s: Scenario, i: number, km: number | null): Scenario {
  return updateSegment(s, i, (seg) => ({ ...seg, lengthOverrideKm: km }))
}

export function setRouteLengthOverride(s: Scenario, km: number | null): Scenario {
  return { ...s, route: { ...s.route, lengthOverrideKm: km } }
}

/** 経路計算の結果を区間に反映する（計算中にバス停が変わっていたら反映しない） */
export function applyComputedSegment(
  s: Scenario,
  key: { fromStopId: string; toStopId: string; via: LngLat[] },
  coordinates: LngLat[],
  lengthKm: number,
): Scenario {
  const i = s.route.segments.findIndex(
    (seg) =>
      seg.fromStopId === key.fromStopId &&
      seg.toStopId === key.toStopId &&
      seg.method === 'auto' &&
      seg.coordinates.length === 0 &&
      JSON.stringify(seg.via) === JSON.stringify(key.via),
  )
  if (i < 0) return s
  return updateSegment(s, i, (seg) => ({ ...seg, coordinates, lengthKm }))
}

/** 自動の区間で、経路計算がまだのもの */
export function pendingSegments(s: Scenario): { index: number; seg: Segment; points: LngLat[] }[] {
  const out = []
  for (const [index, seg] of s.route.segments.entries()) {
    if (seg.method !== 'auto' || seg.coordinates.length > 0) continue
    const from = s.stops.find((x) => x.id === seg.fromStopId)
    const to = s.stops.find((x) => x.id === seg.toStopId)
    if (!from || !to) continue
    out.push({ index, seg, points: [stopPoint(from), ...seg.via, stopPoint(to)] })
  }
  return out
}
