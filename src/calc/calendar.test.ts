import { describe, expect, it } from 'vitest'
import { isYearEnd, operatingDays, type HolidayData } from './calendar'

const yearEnd = { from: '12-29', to: '01-03' }

/** 2026年度（2026/4/1〜2027/3/31）の祝日（内閣府の公表値） */
const holidays2026: [string, string][] = [
  ['2026-04-29', '昭和の日'],
  ['2026-05-03', '憲法記念日'],
  ['2026-05-04', 'みどりの日'],
  ['2026-05-05', 'こどもの日'],
  ['2026-05-06', '休日'],
  ['2026-07-20', '海の日'],
  ['2026-08-11', '山の日'],
  ['2026-09-21', '敬老の日'],
  ['2026-09-22', '休日'],
  ['2026-09-23', '秋分の日'],
  ['2026-10-12', 'スポーツの日'],
  ['2026-11-03', '文化の日'],
  ['2026-11-23', '勤労感謝の日'],
  ['2027-01-01', '元日'],
  ['2027-01-11', '成人の日'],
  ['2027-02-11', '建国記念の日'],
  ['2027-02-23', '天皇誕生日'],
  ['2027-03-21', '春分の日'],
  ['2027-03-22', '休日'],
]

const data: HolidayData = {
  holidays: new Map(holidays2026.map(([d, name]) => [d, { name, estimated: false }])),
  yearEnd,
}

describe('年間運行日数', () => {
  it('2026年度：365日のうち土日104日＋平日の祝日を土休日に数える', () => {
    const r = operatingDays(2026, data, false)
    expect(r.weekday + r.holiday).toBe(365)
    // 土日は104日（2026/4/1〜2027/3/31）。祝日19日のうち日曜は 5/3・3/21 の2日 → 平日の祝日は17日
    expect(r.holiday).toBe(104 + 17)
    expect(r.weekday).toBe(365 - 121)
    expect(r.suspended).toBe(0)
  })

  it('年末年始を運休にすると、12/29〜1/3 の6日を除く', () => {
    const r = operatingDays(2026, data, true)
    expect(r.suspended).toBe(6)
    expect(r.weekday + r.holiday).toBe(359)
    // 12/29（火）〜1/3（日）：平日 12/29・30・31 の3日、土休日 1/1（祝）・1/2（土）・1/3（日）の3日
    const all = operatingDays(2026, data, false)
    expect(all.weekday - r.weekday).toBe(3)
    expect(all.holiday - r.holiday).toBe(3)
  })

  it('うるう年を含む年度は366日', () => {
    const r = operatingDays(2027, { holidays: new Map(), yearEnd }, false)
    expect(r.weekday + r.holiday).toBe(366)
  })

  it('推定値の祝日を使った場合は印を付ける', () => {
    const d: HolidayData = {
      holidays: new Map([['2030-05-03', { name: '憲法記念日', estimated: true }]]),
      yearEnd,
    }
    expect(operatingDays(2030, d, false).usesEstimatedHolidays).toBe(true)
    expect(operatingDays(2026, data, false).usesEstimatedHolidays).toBe(false)
  })

  it('年末年始の判定は年をまたぐ', () => {
    expect(isYearEnd('2026-12-29', yearEnd)).toBe(true)
    expect(isYearEnd('2027-01-03', yearEnd)).toBe(true)
    expect(isYearEnd('2027-01-04', yearEnd)).toBe(false)
    expect(isYearEnd('2026-12-28', yearEnd)).toBe(false)
  })
})
