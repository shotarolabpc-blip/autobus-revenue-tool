import { describe, expect, it } from 'vitest'
import type { Route, Stop } from '../project/schema'
import {
  circlePolygon,
  distanceM,
  emptySegment,
  insertVia,
  nearestSegmentIndex,
  pointToSegmentM,
  rebuildSegments,
  routeKm,
  routeLine,
  collapseRepeats,
  positionDistancesKm,
  segmentPairs,
  stopToStopKm,
  uniqueInOrder,
} from './route'

const stop = (id: string, lng: number, lat = 35): Stop => ({
  id,
  name: id,
  lat,
  lng,
  existingStopId: null,
  catchmentM: 300,
})
// 経度0.01度ずつ東に並ぶ（北緯35度で約911m）
const A = stop('A', 139.0)
const B = stop('B', 139.01)
const C = stop('C', 139.02)
const D = stop('D', 139.03)
const STEP_KM = distanceM([139.0, 35], [139.01, 35]) / 1000

describe('区間の組', () => {
  it('往復は登録順につなぐ', () => {
    expect(segmentPairs(['A', 'B', 'C'], false)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ])
  })
  it('循環は最後から最初へもつなぐ', () => {
    expect(segmentPairs(['A', 'B', 'C'], true)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ])
  })
})

describe('同じバス停を何度も通る停車順（ラケット型・8の字など）', () => {
  it('同じバス停が何度出てもよく、区間は隣どうしを順につなぐ', () => {
    // A→B→C→D→B と進み、循環なら最後の B から最初の A へ戻る
    expect(segmentPairs(['A', 'B', 'C', 'D', 'B'], true)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'B'],
      ['B', 'A'],
    ])
  })
  it('最後が最初と同じバス停なら、循環でも区間を足さない（すでに閉じている）', () => {
    expect(segmentPairs(['A', 'B', 'C', 'A'], true)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ])
  })
  it('最初に出てきた順に1つずつ並べる／続けて同じバス停は1つにする', () => {
    expect(uniqueInOrder(['A', 'B', 'C', 'B', 'A'])).toEqual(['A', 'B', 'C'])
    expect(collapseRepeats(['A', 'A', 'B', 'B', 'A'])).toEqual(['A', 'B', 'A'])
  })
  it('同じ組（B→A）が2回出ても、元の区間を1つずつ使い、新しい区間だけを再計算対象にする', () => {
    const ba1 = { ...emptySegment('B', 'A'), lengthKm: 1.1 }
    const ab = { ...emptySegment('A', 'B'), lengthKm: 1.0 }
    const r = rebuildSegments(['A', 'B', 'A', 'B', 'A'], false, [ab, ba1])
    expect(r.segments.map((x) => `${x.fromStopId}${x.toStopId}`)).toEqual(['AB', 'BA', 'AB', 'BA'])
    // 元の AB・BA は最初の1回ずつ再利用し、2回目の AB・BA が新しい区間
    expect(r.segments[0]).toBe(ab)
    expect(r.segments[1]).toBe(ba1)
    expect(r.dirty).toEqual([2, 3])
  })
})

describe('並べ替え後の区間の作り直し', () => {
  it('同じ組の区間はそのまま使い、変わった区間だけを再計算対象にする', () => {
    const ab = { ...emptySegment('A', 'B'), lengthKm: 1.5 }
    const bc = { ...emptySegment('B', 'C'), lengthKm: 2.5 }
    const cd = { ...emptySegment('C', 'D'), lengthKm: 3.5 }
    // A,B,C,D → A,C,B,D に並べ替え
    const r = rebuildSegments(['A', 'C', 'B', 'D'], false, [ab, bc, cd])
    expect(r.segments.map((s) => `${s.fromStopId}${s.toStopId}`)).toEqual(['AC', 'CB', 'BD'])
    expect(r.dirty).toEqual([0, 1, 2])
    // B を末尾に移動 → A,C,D,B：CD は再利用
    const r2 = rebuildSegments(['A', 'C', 'D', 'B'], false, [ab, bc, cd])
    expect(r2.dirty).toEqual([0, 2])
    expect(r2.segments[1]).toBe(cd)
  })
})

describe('距離', () => {
  const route = (segs = rebuildSegments(['A', 'B', 'C'], false, []).segments): Route => ({
    loop: false,
    sequence: ['A', 'B', 'C'],
    segments: segs,
    lengthOverrideKm: null,
  })

  it('未計算の区間は直線距離、計算済みは計算した距離、手修正が最優先', () => {
    const r = route()
    expect(routeKm(r, [A, B, C])).toBeCloseTo(2 * STEP_KM, 6)
    r.segments[0] = { ...r.segments[0], lengthKm: 1.2 }
    expect(routeKm(r, [A, B, C])).toBeCloseTo(1.2 + STEP_KM, 6)
    r.segments[0] = { ...r.segments[0], lengthOverrideKm: 1.0 }
    expect(routeKm(r, [A, B, C])).toBeCloseTo(1.0 + STEP_KM, 6)
  })

  it('総延長を手修正すると、バス停までの距離を比例配分する', () => {
    const r = route()
    r.segments = r.segments.map((s) => ({ ...s, lengthKm: 1 }))
    r.lengthOverrideKm = 3
    expect(positionDistancesKm(r, [A, B, C])).toEqual({ positionKm: [0, 1.5, 3], totalKm: 3 })
  })

  it('直線の区間は経由点を無視する', () => {
    const seg = {
      ...emptySegment('A', 'B', 'straight'),
      via: [[139.005, 35.01] as [number, number]],
    }
    const r: Route = { loop: false, sequence: ['A', 'B'], segments: [seg], lengthOverrideKm: null }
    expect(routeLine(r, [A, B])).toEqual([
      [139.0, 35],
      [139.01, 35],
    ])
  })
})

describe('経由点', () => {
  it('線が最も短くなる位置に入れる', () => {
    const seg = { ...emptySegment('A', 'D', 'manual'), via: [[139.02, 35] as [number, number]] }
    expect(insertVia(seg, A, D, [139.01, 35.0001])).toEqual([
      [139.01, 35.0001],
      [139.02, 35],
    ])
    expect(insertVia(seg, A, D, [139.025, 35.0001])).toEqual([
      [139.02, 35],
      [139.025, 35.0001],
    ])
  })
})

describe('勢圏の円', () => {
  it('中心から半径の距離にある点で一周する', () => {
    const ring = circlePolygon([139.7, 35.68], 300)
    expect(ring[0]).toEqual(ring.at(-1))
    for (const p of ring) expect(distanceM([139.7, 35.68], p)).toBeCloseTo(300, -1)
  })
})

describe('バス停から別のバス停までの乗車距離（停留所ごとの表）', () => {
  it('往復：停車位置の距離の差の絶対値', () => {
    const km = stopToStopKm(['A', 'B', 'C'], [0, 1, 3], false, 3, ['A', 'B', 'C'])
    expect(km[0]).toEqual([0, 1, 3])
    expect(km[2]).toEqual([3, 2, 0])
  })
  it('循環：進行方向に進んだ距離（最後まで行ったら最初に戻る）', () => {
    // A→B→C→(A)、1周 4km（A=0, B=1, C=3）
    const km = stopToStopKm(['A', 'B', 'C'], [0, 1, 3], true, 4, ['A', 'B', 'C'])
    expect(km[0]).toEqual([0, 1, 3])
    expect(km[1][0]).toBe(3) // B→C→A ＝ 2 + 1
    expect(km[2][1]).toBe(2) // C→A→B ＝ 1 + 1
  })
  it('ラケット型（A→B→C→D→B、B→A で戻る）：同じ B を通る回のうち、いちばん短い距離を使う', () => {
    // 位置：A=0, B=1, C=2, D=3, B(2回目)=4、1周＝5（最後の B→A は1km）
    const seq = ['A', 'B', 'C', 'D', 'B']
    const km = stopToStopKm(seq, [0, 1, 2, 3, 4], true, 5, ['A', 'B', 'C', 'D'])
    // A→B：1回目の B まで 1km（2回目の B までは 4km）→ 1
    expect(km[0][1]).toBe(1)
    // D→B：D(3) から2回目の B(4) まで 1km
    expect(km[3][1]).toBe(1)
    // B→A：2回目の B(4) から A（1周して0）まで 1km。1回目の B(1) からだと 4km
    expect(km[1][0]).toBe(1)
    // C→B：C(2) → D → 2回目の B(4) ＝ 2km。（1回目の B へは 1周して 4km）
    expect(km[2][1]).toBe(2)
    // B→C：1回目の B(1) から C(2) まで 1km
    expect(km[1][2]).toBe(1)
  })
})

describe('点にいちばん近い区間', () => {
  it('点から線分までの距離（線分の外側では端点までの距離）', () => {
    const lat100m = 100 / 111_195 // 緯度で約100m
    expect(pointToSegmentM([139.005, 35 + lat100m], [139.0, 35], [139.01, 35])).toBeCloseTo(100, 0)
    // 線分の西端より外側（約456m 西）：端点までの距離
    expect(pointToSegmentM([138.995, 35], [139.0, 35], [139.01, 35])).toBeCloseTo(
      distanceM([138.995, 35], [139.0, 35]),
      0,
    )
  })

  it('経由点を置こうとした点に最も近い区間を選ぶ', () => {
    const segs = rebuildSegments(['A', 'B', 'C'], false, []).segments
    const route: Route = {
      loop: false,
      sequence: ['A', 'B', 'C'],
      segments: segs,
      lengthOverrideKm: null,
    }
    // A—B の真ん中の少し北／B—C の真ん中の少し北
    expect(nearestSegmentIndex(route, [A, B, C], [139.005, 35.0005])?.index).toBe(0)
    expect(nearestSegmentIndex(route, [A, B, C], [139.015, 35.0005])?.index).toBe(1)
  })

  it('区間がなければ null', () => {
    const route: Route = { loop: false, sequence: ['A'], segments: [], lengthOverrideKm: null }
    expect(nearestSegmentIndex(route, [A], [139, 35])).toBeNull()
  })
})
