import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { haversineM, RoadGraph, type LngLat, type RoadIndex } from './router'
import { decodeTile, maybeGunzip } from './tileFormat'

// data_build/make_routing_fixture.py が作るテスト用の格子状の道路網（中の段は西向きの一方通行）
const dir = join(process.cwd(), 'src', 'routing', '__fixtures__')
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as RoadIndex
const fetchTile = async (tx: number, ty: number) => {
  try {
    return new Uint8Array(readFileSync(join(dir, `${tx}_${ty}.bin.gz`)))
  } catch {
    return null
  }
}
const graph = () => new RoadGraph(index, fetchTile)
const opt = { marginsKm: [0.5, 3], snapSearchM: 300 }

const B0: LngLat = [139.0, 35.01]
const B3: LngLat = [139.06, 35.01]
/** 経度0.02度（北緯35度付近） */
const DX = haversineM([139.0, 35.01], [139.02, 35.01])
/** 緯度0.01度 */
const DY = haversineM([139.0, 35.0], [139.0, 35.01])

describe('道路網タイルの読込', () => {
  it('Python で作ったタイルを読める（ノード・辺・座標）', async () => {
    const raw = await maybeGunzip(new Uint8Array(readFileSync(join(dir, '380_300.bin.gz'))))
    const t = decodeTile(raw, 0.05, [120, 20])
    expect([t.tx, t.ty]).toEqual([380, 300])
    expect(t.coords.length / 2).toBeGreaterThan(0)
    // 座標は格子点のどれか
    for (let i = 0; i < t.coords.length; i += 2) {
      expect([139.0, 139.02, 139.04]).toContain(Math.round(t.coords[i] * 100) / 100)
    }
  })

  it('形式の違うファイルはエラー', () => {
    expect(() => decodeTile(new Uint8Array([1, 2, 3, 4, 5]), 0.05, [120, 20])).toThrow('形式')
  })
})

describe('最短経路', () => {
  it('西向き（一方通行の向き）は中の段をまっすぐ通る', async () => {
    const r = await graph().route(B3, B0, opt)
    expect(r.found).toBe(true)
    if (!r.found) return
    expect(r.lengthM).toBeCloseTo(3 * DX, 0)
    expect(r.coordinates[0]).toEqual(B3)
    expect(r.coordinates.at(-1)).toEqual(B0)
    // 途中で緯度が変わらない
    expect(r.coordinates.every((p) => Math.abs(p[1] - 35.01) < 1e-9)).toBe(true)
  })

  it('東向きは一方通行を守り、上か下の段へ迂回する', async () => {
    const r = await graph().route(B0, B3, opt)
    expect(r.found).toBe(true)
    if (!r.found) return
    expect(r.lengthM).toBeCloseTo(3 * DX + 2 * DY, -1) // 段ごとに緯度が違うので数m の差は許容
    expect(r.coordinates.some((p) => Math.abs(p[1] - 35.01) > 0.005)).toBe(true)
  })

  it('タイルの境界（経度139.05）をまたいでも経路が続く', async () => {
    const r = await graph().route([139.06, 35.0], [139.0, 35.0], opt)
    expect(r.found).toBe(true)
    if (r.found) expect(r.lengthM).toBeCloseTo(3 * DX, -1)
  })

  it('同じ道路の上の2点は、その道路に沿ってつなぐ', async () => {
    const r = await graph().route([139.005, 35.0], [139.015, 35.0], opt)
    expect(r.found).toBe(true)
    if (r.found) expect(r.lengthM).toBeCloseTo(DX / 2, 0)
  })

  it('一方通行の同じ道路上で逆向きの2点は、ぐるっと回る', async () => {
    const r = await graph().route([139.005, 35.01], [139.015, 35.01], opt)
    expect(r.found).toBe(true)
    if (r.found) expect(r.lengthM).toBeGreaterThan(DX)
  })
})

describe('スナップ（最寄りの道路に寄せる）', () => {
  it('道路から離れた点は最寄りの道路に寄せ、寄せた距離を返す', async () => {
    // 中の段から北へ約100m
    const p: LngLat = [139.03, 35.0109]
    const r = await graph().route(p, B0, opt)
    expect(r.found).toBe(true)
    if (!r.found) return
    expect(r.from.point[1]).toBeCloseTo(35.01, 6)
    expect(r.from.distanceM).toBeGreaterThan(90)
    expect(r.from.distanceM).toBeLessThan(110)
  })

  it('近くに道路がなければ、理由つきで「見つからない」を返す', async () => {
    const r = await graph().route([139.03, 35.2], B0, opt)
    expect(r.found).toBe(false)
    if (!r.found) expect(r.reason).toBe('no-road-near-start')
  })
})

describe('交差点への吸着（「この交差点を通ってほしい」）', () => {
  it('近くの交差点（道路網のノード）に寄せ、寄せた距離を返す', async () => {
    // 格子の交点 (139.02, 35.01) から東へ約20m
    const p: LngLat = [139.02 + 0.00022, 35.01]
    const r = await graph().snapNode(p, 30)
    expect(r).not.toBeNull()
    expect(r!.point).toEqual([139.02, 35.01])
    expect(r!.distanceM).toBeGreaterThan(15)
    expect(r!.distanceM).toBeLessThan(25)
  })

  it('いちばん近い交差点を選ぶ（交点どうしの間隔は約1.8km）', async () => {
    const r = await graph().snapNode([139.039, 35.0099], 300)
    expect(r!.point).toEqual([139.04, 35.01])
  })

  it('探索範囲に交差点がなければ null（道路の途中の点には吸着しない）', async () => {
    // 交点 (139.02, 35.01) と (139.04, 35.01) の真ん中（約900m ずつ離れている）
    expect(await graph().snapNode([139.03, 35.01], 30)).toBeNull()
  })

  it('タイルの境界（経度139.05）をまたいで、反対側のタイルの交差点にも寄せられる', async () => {
    const r = await graph().snapNode([139.0499, 35.01], 1500)
    expect(r!.point[0]).toBeCloseTo(139.04, 6)
    const r2 = await graph().snapNode([139.0501, 35.01], 1500)
    expect(r2!.point[0]).toBeCloseTo(139.06, 6)
  })
})
