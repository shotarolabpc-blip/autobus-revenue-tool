import type { Fare, Scenario } from '../project/schema'
import type { FareSettings } from './fare'

/** 運賃表の手修正をインデックスのキー（"i-j"）に直す */
export function overridesByIndex(scenario: Scenario): Map<string, number> {
  const idx = new Map(scenario.stops.map((s, i) => [s.id, i]))
  const m = new Map<string, number>()
  for (const o of scenario.fare.tableOverrides) {
    const i = idx.get(o.fromStopId)
    const j = idx.get(o.toStopId)
    if (i !== undefined && j !== undefined) m.set(`${i}-${j}`, o.fare)
  }
  return m
}

export function fareSettings(f: Fare): FareSettings {
  return {
    type: f.type,
    flatFare: f.flatFare,
    baseFare: f.baseFare,
    ratePerKm: f.ratePerKm,
    rounding: f.rounding,
  }
}
