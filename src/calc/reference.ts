/**
 * 参考実績との比較（要件 5.4、F-5-6〜F-5-8）。純粋関数のみ。
 * 推計結果の「1日あたり延べ乗車人員」「1便あたり乗車人数」「平均運賃」を、既存路線の実績と並べて、桁感を確かめる。
 */
import type { UserReference } from '../project/schema'
import { stripBom } from '../util/text'
import type { YearDemand } from './demand'
import type { YearRevenue } from './revenue'

export type Kpi = {
  /** 1日あたり延べ乗車人員（人/日） */
  dailyRiders: number
  /** 1便あたり乗車人数（人/便）。便数が分からなければ null */
  perTrip: number | null
  /** 平均運賃＝乗車料収入÷乗車人員（円） */
  avgFare: number | null
  routeLengthKm: number | null
}

/** 推計結果（1年度分）の比較用の値。運行日数あたりに直す。便数は平日・土休日の運行日数による加重平均 */
export function estimateKpi(
  y: YearDemand,
  rev: YearRevenue,
  weekdayTrips: number,
  holidayTrips: number,
  routeLengthKm: number | null,
): Kpi {
  const days = y.days.weekday + y.days.holiday
  const dailyRiders = days > 0 ? y.totalAnnual / days : 0
  const tripsPerDay =
    days > 0 ? (weekdayTrips * y.days.weekday + holidayTrips * y.days.holiday) / days : 0
  return {
    dailyRiders,
    perTrip: tripsPerDay > 0 ? dailyRiders / tripsPerDay : null,
    avgFare: y.totalAnnual > 0 ? rev.fareRevenue / y.totalAnnual : rev.effectiveFare,
    routeLengthKm,
  }
}

/** 参考実績の比較用の値。平均運賃は 乗車料収入÷乗車人員（F-5-7） */
export function referenceKpi(r: UserReference): Kpi {
  return {
    dailyRiders: r.dailyRiders,
    perTrip: r.dailyTrips && r.dailyTrips > 0 ? r.dailyRiders / r.dailyTrips : null,
    avgFare:
      r.dailyFareRevenue !== null && r.dailyRiders > 0 ? r.dailyFareRevenue / r.dailyRiders : null,
    routeLengthKm: r.routeLengthKm,
  }
}

/** 推計 ÷ 実績 の比（実績が0や未入力なら null） */
export function ratio(estimate: number | null, actual: number | null): number | null {
  return estimate !== null && actual !== null && actual > 0 ? estimate / actual : null
}

const HEADERS = {
  名称: 'name',
  事業者: 'operator',
  年度: 'fiscalYear',
  '1日乗車人員': 'dailyRiders',
  '1日便数': 'dailyTrips',
  '1日乗車料収入': 'dailyFareRevenue',
  路線延長km: 'routeLengthKm',
  出典: 'source',
} as const

export const REFERENCE_CSV_HEADER = Object.keys(HEADERS).join(',')

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? '').replace(/[,\s]/g, '')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

/**
 * 手元の実績のCSVを読む（F-5-8）。1行目は見出し（名称,事業者,年度,1日乗車人員,1日便数,1日乗車料収入,路線延長km,出典）。
 * 出典は必須。読めない行は、理由つきで返す（黙って捨てない）。
 */
export function parseReferenceCsv(
  text: string,
  newId: () => string,
): { items: UserReference[]; errors: string[] } {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  const errors: string[] = []
  if (lines.length === 0) return { items: [], errors: ['ファイルが空です'] }
  const header = splitCsvLine(lines[0]).map((h) => h.trim())
  const missing = Object.keys(HEADERS).filter((h) => !header.includes(h))
  if (missing.length > 0) {
    return {
      items: [],
      errors: [
        `見出しに次の列がありません：${missing.join('、')}（見出し：${REFERENCE_CSV_HEADER}）`,
      ],
    }
  }
  const items: UserReference[] = []
  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line)
    const get = (h: keyof typeof HEADERS) => cells[header.indexOf(h)]?.trim() ?? ''
    const row = i + 2
    const dailyRiders = num(get('1日乗車人員'))
    const fiscalYear = num(get('年度'))
    const dailyTrips = num(get('1日便数'))
    const revenue = num(get('1日乗車料収入'))
    const length = num(get('路線延長km'))
    const bad = [dailyRiders, fiscalYear, dailyTrips, revenue, length].some(
      (v) => v !== null && Number.isNaN(v),
    )
    if (get('名称') === '') errors.push(`${row}行目：名称がありません`)
    else if (dailyRiders === null || Number.isNaN(dailyRiders) || dailyRiders < 0)
      errors.push(`${row}行目：1日乗車人員が数値ではありません`)
    else if (get('出典') === '') errors.push(`${row}行目：出典がありません（出典は必須です）`)
    else if (bad) errors.push(`${row}行目：数値でない値があります`)
    else
      items.push({
        id: newId(),
        name: get('名称'),
        operator: get('事業者'),
        fiscalYear: fiscalYear === null ? null : Math.round(fiscalYear),
        dailyRiders,
        dailyTrips,
        dailyFareRevenue: revenue,
        routeLengthKm: length,
        source: get('出典'),
      })
  })
  return { items, errors }
}
