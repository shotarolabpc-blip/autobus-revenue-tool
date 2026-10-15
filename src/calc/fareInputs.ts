import type { Fare, ProjectFile, Scenario } from '../project/schema'
import type { FareSettings } from './fare'
import {
  fareWarnings,
  suggestFares,
  type FareReference,
  type SuggestionResult,
} from './fareSuggestion'

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

/**
 * プロジェクトとシナリオから、運賃の目安（標準・高め）を求める。
 * 運賃欄・結果の画面・出力物（CSV・Excel）で同じ結果を使うための共通の入口。
 */
export function fareSuggestionFor(
  project: ProjectFile,
  scenario: Scenario,
  refs: FareReference[],
): SuggestionResult {
  const m = project.project.municipality
  return suggestFares({
    refs,
    prefCode: m.prefCode,
    cityCode: m.cityCode,
    fareType: scenario.fare.type,
    userUpperLimit: scenario.fare.upperLimit,
    system: scenario.fare.system,
  })
}

/** 運賃に関する警告（上限運賃の超過〈実施運賃のみ〉・弾力性0の警告）。画面と出力物で共通 */
export function fareWarningsFor(
  project: ProjectFile,
  scenario: Scenario,
  refs: FareReference[],
): string[] {
  return fareWarnings({
    fare: scenario.fare,
    high: fareSuggestionFor(project, scenario, refs).high,
    elasticity: scenario.coefficients.fareElasticity,
  })
}
