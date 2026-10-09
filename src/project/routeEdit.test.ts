import { describe, expect, it } from 'vitest'
import { createScenario } from './factory'
import {
  addStop,
  addVia,
  applyComputedSegment,
  moveStopOrder,
  pendingSegments,
  removeStop,
  removeVia,
  setLoop,
  setSegmentMethod,
  updateStop,
} from './routeEdit'
import type { Scenario, Stop } from './schema'

const defaults = { catchmentM: 300, maxLoadFactor: 1, rampUpFactor: 1, fareElasticity: 0 }
const stop = (id: string, lng: number): Stop => ({
  id,
  name: id,
  lat: 35,
  lng,
  existingStopId: null,
  catchmentM: 300,
})

function threeStops(): Scenario {
  let s = createScenario('標準', defaults)
  s = addStop(s, stop('A', 139.0))
  s = addStop(s, stop('B', 139.01))
  s = addStop(s, stop('C', 139.02))
  return s
}

/** 自動の区間に計算結果を入れたことにする */
function computeAll(s: Scenario): Scenario {
  for (const p of pendingSegments(s)) {
    s = applyComputedSegment(s, p.seg, p.points, 1)
  }
  return s
}

describe('バス停の追加・削除', () => {
  it('登録順に区間ができ、新しい区間は経路計算待ちになる', () => {
    const s = threeStops()
    expect(s.route.segments.map((x) => `${x.fromStopId}${x.toStopId}`)).toEqual(['AB', 'BC'])
    expect(pendingSegments(s)).toHaveLength(2)
  })
  it('途中のバス停を消すと、前後をつなぐ区間ができる', () => {
    const s = removeStop(computeAll(threeStops()), 'B')
    expect(s.route.segments.map((x) => `${x.fromStopId}${x.toStopId}`)).toEqual(['AC'])
    expect(pendingSegments(s)).toHaveLength(1)
  })
})

describe('並べ替え・移動では、影響する区間だけ再計算', () => {
  it('末尾を先頭に移すと、変わった区間だけが計算待ち', () => {
    // A,B,C → C,A,B：AB は再利用、CA は新規
    const s = moveStopOrder(computeAll(threeStops()), 2, 0)
    expect(s.route.segments.map((x) => `${x.fromStopId}${x.toStopId}`)).toEqual(['CA', 'AB'])
    expect(pendingSegments(s).map((p) => p.index)).toEqual([0])
  })
  it('バス停を動かすと、その前後の区間だけ計算待ち', () => {
    let s = addStop(threeStops(), stop('D', 139.03))
    s = computeAll(s)
    s = updateStop(s, 'C', { lng: 139.025 })
    expect(pendingSegments(s).map((p) => p.index)).toEqual([1, 2])
  })
  it('名前の変更では再計算しない', () => {
    const s = updateStop(computeAll(threeStops()), 'B', { name: '市役所' })
    expect(pendingSegments(s)).toHaveLength(0)
    expect(s.stops[1].name).toBe('市役所')
  })
})

describe('循環／往復', () => {
  it('循環にすると最後→最初の区間が増え、往復に戻すと消える', () => {
    let s = setLoop(computeAll(threeStops()), true)
    expect(s.route.segments.map((x) => `${x.fromStopId}${x.toStopId}`)).toEqual(['AB', 'BC', 'CA'])
    expect(pendingSegments(s).map((p) => p.index)).toEqual([2])
    s = setLoop(s, false)
    expect(s.route.segments).toHaveLength(2)
  })
})

describe('区間の引き方と経由点', () => {
  it('直線にするとその場で距離が決まり、計算待ちにならない', () => {
    const s = setSegmentMethod(threeStops(), 0, 'straight')
    expect(s.route.segments[0].lengthKm).toBeGreaterThan(0.9)
    expect(pendingSegments(s).map((p) => p.index)).toEqual([1])
  })
  it('経由点を足すと、経由点を通る経路の計算待ちになる', () => {
    let s = computeAll(threeStops())
    s = addVia(s, 0, [139.005, 35.001])
    const p = pendingSegments(s)
    expect(p).toHaveLength(1)
    expect(p[0].points).toEqual([
      [139.0, 35],
      [139.005, 35.001],
      [139.01, 35],
    ])
    s = removeVia(computeAll(s), 0, 0)
    expect(s.route.segments[0].via).toEqual([])
  })
  it('計算中にバス停が変わった場合、古い結果は反映しない', () => {
    const s = threeStops()
    const old = pendingSegments(s)[0]
    const moved = updateStop(s, 'B', { lng: 139.015 })
    const applied = applyComputedSegment(moved, { ...old.seg, via: [[1, 1]] }, old.points, 1)
    expect(applied).toBe(moved)
  })
})
