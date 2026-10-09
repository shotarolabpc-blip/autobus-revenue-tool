/**
 * 年間運行日数（平日／土休日）の計算。要件 F-3-1・付録B。
 * 対象年度（4月1日〜翌年3月31日）の実際のカレンダーと祝日データから数える。
 */

export type HolidayData = {
  /** 祝日の日付（YYYY-MM-DD）→ 推定値か */
  holidays: Map<string, { name: string; estimated: boolean }>
  /** 年末年始（MM-DD）。例：12-29〜01-03 */
  yearEnd: { from: string; to: string }
}

export type OperatingDays = {
  weekday: number
  /** 土曜・日曜・祝日 */
  holiday: number
  /** 年末年始の運休で除いた日数 */
  suspended: number
  /** 推定値の祝日を含むか（公表前の年） */
  usesEstimatedHolidays: boolean
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** 年末年始（from〜to、年をまたぐ）に入る日か */
export function isYearEnd(date: string, yearEnd: HolidayData['yearEnd']): boolean {
  const md = date.slice(5)
  return yearEnd.from <= yearEnd.to
    ? md >= yearEnd.from && md <= yearEnd.to
    : md >= yearEnd.from || md <= yearEnd.to
}

export function operatingDays(
  fiscalYear: number,
  data: HolidayData,
  yearEndSuspended: boolean,
): OperatingDays {
  const out: OperatingDays = { weekday: 0, holiday: 0, suspended: 0, usesEstimatedHolidays: false }
  // UTC で数える（タイムゾーンの影響を受けないように）
  const end = Date.UTC(fiscalYear + 1, 2, 31)
  for (let t = Date.UTC(fiscalYear, 3, 1); t <= end; t += 86_400_000) {
    const d = new Date(t)
    const key = ymd(d)
    if (yearEndSuspended && isYearEnd(key, data.yearEnd)) {
      out.suspended++
      continue
    }
    const h = data.holidays.get(key)
    if (h?.estimated) out.usesEstimatedHolidays = true
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6 || h) out.holiday++
    else out.weekday++
  }
  return out
}
