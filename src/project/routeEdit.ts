/**
 * ルート・バス停の編集操作（要件 F-2-3〜F-2-8、F-2-5a〜F-2-5e）。シナリオを受け取り、新しいシナリオを返す純粋関数。
 * 自動（道路沿い）の区間は、変更すると線を空にし、画面側が経路計算をやり直す。
 */
import {
  collapseRepeats,
  lineLengthKm,
  rebuildSegments,
  segmentLine,
  stopPoint,
  insertVia as insertViaPoint,
  uniqueInOrder,
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

/**
 * 停車順（sequence）を変えたあとの状態を作る。
 * - 同じバス停が続けて並ばないようにする
 * - scenario.stops は、停車順に出てくるバス停を「最初に出てきた順」に1つずつ並べたものにそろえる
 *   （停車順に1度も出てこなくなったバス停は消える）
 * - 区間を作り直し、新しくできた区間だけを再計算の対象にする
 */
function withSequence(
  s: Scenario,
  stops: Stop[],
  sequence: string[],
  loop = s.route.loop,
): Scenario {
  const byId = new Map(stops.map((x) => [x.id, x]))
  const seq = collapseRepeats(sequence.filter((id) => byId.has(id)))
  const nextStops = uniqueInOrder(seq).map((id) => byId.get(id)!)
  const { segments, dirty } = rebuildSegments(seq, loop, s.route.segments)
  const fixed = segments.map((seg, i) => (dirty.includes(i) ? invalidate(seg, nextStops) : seg))
  return { ...s, stops: nextStops, route: { ...s.route, loop, sequence: seq, segments: fixed } }
}

/** 新しいバス停を停車順の index 番目（省略すると最後）に追加する */
export function addStop(s: Scenario, stop: Stop, index = s.route.sequence.length): Scenario {
  const seq = [...s.route.sequence]
  seq.splice(index, 0, stop.id)
  return withSequence(s, [...s.stops, stop], seq)
}

/**
 * すでに登録したバス停を、もう一度停車順に加える（ラケット型・8の字など、きれいな循環でないルート用）。
 * 直前・直後と同じバス停になる場合は何もしない。
 */
export function addVisit(s: Scenario, stopId: string, index = s.route.sequence.length): Scenario {
  if (!s.stops.some((x) => x.id === stopId)) return s
  const seq = s.route.sequence
  if (seq[index - 1] === stopId || seq[index] === stopId) return s
  const next = [...seq]
  next.splice(index, 0, stopId)
  return withSequence(s, s.stops, next)
}

/** 停車順の index 番目の1回分だけを外す。どこにも出てこなくなったバス停は消える */
export function removeVisit(s: Scenario, index: number): Scenario {
  if (index < 0 || index >= s.route.sequence.length) return s
  return withSequence(
    s,
    s.stops,
    s.route.sequence.filter((_, i) => i !== index),
  )
}

/** バス停を、停車順に出てくるすべての回から外して削除する */
export function removeStop(s: Scenario, id: string): Scenario {
  return withSequence(
    s,
    s.stops,
    s.route.sequence.filter((x) => x !== id),
  )
}

/** 停車順の並べ替え（F-2-5a）。影響する区間だけが再計算の対象になる */
export function moveStopOrder(s: Scenario, from: number, to: number): Scenario {
  const n = s.route.sequence.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return s
  const seq = [...s.route.sequence]
  const [x] = seq.splice(from, 1)
  seq.splice(to, 0, x)
  return withSequence(s, s.stops, seq)
}

/** 停車順をまるごと置き換える（取り込み用）。stops にないIDは無視する */
export function setSequence(s: Scenario, sequence: string[]): Scenario {
  return withSequence(s, s.stops, sequence)
}

export function setLoop(s: Scenario, loop: boolean): Scenario {
  return withSequence(s, s.stops, s.route.sequence, loop)
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
