import { describe, expect, it } from 'vitest'
import type { Route, Stop } from '../project/schema'
import {
  circlePolygon,
  distanceM,
  emptySegment,
  insertVia,
  rebuildSegments,
  routeKm,
  routeLine,
  segmentPairs,
  stopDistancesKm,
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
    expect(segmentPairs([A, B, C], false)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ])
  })
  it('循環は最後から最初へもつなぐ', () => {
    expect(segmentPairs([A, B, C], true)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ])
  })
})

describe('並べ替え後の区間の作り直し', () => {
  it('同じ組の区間はそのまま使い、変わった区間だけを再計算対象にする', () => {
    const ab = { ...emptySegment('A', 'B'), lengthKm: 1.5 }
    const bc = { ...emptySegment('B', 'C'), lengthKm: 2.5 }
    const cd = { ...emptySegment('C', 'D'), lengthKm: 3.5 }
    // A,B,C,D → A,C,B,D に並べ替え
    const r = rebuildSegments([A, C, B, D], false, [ab, bc, cd])
    expect(r.segments.map((s) => `${s.fromStopId}${s.toStopId}`)).toEqual(['AC', 'CB', 'BD'])
    expect(r.dirty).toEqual([0, 1, 2])
    // B を末尾に移動 → A,C,D,B：CD は再利用
    const r2 = rebuildSegments([A, C, D, B], false, [ab, bc, cd])
    expect(r2.dirty).toEqual([0, 2])
    expect(r2.segments[1]).toBe(cd)
  })
})

describe('距離', () => {
  const route = (segs = rebuildSegments([A, B, C], false, []).segments): Route => ({
    loop: false,
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
    expect(stopDistancesKm(r, [A, B, C])).toEqual({ stopKm: [0, 1.5, 3], totalKm: 3 })
  })

  it('直線の区間は経由点を無視する', () => {
    const seg = {
      ...emptySegment('A', 'B', 'straight'),
      via: [[139.005, 35.01] as [number, number]],
    }
    const r: Route = { loop: false, segments: [seg], lengthOverrideKm: null }
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
