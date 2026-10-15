/**
 * 1つのシナリオの推計をまとめて行う（需要推計 → 運賃 → 収入）。要件 F-5・F-6。純粋関数のみ。
 * 画面（推計結果・ダッシュボード）と出力物（CSV・Excel）が、同じ結果を使うための共通の入口。
 *
 * 流れ：
 *   1. 係数（都市類型ごと。ユーザーが出典つきで上書きしたものだけ差し替える）
 *   2. 勢圏人口の面積按分、開発計画・施設需要・エリア補正
 *   3. 運賃：実効平均運賃（均一制は運賃×割引、対キロ区間制は運賃表の平均）。運賃弾力性（既定0＝効かせない）
 *   4. 需要推計（輸送力で頭打ち）→ 年度別の収入
 * 根拠のない係数（立ち上がり・運賃弾力性・運行サービス補正）は、ユーザーが入力しない限り効かせない（5.1A）。
 */
import { catchmentWeights, stopForPoint, type MeshUnit } from '../gis/catchment'
import { existingStopsInCatchments, operatorsOf, type ExistingStop } from '../gis/overlap'
import { positionDistancesKm, routeKm, stopToStopKm } from '../gis/route'
import type { CityTypeJudgement } from '../data/coefficients'
import type { CoefficientsFile } from '../data/schemas'
import type { ProjectFile, Scenario } from '../project/schema'
import { AGE_CLASSES_7, expandAgeMix } from './ageClasses'
import { operatingDays, type HolidayData } from './calendar'
import {
  computeDemand,
  fareFactor as calcFareFactor,
  type AgePop,
  type Coefficients,
  type DemandInput,
  type YearDemand,
} from './demand'
import { averageDistanceFare, effectiveFare, fareTableFromDistances } from './fare'
import { fareSettings, overridesByIndex } from './fareInputs'
import { computeRevenue, type YearRevenue } from './revenue'
import { dailyCapacity, effectiveCapacity } from './service'

export type PopulationData = {
  /** 人口の年次（5年刻み） */
  years: number[]
  /** 集計単位の id → [年次][年齢区分] */
  units: Map<string, AgePop[]>
  /** 集計単位の構成メッシュ（勢圏の面積按分に使う） */
  meshUnits: MeshUnit[]
}

export type PipelineData = {
  coefficients: CoefficientsFile
  cityType: CityTypeJudgement
  population: PopulationData
  holidayData: HolidayData
  /** 消費税率（比率） */
  taxRate: number
  /** 既存のバス停（勢圏との重なりの判定に使う）。読み込めなかった場合は null */
  existingStops?: ExistingStop[] | null
}

/**
 * 路線捕捉率の状態。unset＝勢圏が既存バス停と重なるのに、便数も捕捉率も入力されていない（計算は1.0。「未設定」と表示する）
 */
export type CaptureStatus = {
  stopId: string
  name: string
  status: 'none' | 'unset' | 'trips' | 'direct' | 'global'
  /** 勢圏の中にある既存バス停 */
  existing: ExistingStop[]
  weekday: number
  holiday: number
}

export const CAPTURE_LABELS: Record<CaptureStatus['status'], string> = {
  none: '既存バス停と重ならない（100%）',
  unset: '既存バス停と重なる。便数も捕捉率も未入力',
  trips: '既存路線の便数を入力して按分',
  direct: '捕捉率を直接入力',
  global: '全体の手入力（一律）',
}

export type FareMethod = 'flat' | 'avgRideKm' | 'destinationWeighted'

export type ScenarioResult = {
  scenarioId: string
  scenarioName: string
  fiscalYears: number[]
  demand: YearDemand[]
  revenue: YearRevenue[]
  /** 実効平均運賃（税込・割引後、円） */
  effectiveFare: number
  /** 割引前の平均運賃（円） */
  averageFare: number
  fareMethod: FareMethod
  fareFactor: number
  /** バス停ごとの路線捕捉率と、その決め方（確認事項 Q5） */
  captures: CaptureStatus[]
  /** 使った係数（上書き反映後。出力物の前提条件に載せる） */
  coefficients: Coefficients
  /** ユーザーが上書きした係数のキー */
  overriddenKeys: string[]
  cityType: CityTypeJudgement
  routeKm: number
  stopNames: Map<string, string>
  /** 結果の読み方に関わる注意（画面と出力物に載せる） */
  warnings: string[]
  /** 結果が出せない理由（バス停がない等）。null なら出せている */
  blocked: string | null
}

const OVERRIDE_KEY = /^(outingRate|tripRate|busShare)\.(weekday|holiday)\.(.+)$/

/** 係数にユーザーの上書きを反映する。上書きしたキーと、使えなかったキーを返す */
export function applyOverrides(
  base: Coefficients,
  overrides: Scenario['coefficients']['overrides'],
): { coefficients: Coefficients; applied: string[]; ignored: string[] } {
  const coefficients = structuredClone(base)
  const applied: string[] = []
  const ignored: string[] = []
  for (const o of overrides) {
    const m = OVERRIDE_KEY.exec(o.key)
    const day = m?.[2] as 'weekday' | 'holiday' | undefined
    const c = m && day ? coefficients[day][m[3]] : undefined
    if (!m || !c) {
      ignored.push(o.key)
      continue
    }
    c[m[1] as 'outingRate' | 'tripRate' | 'busShare'] = o.value
    applied.push(o.key)
  }
  return { coefficients, applied, ignored }
}

/** 立ち上がり係数：運行開始からの年数 i に、「yearIndex が i 以下で最大」の設定を使う。設定がなければ 1 */
export function rampUpFactor(table: Scenario['coefficients']['rampUp'], yearIndex: number): number {
  let best: { yearIndex: number; factor: number } | null = null
  for (const r of table) {
    if (r.yearIndex <= yearIndex && (best === null || r.yearIndex > best.yearIndex)) best = r
  }
  return best ? best.factor : 1
}

const fiscalYearsOf = (p: ProjectFile): number[] =>
  Array.from({ length: p.project.years }, (_, i) => p.project.startFiscalYear + i)

function blockedResult(
  project: ProjectFile,
  scenario: Scenario,
  data: PipelineData,
  blocked: string,
  warnings: string[] = [],
): ScenarioResult {
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    fiscalYears: fiscalYearsOf(project),
    demand: [],
    revenue: [],
    effectiveFare: 0,
    averageFare: 0,
    fareMethod: 'flat',
    fareFactor: 1,
    captures: [],
    coefficients: data.coefficients.values[String(data.cityType.code)],
    overriddenKeys: [],
    cityType: data.cityType,
    routeKm: 0,
    stopNames: new Map(scenario.stops.map((s) => [s.id, s.name])),
    warnings,
    blocked,
  }
}

export function runScenario(
  project: ProjectFile,
  scenario: Scenario,
  data: PipelineData,
): ScenarioResult {
  const warnings: string[] = []
  const years = fiscalYearsOf(project)
  if (scenario.stops.length === 0) {
    return blockedResult(
      project,
      scenario,
      data,
      'バス停がありません。「地図」画面でバス停を置いてください。',
    )
  }
  if (data.population.units.size === 0) {
    return blockedResult(
      project,
      scenario,
      data,
      'この範囲の人口データがありません。対象の都道府県のデータが用意されていない可能性があります。',
    )
  }

  // 1. 係数
  const cityCoef = data.coefficients.values[String(data.cityType.code)]
  const { coefficients, applied, ignored } = applyOverrides(
    cityCoef,
    scenario.coefficients.overrides,
  )
  if (ignored.length > 0) {
    warnings.push(
      `係数の上書きのうち、キーが正しくないため使えなかったものがあります：${ignored.join('、')}`,
    )
  }
  if (!data.cityType.auto && scenario.coefficients.cityTypeOverride === null) {
    warnings.push(`都市類型：${data.cityType.name}（${data.cityType.basis}）`)
  }
  // 2. 勢圏人口の面積按分
  const catchStops = scenario.stops.map((s) => ({
    id: s.id,
    lng: s.lng,
    lat: s.lat,
    radiusM: s.catchmentM,
  }))
  const weights = catchmentWeights(catchStops, data.population.meshUnits)
  for (const s of scenario.stops) {
    const w = weights.get(s.id)
    if (!w || [...w.values()].reduce((a, b) => a + b, 0) === 0) {
      warnings.push(`バス停「${s.name}」の勢圏に人口データがありません（人口0として計算します）。`)
    }
  }
  if (data.population.years.length > 0) {
    const first = data.population.years[0]
    const last = data.population.years[data.population.years.length - 1]
    if (years[0] < first || years[years.length - 1] > last) {
      warnings.push(`人口データは ${first}〜${last} 年です。範囲外の年度は端の年の値を使います。`)
    }
  }

  // 開発計画（F-5-1）：地点は勢圏に入るバス停、メッシュは面積按分
  const basisPop = AGE_CLASSES_7.map(() => 0)
  for (const [unitId, w] of [...weights.values()].flatMap((m) => [...m])) {
    const series = data.population.units.get(unitId)
    if (!series) continue
    series[0].forEach((v, k) => (basisPop[k] += v * w))
  }
  const developments: DemandInput['developments'] = []
  for (const d of scenario.developments) {
    let stopShares = new Map<string, number>()
    if (d.location.type === 'point') {
      const id = stopForPoint(catchStops, d.location.lng, d.location.lat)
      if (id) stopShares.set(id, 1)
    } else {
      const unitId = `dev:${d.id}`
      const w = catchmentWeights(catchStops, [{ id: unitId, meshes: [d.location.meshCode] }])
      stopShares = new Map(
        [...w]
          .map(([stopId, m]) => [stopId, m.get(unitId) ?? 0] as [string, number])
          .filter(([, v]) => v > 0),
      )
    }
    if (stopShares.size === 0) {
      warnings.push(
        `開発計画「${d.name}」は、どのバス停の勢圏にも入らないため計算に入れていません。`,
      )
      continue
    }
    developments.push({
      stopShares,
      people: d.people,
      startFiscalYear: d.startFiscalYear,
      phaseYears: d.phaseYears,
      ageMix: d.ageMix ? expandAgeMix(d.ageMix, basisPop) : null,
    })
  }

  // 運行日数・輸送力
  const sv = scenario.service
  const days = (fy: number) => {
    const auto = operatingDays(fy, data.holidayData, sv.yearEndSuspended)
    return {
      weekday: sv.weekdayDaysOverride ?? auto.weekday,
      holiday: sv.holidayDaysOverride ?? auto.holiday,
    }
  }
  const effCap = effectiveCapacity(sv.vehicle)
  const bothZero = sv.weekdayTrips <= 0 && sv.holidayTrips <= 0
  let capacity: DemandInput['dailyCapacity'] = { weekday: null, holiday: null }
  if (effCap === null) {
    warnings.push(
      '実効定員が計算できないため、輸送力による頭打ちをしていません（「運行・運賃」画面で車両を入力してください）。',
    )
  } else if (bothZero) {
    warnings.push('便数が未入力のため、輸送力による頭打ちをしていません。')
  } else {
    capacity = {
      weekday: dailyCapacity(effCap, sv.weekdayTrips, sv.maxLoadFactor),
      holiday: dailyCapacity(effCap, sv.holidayTrips, sv.maxLoadFactor),
    }
  }

  const c = scenario.coefficients
  // 路線捕捉率（確認事項 Q5）：バス停ごと・日種別ごと。
  //   設定あり：便数を入力 → 本路線の便数 ÷（本路線の便数 ＋ 重なる既存路線の便数の合計）（平日と土休日で別々）／ 直接入力
  //   設定なし：勢圏の中に既存バス停があれば「未設定」（計算は1.0）。なければ、全体の手入力があればそれ、なければ1.0
  const overlaps = data.existingStops
    ? existingStopsInCatchments(
        scenario.stops.map((st) => ({
          id: st.id,
          name: st.name,
          lng: st.lng,
          lat: st.lat,
          radiusM: st.catchmentM,
          existingStopId: st.existingStopId,
        })),
        data.existingStops,
      )
    : new Map<string, ExistingStop[]>()
  const ownTrips = { weekday: sv.weekdayTrips, holiday: sv.holidayTrips }
  const share = (own: number, other: number) => (own + other > 0 ? own / (own + other) : 1)
  const captures: CaptureStatus[] = scenario.stops.map((st) => {
    const existing = overlaps.get(st.id) ?? []
    const set = scenario.stopCapture.find((x) => x.stopId === st.id)
    const global = c.routeCaptureOverride
    if (set?.mode === 'trips') {
      return {
        stopId: st.id,
        name: st.name,
        status: 'trips',
        existing,
        weekday: share(ownTrips.weekday, set.existingWeekdayTrips),
        holiday: share(ownTrips.holiday, set.existingHolidayTrips),
      }
    }
    if (set?.mode === 'direct') {
      return {
        stopId: st.id,
        name: st.name,
        status: 'direct',
        existing,
        weekday: set.rate,
        holiday: set.rate,
      }
    }
    if (existing.length > 0 && global === null) {
      return { stopId: st.id, name: st.name, status: 'unset', existing, weekday: 1, holiday: 1 }
    }
    if (global !== null) {
      return {
        stopId: st.id,
        name: st.name,
        status: 'global',
        existing,
        weekday: global,
        holiday: global,
      }
    }
    return { stopId: st.id, name: st.name, status: 'none', existing, weekday: 1, holiday: 1 }
  })
  const unset = captures.filter((x) => x.status === 'unset')
  if (unset.length > 0) {
    const ops = operatorsOf(unset.flatMap((x) => x.existing))
    warnings.push(
      `路線捕捉率 未設定：バス停${unset.map((x) => `「${x.name}」`).join('')}の勢圏の中に、既存のバス停があります（${ops.join('、')}）。` +
        '既存路線にも乗れる人がいるため、このままだと延べ乗車人員を多く見積もっている可能性があります（未設定のあいだは捕捉率1.0で計算しています）。' +
        '「前提条件」画面で、重なる既存路線の便数を入力して按分するか、捕捉率を直接入力してください。',
    )
  }
  for (const x of captures) {
    const set = scenario.stopCapture.find((y) => y.stopId === x.stopId)
    if (set?.mode === 'trips' && (ownTrips.weekday <= 0 || ownTrips.holiday <= 0)) {
      warnings.push(
        `バス停「${x.name}」の捕捉率は、本路線の便数（平日${ownTrips.weekday}・土休日${ownTrips.holiday}）で按分しています。便数が0の日は捕捉率が0になります。`,
      )
      break
    }
  }
  const captureOf = new Map(captures.map((x) => [x.stopId, x]))
  const captureRate = (stopId: string, dt: 'weekday' | 'holiday') =>
    captureOf.get(stopId)?.[dt] ?? 1
  const scenarioFactor = scenario.derivedFrom ? 1 + scenario.derivedFrom.adjustPercent / 100 : 1
  const base: DemandInput = {
    fiscalYears: years,
    ageClasses: AGE_CLASSES_7,
    stopIds: scenario.stops.map((s) => s.id),
    weights,
    population: { years: data.population.years, units: data.population.units },
    coefficients,
    captureRate,
    serviceFactor: c.serviceFactor,
    fareFactor: 1,
    scenarioFactor,
    rampUp: (i) => rampUpFactor(c.rampUp, i),
    areaAdjustPctPerYear: scenario.areaPopulationAdjustPctPerYear,
    developments,
    facilities: scenario.facilityDemand.map((f) => ({
      // 来訪1人＝往復2乗車（行きと帰りのバス。確認事項 Q11）
      dailyRiders: f.visitorsPerDay * f.busShare * 2,
      startFiscalYear: f.startFiscalYear,
      days: f.days,
    })),
    days,
    dailyCapacity: capacity,
  }

  // 3. 運賃。対キロ区間制はバス停別の乗車数で重みを付けるため、いったん補正なしで需要を出す
  const f = scenario.fare
  const pre = computeDemand(base)
  const boardings = scenario.stops.map((s) =>
    pre[0].terms.filter((t) => t.stopId === s.id).reduce((a, t) => a + t.dailyBase, 0),
  )
  const lengthKm = routeKm(scenario.route, scenario.stops)
  let averageFare: number
  let fareMethod: FareMethod
  if (f.type === 'flat') {
    averageFare = f.flatFare
    fareMethod = 'flat'
  } else {
    const { positionKm, totalKm } = positionDistancesKm(scenario.route, scenario.stops)
    const distances = stopToStopKm(
      scenario.route.sequence,
      positionKm,
      scenario.route.loop,
      totalKm,
      scenario.stops.map((s) => s.id),
    )
    const table = fareTableFromDistances(distances, fareSettings(f), overridesByIndex(scenario))
    const r = averageDistanceFare(
      table,
      boardings,
      scenario.route.loop,
      fareSettings(f),
      f.avgRideKmOverride,
    )
    averageFare = r.fare
    fareMethod = r.method
    if (r.method === 'destinationWeighted') {
      warnings.push(
        '対キロ区間制の平均運賃は、乗るバス停・降りるバス停の推計乗車数で重み付けした運賃表の平均です（往復なので乗車と降車はほぼ同数とみなしています）。平均乗車距離を入力すると、その距離の運賃になります。',
      )
    }
  }
  const effFare = effectiveFare(averageFare, f.categories)
  const ff = calcFareFactor(effFare, c.referenceFare, c.fareElasticity)
  if (c.fareElasticity !== 0 && !c.referenceFare) {
    warnings.push(
      '運賃弾力性が入力されていますが、基準運賃が未入力のため、運賃による補正は効いていません。',
    )
  }

  // 4. 需要推計 → 収入
  const demand = computeDemand({ ...base, fareFactor: ff })
  const yearsOf = (dt: 'weekday' | 'holiday') =>
    demand.filter((y) => y.capped[dt]).map((y) => y.fiscalYear)
  const rangeText = (ys: number[]) =>
    ys.length === demand.length ? '全年度' : `${ys.join('・')}年度`
  const cappedWeekday = yearsOf('weekday')
  const cappedHoliday = yearsOf('holiday')
  if (cappedWeekday.length > 0 || cappedHoliday.length > 0) {
    const parts = [
      cappedWeekday.length > 0 ? `平日（${rangeText(cappedWeekday)}）` : '',
      cappedHoliday.length > 0 ? `土休日（${rangeText(cappedHoliday)}）` : '',
    ].filter(Boolean)
    warnings.push(
      `需要が輸送力を超えたため、輸送力で頭打ちにしています：${parts.join('、')}。便数・車両を見直してください。` +
        '輸送力は「車両に同時に乗れる人数×便数」で、途中で乗り降りが入れ替わる分は見込んでいないため、頭打ちはやや厳しめ（少なめ）に出ます。' +
        (sv.vehicle.unverified.includes('capacity')
          ? 'また、定員が「要確認」（出典が未確認）の値に基づいています。'
          : ''),
    )
  }
  const usesEstimated = years.some(
    (y) => operatingDays(y, data.holidayData, sv.yearEndSuspended).usesEstimatedHolidays,
  )
  if (usesEstimated) warnings.push('公表前の年の祝日は推定値で運行日数を数えています。')

  const revenue = computeRevenue({
    years: demand.map((y) => ({
      fiscalYear: y.fiscalYear,
      riders: y.totalAnnual,
      effectiveFare: effFare,
    })),
    taxRate: data.taxRate,
    otherRevenue: scenario.otherRevenue,
    subsidies: scenario.subsidies,
  })

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    fiscalYears: years,
    demand,
    revenue,
    effectiveFare: effFare,
    averageFare,
    fareMethod,
    fareFactor: ff,
    captures,
    coefficients,
    overriddenKeys: applied,
    cityType: data.cityType,
    routeKm: lengthKm,
    stopNames: new Map(scenario.stops.map((s) => [s.id, s.name])),
    warnings: [...new Set(warnings)],
    blocked: null,
  }
}

/**
 * 楽観・悲観シナリオ（元のシナリオから自動生成したもの）は、元のシナリオの入力をそのまま引き継ぎ、
 * 住民の需要だけを ±% する（F-7-2）。元を変えると、自動で反映される。元が見つからなければそのまま使う。
 */
export function resolveDerived(project: ProjectFile, scenario: Scenario): Scenario {
  if (!scenario.derivedFrom) return scenario
  const base = project.scenarios.find((s) => s.id === scenario.derivedFrom!.scenarioId)
  if (!base || base.id === scenario.id) return scenario
  return {
    ...structuredClone(base),
    id: scenario.id,
    name: scenario.name,
    type: scenario.type,
    derivedFrom: scenario.derivedFrom,
  }
}

/** バス停1つあたりの、年間の延べ乗車人員（住民分。頭打ち後）。施設等の外部需要はバス停に配分しない */
export function stopAnnualRiders(y: YearDemand, stopId: string): number {
  const factor = y.serviceFactor * y.fareFactor * y.rampUp * y.scenarioFactor
  let total = 0
  for (const dt of ['weekday', 'holiday'] as const) {
    const ratio = y.dailyDemand[dt] > 0 ? y.dailyRiders[dt] / y.dailyDemand[dt] : 0
    const base = y.terms
      .filter((t) => t.stopId === stopId && t.dayType === dt)
      .reduce((a, t) => a + t.dailyBase, 0)
    total += base * factor * ratio * y.days[dt]
  }
  return total
}
