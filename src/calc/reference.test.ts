import { describe, expect, it } from 'vitest'
import type { YearDemand } from './demand'
import {
  estimateKpi,
  parseReferenceCsv,
  ratio,
  referenceKpi,
  REFERENCE_CSV_HEADER,
} from './reference'
import type { YearRevenue } from './revenue'

describe('参考実績との比較', () => {
  it('推計の1日あたり・1便あたり・平均運賃（運行日数と便数の加重平均で換算）', () => {
    const y = { totalAnnual: 36500, days: { weekday: 245, holiday: 120 } } as YearDemand
    const rev = { fareRevenue: 7_300_000, effectiveFare: 200 } as YearRevenue
    // 1日あたり 36500÷365＝100人。便数は (20×245＋10×120)÷365＝16.58…便
    const k = estimateKpi(y, rev, 20, 10, 1.6)
    expect(k.dailyRiders).toBeCloseTo(100, 9)
    expect(k.perTrip).toBeCloseTo(100 / ((20 * 245 + 10 * 120) / 365), 9)
    expect(k.avgFare).toBeCloseTo(200, 9)
    expect(k.routeLengthKm).toBe(1.6)
  })

  it('便数が0なら1便あたりは出さない。乗車人員が0なら平均運賃は実効運賃', () => {
    const y = { totalAnnual: 0, days: { weekday: 245, holiday: 120 } } as YearDemand
    const k = estimateKpi(y, { fareRevenue: 0, effectiveFare: 180 } as YearRevenue, 0, 0, null)
    expect(k.perTrip).toBeNull()
    expect(k.avgFare).toBe(180)
  })

  it('参考実績の平均運賃＝乗車料収入÷乗車人員（F-5-7）。例：都01の考え方で 1日 1,000人・収入 22万円 → 220円', () => {
    const k = referenceKpi({
      id: 'r',
      name: 'テスト路線',
      operator: 'テスト事業者',
      fiscalYear: 2024,
      dailyRiders: 1000,
      dailyTrips: 50,
      dailyFareRevenue: 220_000,
      routeLengthKm: 5,
      source: 'テスト',
    })
    expect(k.avgFare).toBe(220)
    expect(k.perTrip).toBe(20)
  })

  it('収入が未入力なら平均運賃は出さない。比は実績が0なら出さない', () => {
    const k = referenceKpi({
      id: 'r',
      name: 'x',
      operator: '',
      fiscalYear: null,
      dailyRiders: 100,
      dailyTrips: null,
      dailyFareRevenue: null,
      routeLengthKm: null,
      source: 's',
    })
    expect(k.avgFare).toBeNull()
    expect(k.perTrip).toBeNull()
    expect(ratio(150, 100)).toBe(1.5)
    expect(ratio(150, 0)).toBeNull()
    expect(ratio(null, 100)).toBeNull()
  })
})

describe('参考実績のCSV読込（F-5-8）', () => {
  let n = 0
  const id = () => `id${++n}`
  it('正しい行を読み、引用符つきの値・BOM・カンマ区切りの数値も扱う', () => {
    const csv =
      String.fromCharCode(0xfeff) +
      REFERENCE_CSV_HEADER +
      '\r\n' +
      '"A市,コミュニティバス",A市,2024,"1,200",40,"250,000",6.5,"A市 協議会資料"\r\n'
    const r = parseReferenceCsv(csv, id)
    expect(r.errors).toEqual([])
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({
      name: 'A市,コミュニティバス',
      operator: 'A市',
      fiscalYear: 2024,
      dailyRiders: 1200,
      dailyTrips: 40,
      dailyFareRevenue: 250000,
      routeLengthKm: 6.5,
      source: 'A市 協議会資料',
    })
  })

  it('出典がない行・数値でない行は、理由つきで読まない（黙って捨てない）', () => {
    const csv = [
      REFERENCE_CSV_HEADER,
      'B線,B社,2024,100,,,,',
      'C線,C社,2024,abc,,,,出典',
      ',D社,2024,100,,,,出典',
      'E線,E社,2024,100,,,,出典',
    ].join('\n')
    const r = parseReferenceCsv(csv, id)
    expect(r.items.map((x) => x.name)).toEqual(['E線'])
    expect(r.errors).toEqual([
      '2行目：出典がありません（出典は必須です）',
      '3行目：1日乗車人員が数値ではありません',
      '4行目：名称がありません',
    ])
  })

  it('見出しが違うときは、足りない列を知らせる', () => {
    const r = parseReferenceCsv('名称,事業者\nA,B', id)
    expect(r.items).toEqual([])
    expect(r.errors[0]).toContain('見出しに次の列がありません')
  })
})
