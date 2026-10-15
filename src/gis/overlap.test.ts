import { describe, expect, it } from 'vitest'
import { existingStopsInCatchments, operatorsOf, type ExistingStop } from './overlap'

// 緯度35.68付近：経度0.001度≒90m、緯度0.001度≒111m
const stop = (
  id: string,
  lng: number,
  lat: number,
  radiusM = 300,
  existingStopId: string | null = null,
) => ({
  id,
  name: id,
  lng,
  lat,
  radiusM,
  existingStopId,
})
const ex = (
  id: string,
  lng: number,
  lat: number,
  operator: string | null = 'A社',
): ExistingStop => ({
  id,
  name: id,
  operator,
  lng,
  lat,
})

describe('勢圏と既存バス停の重なり（Q5）', () => {
  it('勢圏（半径300m）の中に既存バス停がある新設バス停だけが、重なりと判定される', () => {
    const r = existingStopsInCatchments(
      [stop('近い', 139.7, 35.68), stop('遠い', 139.7, 35.7)],
      [ex('e1', 139.701, 35.68)], // 約90m
    )
    expect([...r.keys()]).toEqual(['近い'])
    expect(r.get('近い')?.map((e) => e.id)).toEqual(['e1'])
  })

  it('半径で変わる（既存バス停まで約222m：半径200mなら重ならず、300mなら重なる）', () => {
    const e = [ex('e', 139.7, 35.682)]
    expect(existingStopsInCatchments([stop('s', 139.7, 35.68, 200)], e).size).toBe(0)
    expect(existingStopsInCatchments([stop('s', 139.7, 35.68, 300)], e).size).toBe(1)
  })

  it('既存バス停から採用したバス停は、その既存バス停自身を重なりに数えない', () => {
    const e = [ex('e1', 139.7, 35.68), ex('e2', 139.7005, 35.68)]
    const r = existingStopsInCatchments([stop('s', 139.7, 35.68, 300, 'e1')], e)
    expect(r.get('s')?.map((x) => x.id)).toEqual(['e2'])
  })

  it('事業者名は重複なく並べる。事業者不明も扱う', () => {
    expect(
      operatorsOf([
        ex('1', 0, 0, 'B社'),
        ex('2', 0, 0, 'A社'),
        ex('3', 0, 0, 'B社'),
        ex('4', 0, 0, null),
      ]),
    ).toEqual(['A社', 'B社', '事業者不明'].sort())
  })

  it('既存バス停がなければ空', () => {
    expect(existingStopsInCatchments([stop('s', 139.7, 35.68)], []).size).toBe(0)
  })
})
