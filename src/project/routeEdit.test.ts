import { describe, expect, it } from 'vitest'
import { createScenario } from './factory'
import {
  addStop,
  addVia,
  addVisit,
  removeVisit,
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

describe('同じバス停をもう一度通る（きれいな循環でないルート）', () => {
  const key = (s: Scenario) => s.route.segments.map((x) => `${x.fromStopId}${x.toStopId}`)

  it('登録済みのバス停を、停車順にもう一度加えられる。バス停の一覧（stops）は増えない', () => {
    let s = setLoop(computeAll(threeStops()), true) // A,B,C（循環：C→A あり）
    s = addVisit(s, 'B') // A,B,C,B
    expect(s.route.sequence).toEqual(['A', 'B', 'C', 'B'])
    expect(s.stops.map((x) => x.id)).toEqual(['A', 'B', 'C'])
    // 区間：AB・BC は再利用、CB と、閉じる B→A が新しい
    expect(key(s)).toEqual(['AB', 'BC', 'CB', 'BA'])
    expect(pendingSegments(s).map((p) => p.index)).toEqual([2, 3])
  })

  it('直前と同じバス停は続けて加えない', () => {
    const s = threeStops() // A,B,C
    expect(addVisit(s, 'C')).toBe(s)
    expect(addVisit(s, 'Z')).toBe(s) // 登録されていないバス停
  })

  it('途中に挿入できる（A,B,C → A,C,B,C）', () => {
    const s = addVisit(threeStops(), 'C', 1)
    expect(s.route.sequence).toEqual(['A', 'C', 'B', 'C'])
  })

  it('1回分だけ外すと、ほかの回は残る。どこにも出なくなったバス停は一覧からも消える', () => {
    let s = addVisit(threeStops(), 'B') // A,B,C,B
    s = removeVisit(s, 3)
    expect(s.route.sequence).toEqual(['A', 'B', 'C'])
    s = removeVisit(s, 2) // C を外す → C は一覧から消える
    expect(s.route.sequence).toEqual(['A', 'B'])
    expect(s.stops.map((x) => x.id)).toEqual(['A', 'B'])
  })

  it('外した結果、同じバス停が続けて並ぶ場合は1つにまとめる（A,B,A → B を外すと A）', () => {
    let s = addVisit(threeStops(), 'A') // A,B,C,A
    s = removeVisit(s, 2) // C を外す → A,B,A
    expect(s.route.sequence).toEqual(['A', 'B', 'A'])
    s = removeVisit(s, 1) // B を外す → A,A → A
    expect(s.route.sequence).toEqual(['A'])
  })

  it('バス停を削除すると、停車順のすべての回から外れる', () => {
    const s = removeStop(addVisit(threeStops(), 'B'), 'B') // A,B,C,B → A,C
    expect(s.route.sequence).toEqual(['A', 'C'])
  })

  it('バス停を動かすと、そのバス停を通るすべての区間が再計算対象になる', () => {
    let s = computeAll(addVisit(threeStops(), 'B')) // A,B,C,B：AB・BC・CB
    s = updateStop(s, 'B', { lng: 139.015 })
    expect(pendingSegments(s).map((p) => p.index)).toEqual([0, 1, 2])
  })

  it('並べ替えは停車順の位置で行う', () => {
    const s = moveStopOrder(addVisit(threeStops(), 'B'), 3, 0) // A,B,C,B → B,A,B,C
    expect(s.route.sequence).toEqual(['B', 'A', 'B', 'C'])
    // stops は「最初に出てきた順」にそろう
    expect(s.stops.map((x) => x.id)).toEqual(['B', 'A', 'C'])
  })
})
