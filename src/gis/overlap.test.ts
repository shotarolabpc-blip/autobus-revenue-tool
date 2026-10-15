import { describe, expect, it } from 'vitest'
import { overlappingOperators } from './overlap'

const stop = (id: string, lng: number, lat: number, radiusM = 300) => ({
  id,
  name: id,
  lng,
  lat,
  radiusM,
})
// 緯度35.68付近：経度0.001度≒90m、緯度0.001度≒111m
const route = (operator: string | null, coords: [number, number][]) => ({
  coordinates: coords,
  operator,
})

describe('勢圏と既存バス路線の重なり', () => {
  it('勢圏（半径300m）の中を通る路線がある停留所だけが重なりと判定される', () => {
    const routes = [
      route('都営バス', [
        [139.7, 35.68],
        [139.71, 35.68],
      ]),
    ]
    const r = overlappingOperators(
      [stop('近い', 139.705, 35.681), stop('遠い', 139.705, 35.69)],
      routes,
    )
    expect([...r.keys()]).toEqual(['近い'])
    expect(r.get('近い')).toEqual(['都営バス'])
  })

  it('半径によって変わる（路線まで約222m：半径200mなら重ならず、300mなら重なる）', () => {
    const routes = [
      route('A社', [
        [139.7, 35.68],
        [139.71, 35.68],
      ]),
    ]
    const s200 = overlappingOperators([stop('x', 139.705, 35.682, 200)], routes)
    const s300 = overlappingOperators([stop('x', 139.705, 35.682, 300)], routes)
    expect(s200.size).toBe(0)
    expect(s300.size).toBe(1)
  })

  it('複数の事業者は重複なく並べる。事業者不明も扱う', () => {
    const routes = [
      route('B社', [
        [139.7, 35.68],
        [139.71, 35.68],
      ]),
      route('A社', [
        [139.7, 35.6805],
        [139.71, 35.6805],
      ]),
      route('B社', [
        [139.7, 35.681],
        [139.71, 35.681],
      ]),
      route(null, [
        [139.7, 35.6815],
        [139.71, 35.6815],
      ]),
    ]
    const r = overlappingOperators([stop('s', 139.705, 35.6805)], routes)
    expect(r.get('s')).toEqual(['A社', 'B社', '事業者不明'].sort())
  })

  it('路線がなければ空', () => {
    expect(overlappingOperators([stop('s', 139.7, 35.68)], []).size).toBe(0)
  })
})
