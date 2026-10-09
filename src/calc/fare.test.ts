import { describe, expect, it } from 'vitest'
import {
  averageDistanceFare,
  checkCategories,
  distanceFare,
  effectiveFare,
  excludeTax,
  fareTable,
  roundFare,
  sectionKm,
  type FareSettings,
} from './fare'

describe('端数処理（10円単位）', () => {
  it('切上げ・四捨五入・切捨て', () => {
    expect(roundFare(181, 'ceil10')).toBe(190)
    expect(roundFare(185, 'round10')).toBe(190)
    expect(roundFare(184.9, 'round10')).toBe(180)
    expect(roundFare(189, 'floor10')).toBe(180)
    expect(roundFare(180, 'ceil10')).toBe(180)
  })

  it('計算誤差で1段上がらない', () => {
    // 0.1 × 3 = 0.30000000000000004 のような誤差
    expect(roundFare(150 + 10 * 0.1 * 3 * (10 / 3), 'ceil10')).toBe(160)
    expect(roundFare(100.0000001, 'ceil10')).toBe(100)
  })
})

describe('対キロ区間制', () => {
  it('初乗り150円＋賃率40円/km×2.3km＝242円 → 切上げ250円', () => {
    expect(distanceFare(2.3, 150, 40, 'ceil10')).toBe(250)
    expect(distanceFare(2.3, 150, 40, 'round10')).toBe(240)
    expect(distanceFare(2.3, 150, 40, 'floor10')).toBe(240)
  })
})

describe('バス停間の距離', () => {
  const km = [0, 1.2, 2.0, 3.5]
  it('往復ルートは差の絶対値', () => {
    expect(sectionKm(km, 0, 3, false, 3.5)).toBeCloseTo(3.5)
    expect(sectionKm(km, 3, 1, false, 3.5)).toBeCloseTo(2.3)
  })
  it('循環ルートは進行方向に回る（総延長4.0km）', () => {
    expect(sectionKm(km, 1, 3, true, 4.0)).toBeCloseTo(2.3)
    expect(sectionKm(km, 3, 1, true, 4.0)).toBeCloseTo(0.5 + 1.2)
  })
})

describe('運賃表', () => {
  const km = [0, 1.0, 2.5]
  const flat: FareSettings = {
    type: 'flat',
    flatFare: 200,
    baseFare: 0,
    ratePerKm: 0,
    rounding: 'round10',
  }
  const dist: FareSettings = {
    type: 'distance',
    flatFare: 0,
    baseFare: 150,
    ratePerKm: 40,
    rounding: 'ceil10',
  }

  it('均一制はすべて同じ運賃、対角は空', () => {
    expect(fareTable(km, false, 2.5, flat)).toEqual([
      [null, 200, 200],
      [200, null, 200],
      [200, 200, null],
    ])
  })

  it('対キロ区間制（150円＋40円/km、切上げ）', () => {
    // 0→1：1.0km＝190円、0→2：2.5km＝250円、1→2：1.5km＝210円
    expect(fareTable(km, false, 2.5, dist)).toEqual([
      [null, 190, 250],
      [190, null, 210],
      [250, 210, null],
    ])
  })

  it('手修正したセルは自動計算より優先する', () => {
    const t = fareTable(km, false, 2.5, dist, new Map([['0-2', 230]]))
    expect(t[0][2]).toBe(230)
    expect(t[2][0]).toBe(250)
  })
})

describe('割引と実効平均運賃', () => {
  const cats = [
    { name: '一般', share: 0.6, discount: 0 },
    { name: '小児', share: 0.1, discount: 0.5 },
    { name: '高齢者パス', share: 0.3, discount: 1 },
  ]
  it('200円 × (0.6×1 + 0.1×0.5 + 0.3×0) ＝ 130円', () => {
    expect(effectiveFare(200, cats)).toBeCloseTo(130)
    expect(checkCategories(cats)).toEqual({ shareTotal: 1, ok: true })
  })
  it('構成比の合計が1でなければ印を付け、比率にそろえて計算する', () => {
    const c = [
      { name: '一般', share: 0.5, discount: 0 },
      { name: '小児', share: 0.5, discount: 0.5 },
    ]
    expect(effectiveFare(200, c)).toBeCloseTo(150)
    expect(checkCategories([{ name: '一般', share: 0.8, discount: 0 }]).ok).toBe(false)
  })
  it('税抜換算（10%）', () => {
    expect(excludeTax(220, 0.1)).toBeCloseTo(200)
  })
})

describe('対キロ区間制の平均運賃', () => {
  const dist: FareSettings = {
    type: 'distance',
    flatFare: 0,
    baseFare: 150,
    ratePerKm: 40,
    rounding: 'ceil10',
  }
  const table = fareTable([0, 1.0, 2.5], false, 2.5, dist)
  it('平均乗車距離が入力されていれば、その距離の運賃', () => {
    expect(averageDistanceFare(table, [1, 1, 1], false, dist, 2.0)).toEqual({
      fare: 230,
      method: 'avgRideKm',
    })
  })
  it('なければ乗車数で重み付けし、行き先は均等とみなす', () => {
    // バス停0：(190+250)/2=220、1：(190+210)/2=200、2：(250+210)/2=230。乗車数 2:1:1 → (440+200+230)/4=217.5
    const r = averageDistanceFare(table, [2, 1, 1], false, dist, null)
    expect(r.method).toBe('uniformAlighting')
    expect(r.fare).toBeCloseTo(217.5)
  })
})
