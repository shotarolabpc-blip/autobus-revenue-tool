import { describe, expect, it } from 'vitest'
import { computeRevenue, kpis } from './revenue'

const rows = computeRevenue({
  years: [
    { fiscalYear: 2027, riders: 10_000, effectiveFare: 165 },
    { fiscalYear: 2028, riders: 12_000, effectiveFare: 165 },
  ],
  taxRate: 0.1,
  otherRevenue: [
    { fiscalYear: 2027, item: '車体広告', amount: 300_000 },
    { fiscalYear: 2027, item: '協賛', amount: 200_000 },
  ],
  subsidies: [{ fiscalYear: 2028, item: '国の補助', amount: 5_000_000 }],
})

describe('年度別収入', () => {
  it('運賃収入＝利用者数×実効平均運賃（税込）、税抜は÷1.1', () => {
    expect(rows[0].fareRevenue).toBe(1_650_000)
    expect(rows[0].fareRevenueExTax).toBeCloseTo(1_500_000)
  })
  it('その他収入は年度ごとに合計し、合計に含める', () => {
    expect(rows[0].otherRevenue).toBe(500_000)
    expect(rows[0].total).toBe(2_150_000)
    expect(rows[0].totalExTax).toBeCloseTo(2_000_000)
  })
  it('補助金・負担金は別集計で、合計に含めない', () => {
    expect(rows[1].subsidies).toBe(5_000_000)
    expect(rows[1].total).toBe(12_000 * 165)
  })
})

describe('主要KPI', () => {
  it('初年度・最終年度・累計', () => {
    const k = kpis(rows)!
    expect(k.first.fiscalYear).toBe(2027)
    expect(k.last.fiscalYear).toBe(2028)
    expect(k.cumulative.riders).toBe(22_000)
    expect(k.cumulative.total).toBe(2_150_000 + 1_980_000)
    expect(k.cumulative.subsidies).toBe(5_000_000)
  })
  it('年度がなければ null', () => {
    expect(kpis([])).toBeNull()
  })
})
