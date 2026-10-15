/**
 * 需要推計（要件 F-5、5.1・5.2・5.3・5.5）。純粋関数のみ。
 *
 *   年間延べ乗車人員(t) =
 *     Σ_バス停 Σ_年齢区分a [ 勢圏人口(a,t) × 外出率(a) × 1日トリップ数(a) × バス分担率(a) × 路線捕捉率 ]
 *   年齢区分は全国都市交通特性調査の7区分（calc/ageClasses.ts）。区分ごとの係数をそのまま掛けて足し合わせる（Q3：B）。
 *     × 運行サービス補正係数 × 運賃補正係数 × 立ち上がり係数(t) × 年間運行日数換算
 *     ＋ 施設・観光等の外部需要
 *
 * 平日と土休日で係数と運行日数が違うので、日種別ごとに1日あたりを出し、運行日数を掛けて合計する。
 * 各項を内訳として返し、画面で「なぜこの人数か」を確認できるようにする。
 */
export type DayType = 'weekday' | 'holiday'
export const DAY_TYPES: DayType[] = ['weekday', 'holiday']

export type AgeCoefficients = { outingRate: number; tripRate: number; busShare: number }
/** 日種別 × 年齢区分 → 係数。年齢区分の名前は DemandInput.ageClasses と同じにする */
export type Coefficients = Record<DayType, Record<string, AgeCoefficients>>

/** 年齢区分ごとの人口（順番は DemandInput.ageClasses） */
export type AgePop = number[]

/** 5年刻みの人口を年次で線形補間する（5.2）。範囲外は端の値 */
export function interpolatePop(years: number[], pops: AgePop[], year: number): AgePop {
  if (year <= years[0]) return [...pops[0]]
  const last = years.length - 1
  if (year >= years[last]) return [...pops[last]]
  const i = years.findIndex((y, k) => year >= y && year < years[k + 1])
  const t = (year - years[i]) / (years[i + 1] - years[i])
  return pops[i].map((v, k) => v + (pops[i + 1][k] - v) * t)
}

/** 運賃補正係数：運賃が基準より1%上がると、利用者が 弾力性 % 減る（線形。0未満にはしない） */
export function fareFactor(fare: number, referenceFare: number | null, elasticity: number): number {
  if (!referenceFare || referenceFare <= 0 || elasticity === 0) return 1
  return Math.max(0, 1 - elasticity * ((fare - referenceFare) / referenceFare))
}

/** 段階入居：開始年度から phaseYears 年かけて直線的に増える（F-5-2） */
export function developmentPeople(
  people: number,
  startYear: number,
  phaseYears: number,
  year: number,
): number {
  if (year < startYear) return 0
  return people * Math.min(1, (year - startYear + 1) / Math.max(1, phaseYears))
}

export type StopPopulation = {
  stopId: string
  /** 勢圏人口（年齢区分ごと）。開発計画・エリア補正を含む */
  pop: AgePop
  /** うち開発計画による増加 */
  development: AgePop
}

export type DemandTerm = {
  stopId: string
  /** 年齢区分（DemandInput.ageClasses の名前） */
  age: string
  dayType: DayType
  population: number
  outingRate: number
  tripRate: number
  busShare: number
  captureRate: number
  /** 1日あたり（補正前）＝ 人口×外出率×トリップ数×分担率×捕捉率 */
  dailyBase: number
}

export type YearDemand = {
  fiscalYear: number
  stops: StopPopulation[]
  terms: DemandTerm[]
  /** 1日あたり（補正前・日種別） */
  dailyBase: Record<DayType, number>
  serviceFactor: number
  fareFactor: number
  rampUp: number
  /** シナリオ係数（楽観・悲観シナリオの増減。1＝なし） */
  scenarioFactor: number
  /** 施設・観光等の外部需要（1日あたり） */
  dailyFacility: Record<DayType, number>
  /** 1日あたり（補正後＋外部需要・頭打ち前） */
  dailyDemand: Record<DayType, number>
  /** 1日の輸送力（null＝未入力で頭打ちなし） */
  dailyCapacity: Record<DayType, number | null>
  /** 1日あたり（頭打ち後） */
  dailyRiders: Record<DayType, number>
  capped: Record<DayType, boolean>
  days: Record<DayType, number>
  /** 住民による年間延べ乗車人員（頭打ち後） */
  residentsAnnual: number
  /** 施設・観光等の外部需要（年間延べ乗車人員・頭打ち後） */
  facilityAnnual: number
  /** 年間延べ乗車人員 */
  totalAnnual: number
}

export type DemandInput = {
  fiscalYears: number[]
  /** 年齢区分の並び（人口・開発計画の年齢構成・係数の名前と同じ順）。通常は AGE_CLASSES_7 */
  ageClasses: readonly string[]
  stopIds: string[]
  /** バス停ごとの「集計単位 → 配分割合」（catchmentWeights の結果） */
  weights: Map<string, Map<string, number>>
  /** 集計単位ごとの人口（5年刻み） */
  population: { years: number[]; units: Map<string, AgePop[]> }
  coefficients: Coefficients
  captureRate: number
  serviceFactor: number
  fareFactor: number
  /** シナリオ係数（楽観・悲観シナリオで、標準シナリオの需要を±%する。省略＝1。F-7-2） */
  scenarioFactor?: number
  /** 運行開始からの年数（0始まり）→ 立ち上がり係数 */
  rampUp: (yearIndex: number) => number
  /** エリア全体の人口補正率（%／年。複利） */
  areaAdjustPctPerYear: number
  developments: {
    /** 勢圏に入るバス停ごとの割合（地点なら1つのバス停に1、メッシュなら面積按分） */
    stopShares: Map<string, number>
    people: number
    startFiscalYear: number
    phaseYears: number
    /** 年齢構成（年齢区分ごとの割合。合計1）。null なら勢圏の年齢構成に合わせる。4階層の入力は expandAgeMix で広げる */
    ageMix: number[] | null
  }[]
  facilities: {
    dailyRiders: number
    startFiscalYear: number
    days: 'all' | 'weekday' | 'holiday'
  }[]
  /** 年度ごとの運行日数 */
  days: (fiscalYear: number) => Record<DayType, number>
  dailyCapacity: Record<DayType, number | null>
}

export function computeDemand(input: DemandInput): YearDemand[] {
  const { population } = input
  const n = input.ageClasses.length
  const start = input.fiscalYears[0]
  return input.fiscalYears.map((fy, yearIndex) => {
    const adjust = (1 + input.areaAdjustPctPerYear / 100) ** (fy - start)
    // バス停ごとの勢圏人口
    const stops: StopPopulation[] = input.stopIds.map((stopId) => {
      const pop: AgePop = new Array<number>(n).fill(0)
      for (const [unitId, w] of input.weights.get(stopId) ?? []) {
        const series = population.units.get(unitId)
        if (!series) continue
        const p = interpolatePop(population.years, series, fy)
        for (let k = 0; k < n; k++) pop[k] += p[k] * w * adjust
      }
      return { stopId, pop, development: new Array<number>(n).fill(0) }
    })
    // 開発計画（F-5-1・F-5-2）
    for (const d of input.developments) {
      const people = developmentPeople(d.people, d.startFiscalYear, d.phaseYears, fy)
      if (people <= 0) continue
      for (const st of stops) {
        const share = d.stopShares.get(st.stopId) ?? 0
        if (share <= 0) continue
        const mix = d.ageMix ?? normalize(st.pop)
        for (let k = 0; k < n; k++) {
          const add = people * share * mix[k]
          st.pop[k] += add
          st.development[k] += add
        }
      }
    }
    // 1日あたり（補正前）
    const terms: DemandTerm[] = []
    const dailyBase: Record<DayType, number> = { weekday: 0, holiday: 0 }
    for (const st of stops) {
      input.ageClasses.forEach((age, k) => {
        for (const dayType of DAY_TYPES) {
          const c = input.coefficients[dayType][age]
          const v = st.pop[k] * c.outingRate * c.tripRate * c.busShare * input.captureRate
          terms.push({
            stopId: st.stopId,
            age,
            dayType,
            population: st.pop[k],
            outingRate: c.outingRate,
            tripRate: c.tripRate,
            busShare: c.busShare,
            captureRate: input.captureRate,
            dailyBase: v,
          })
          dailyBase[dayType] += v
        }
      })
    }
    const rampUp = input.rampUp(yearIndex)
    const scenarioFactor = input.scenarioFactor ?? 1
    const factor = input.serviceFactor * input.fareFactor * rampUp * scenarioFactor
    const days = input.days(fy)
    // 施設・観光等の外部需要（1日あたり。補正係数は掛けない。F-5-4）
    const dailyFacility: Record<DayType, number> = { weekday: 0, holiday: 0 }
    for (const f of input.facilities) {
      if (fy < f.startFiscalYear) continue
      for (const dt of DAY_TYPES)
        if (f.days === 'all' || f.days === dt) dailyFacility[dt] += f.dailyRiders
    }
    const dailyDemand = {
      weekday: dailyBase.weekday * factor + dailyFacility.weekday,
      holiday: dailyBase.holiday * factor + dailyFacility.holiday,
    }
    // 輸送力を超える需要は輸送力で頭打ち（5.5）。住民と外部需要は同じ割合で減らす
    const ratio = { weekday: 1, holiday: 1 }
    const capped = { weekday: false, holiday: false }
    for (const dt of DAY_TYPES) {
      const cap = input.dailyCapacity[dt]
      if (cap !== null && dailyDemand[dt] > cap) {
        ratio[dt] = dailyDemand[dt] > 0 ? cap / dailyDemand[dt] : 0
        capped[dt] = true
      }
    }
    const dailyRiders = {
      weekday: dailyDemand.weekday * ratio.weekday,
      holiday: dailyDemand.holiday * ratio.holiday,
    }
    let residentsAnnual = 0
    let facilityAnnual = 0
    for (const dt of DAY_TYPES) {
      residentsAnnual += dailyBase[dt] * factor * ratio[dt] * days[dt]
      facilityAnnual += dailyFacility[dt] * ratio[dt] * days[dt]
    }
    return {
      fiscalYear: fy,
      stops,
      terms,
      dailyBase,
      serviceFactor: input.serviceFactor,
      fareFactor: input.fareFactor,
      rampUp,
      scenarioFactor,
      dailyFacility,
      dailyDemand,
      dailyCapacity: input.dailyCapacity,
      dailyRiders,
      capped,
      days,
      residentsAnnual,
      facilityAnnual,
      totalAnnual: residentsAnnual + facilityAnnual,
    }
  })
}

function normalize(p: AgePop): number[] {
  const t = p.reduce((a, b) => a + b, 0)
  return t > 0 ? p.map((v) => v / t) : p.map(() => 1 / p.length)
}
