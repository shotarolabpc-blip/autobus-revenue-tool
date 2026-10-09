import type { HolidayData } from '../calc/calendar'
import type { HolidaysFile } from './schemas'

/** holidays.json を年間運行日数の計算用の形にする */
export function toHolidayData(f: HolidaysFile): HolidayData {
  return {
    holidays: new Map(f.items.map((h) => [h.date, { name: h.name, estimated: h.estimated }])),
    yearEnd: { from: f.yearEnd.from, to: f.yearEnd.to },
  }
}
