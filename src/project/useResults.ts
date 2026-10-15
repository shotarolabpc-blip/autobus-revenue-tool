import { useEffect, useMemo, useState } from 'react'
import { judgeCityType } from '../data/coefficients'
import { toHolidayData } from '../data/holidays'
import { loadPopulationUnits } from '../data/population'
import {
  loadAttributions,
  loadCityTypes,
  loadCoefficients,
  loadDefaults,
  loadFareReferences,
  loadHolidays,
} from '../data/staticData'
import { useAsync } from '../data/useAsync'
import type {
  Attribution,
  CityTypesFile,
  CoefficientsFile,
  DefaultsFile,
  FareReferencesFile,
  HolidaysFile,
} from '../data/schemas'
import {
  runScenario,
  resolveDerived,
  type PipelineData,
  type ScenarioResult,
} from '../calc/pipeline'
import { catchmentBounds } from '../gis/catchment'
import type { ProjectFile } from './schema'

/** 推計に使う、このサイト自身の静的データ（外部には送らない） */
export type StaticInputs = {
  coefficients: CoefficientsFile
  cityTypes: CityTypesFile
  holidays: HolidaysFile
  defaults: DefaultsFile
  fareRefs: FareReferencesFile
  attributions: Attribution[]
}

const loadStatic = async (): Promise<StaticInputs> => {
  const [coefficients, cityTypes, holidays, defaults, fareRefs, attributions] = await Promise.all([
    loadCoefficients(),
    loadCityTypes(),
    loadHolidays(),
    loadDefaults(),
    loadFareReferences(),
    loadAttributions(),
  ])
  return { coefficients, cityTypes, holidays, defaults, fareRefs, attributions }
}

type PopulationState =
  | { key: string; status: 'ready'; data: PipelineData['population']; version: string | null }
  | { key: string; status: 'error'; message: string }

export type ResultsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      static: StaticInputs
      results: ScenarioResult[]
      /** 人口データの版（出力物の「データ版数」に記載） */
      populationVersion: string | null
    }

/**
 * プロジェクトの全シナリオの推計結果。人口データは、全シナリオのバス停の勢圏にかかる範囲だけを読み込む。
 * 入力を変えるたびに再計算する（10年分・1シナリオで2秒以内。F-6）。
 */
export function useResults(project: ProjectFile | null): ResultsState {
  const stat = useAsync(loadStatic)
  const [pop, setPop] = useState<PopulationState | null>(null)

  const prefCode = project?.project.municipality.prefCode ?? null
  const bounds = useMemo(() => {
    if (!project) return null
    const stops = project.scenarios.flatMap((s) =>
      s.stops.map((x) => ({ id: x.id, lng: x.lng, lat: x.lat, radiusM: x.catchmentM })),
    )
    return catchmentBounds(stops)
  }, [project])
  // バス停の位置・勢圏が大きく変わらない限り、人口データは読み直さない
  const key = prefCode && bounds ? `${prefCode}:${bounds.map((v) => v.toFixed(4)).join(',')}` : null

  useEffect(() => {
    if (!key || !prefCode || !bounds) return
    let alive = true
    loadPopulationUnits([prefCode], bounds).then(
      (r) => {
        if (!alive) return
        if (!r) {
          setPop({
            key,
            status: 'error',
            message: `都道府県コード ${prefCode} の人口データがありません。`,
          })
          return
        }
        setPop({
          key,
          status: 'ready',
          version: r.index.version,
          data: {
            years: r.index.years,
            units: new Map(r.units.map((u) => [u.id, u.pop])),
            meshUnits: r.units.map((u) => ({ id: u.id, meshes: u.meshes })),
          },
        })
      },
      (e: unknown) =>
        alive &&
        setPop({ key, status: 'error', message: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
    // bounds は key から決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, prefCode])

  const ready = stat.status === 'ready' ? stat.data : null
  const popReady = pop && pop.key === key ? pop : null
  const results = useMemo(() => {
    if (!project || !ready) return null
    const empty: PipelineData['population'] = { years: [], units: new Map(), meshUnits: [] }
    const population = popReady?.status === 'ready' ? popReady.data : empty
    const m = project.project.municipality
    return project.scenarios.map((sc) => {
      const eff = resolveDerived(project, sc)
      const data: PipelineData = {
        coefficients: ready.coefficients,
        cityType: judgeCityType(
          ready.coefficients,
          ready.cityTypes,
          m.prefCode,
          m.cityCode,
          eff.coefficients.cityTypeOverride,
        ),
        population,
        holidayData: toHolidayData(ready.holidays),
        taxRate: ready.defaults.items.consumptionTaxRate.value,
      }
      return runScenario(project, eff, data)
    })
  }, [project, ready, popReady])

  if (stat.status === 'error') return { status: 'error', message: stat.error.message }
  if (!project) return { status: 'loading' }
  if (stat.status === 'loading' || (key && !popReady)) return { status: 'loading' }
  if (popReady?.status === 'error') return { status: 'error', message: popReady.message }
  if (!ready || !results) return { status: 'loading' }
  return {
    status: 'ready',
    static: ready,
    results,
    populationVersion: popReady?.status === 'ready' ? popReady.version : null,
  }
}
