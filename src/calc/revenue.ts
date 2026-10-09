/**
 * 収入計算（要件 F-6-1〜F-6-4）。純粋関数のみ。
 *   年度別 運賃収入 ＝ 年間利用者数 × 実効平均運賃
 *   合計 ＝ 運賃収入 ＋ その他収入（広告・協賛など）
 *   補助金・負担金は参考扱いで別に集計し、合計には含めない（F-6-3）
 * 運賃は税込で入力し、税抜換算も持つ（F-6-4）。その他収入・補助金は入力した金額のまま扱う。
 */
import { excludeTax } from './fare'

export type YearAmount = { fiscalYear: number; item: string; amount: number }

export type YearRevenue = {
  fiscalYear: number
  riders: number
  /** 実効平均運賃（税込、円） */
  effectiveFare: number
  fareRevenue: number
  fareRevenueExTax: number
  otherRevenue: number
  /** 合計（運賃収入〈税込〉＋その他収入） */
  total: number
  /** 合計（運賃収入〈税抜〉＋その他収入） */
  totalExTax: number
  /** 補助金・負担金（参考・別集計） */
  subsidies: number
}

export function computeRevenue(args: {
  years: { fiscalYear: number; riders: number; effectiveFare: number }[]
  taxRate: number
  otherRevenue: YearAmount[]
  subsidies: YearAmount[]
}): YearRevenue[] {
  const sumFor = (list: YearAmount[], fy: number) =>
    list.filter((x) => x.fiscalYear === fy).reduce((a, x) => a + x.amount, 0)
  return args.years.map(({ fiscalYear, riders, effectiveFare }) => {
    const fareRevenue = riders * effectiveFare
    const fareRevenueExTax = excludeTax(fareRevenue, args.taxRate)
    const otherRevenue = sumFor(args.otherRevenue, fiscalYear)
    return {
      fiscalYear,
      riders,
      effectiveFare,
      fareRevenue,
      fareRevenueExTax,
      otherRevenue,
      total: fareRevenue + otherRevenue,
      totalExTax: fareRevenueExTax + otherRevenue,
      subsidies: sumFor(args.subsidies, fiscalYear),
    }
  })
}

export type Kpi = {
  first: YearRevenue
  last: YearRevenue
  cumulative: Omit<YearRevenue, 'fiscalYear' | 'effectiveFare'>
}

/** 主要KPI（初年度・最終年度・累計。F-8-1） */
export function kpis(rows: YearRevenue[]): Kpi | null {
  if (rows.length === 0) return null
  const sum = (k: keyof YearRevenue) => rows.reduce((a, r) => a + (r[k] as number), 0)
  return {
    first: rows[0],
    last: rows[rows.length - 1],
    cumulative: {
      riders: sum('riders'),
      fareRevenue: sum('fareRevenue'),
      fareRevenueExTax: sum('fareRevenueExTax'),
      otherRevenue: sum('otherRevenue'),
      total: sum('total'),
      totalExTax: sum('totalExTax'),
      subsidies: sum('subsidies'),
    },
  }
}
