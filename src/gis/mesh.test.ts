import { describe, expect, it } from 'vitest'
import { meshBounds, secondMeshesInBounds } from './mesh'

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

describe('meshBounds', () => {
  it('1次メッシュ 5339（東京付近）は北緯35°20′〜36°00′、東経139°〜140°', () => {
    close(meshBounds('5339'), [139, 35 + 20 / 60, 140, 36])
  })

  it('2次メッシュ 533945 は1次メッシュを8×8に分けた（4,5）番目', () => {
    close(meshBounds('533945'), [
      139 + 5 / 8,
      35 + 20 / 60 + (4 * 5) / 60,
      139 + 6 / 8,
      35 + 20 / 60 + (5 * 5) / 60,
    ])
  })

  it('3次メッシュは約1km（緯度30秒×経度45秒）', () => {
    const [w, s, e, n] = meshBounds('53394611')
    expect((n - s) * 3600).toBeCloseTo(30, 6)
    expect((e - w) * 3600).toBeCloseTo(45, 6)
  })

  it('500mメッシュの末尾 1〜4 は 南西・南東・北西・北東', () => {
    const [w, s, e, n] = meshBounds('53394611')
    const sw = meshBounds('533946111')
    const ne = meshBounds('533946114')
    close(sw, [w, s, (w + e) / 2, (s + n) / 2])
    close(ne, [(w + e) / 2, (s + n) / 2, e, n])
  })

  it('不正なコードはエラー', () => {
    expect(() => meshBounds('12345')).toThrow()
    expect(() => meshBounds('533946115')).toThrow()
  })
})

describe('secondMeshesInBounds', () => {
  it('2次メッシュの内側の範囲はそのメッシュだけ', () => {
    const [w, s, e, n] = meshBounds('533945')
    expect(secondMeshesInBounds([w + 0.01, s + 0.01, e - 0.01, n - 0.01])).toEqual(['533945'])
  })

  it('1次メッシュの境界をまたぐ範囲も正しく列挙する', () => {
    // 東経140度（5339 と 5340 の境界）をまたぐ
    const codes = secondMeshesInBounds([139.99, 35.99, 140.01, 36.01])
    expect(codes.sort()).toEqual(['533977', '534070', '543907', '544000'].sort())
  })
})
