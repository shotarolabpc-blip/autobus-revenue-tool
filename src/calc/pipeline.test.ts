import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeCityType } from '../data/coefficients'
import { cityTypesFileSchema, coefficientsFileSchema } from '../data/schemas'
import { meshBounds } from '../gis/mesh'
import { createProject, createScenario } from '../project/factory'
import type { ProjectFile, Scenario } from '../project/schema'
import { AGE_CLASSES_7 } from './ageClasses'
import {
  applyOverrides,
  rampUpFactor,
  resolveDerived,
  runScenario,
  stopAnnualRiders,
  type PipelineData,
} from './pipeline'

const read = (f: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', f), 'utf8'))
const coefFile = coefficientsFileSchema.parse(read('coefficients.json'))
const cityTypes = cityTypesFileSchema.parse(read('city_types.json'))

const defaults = { catchmentM: 300, maxLoadFactor: 1, rampUpFactor: 1, fareElasticity: 0 }
const MESH = '533946111'
const [w, s, e, n] = meshBounds(MESH)
const center = { lng: (w + e) / 2, lat: (s + n) / 2 }

// 2025・2030年とも同じ人口（0-4, 5-14, 15-29, 30-49, 50-64, 65-74, 75+）
const POP = [10, 20, 100, 200, 100, 50, 40]

function setup(edit: (s: Scenario) => void = () => undefined) {
  const project: ProjectFile = createProject(
    {
      name: 't',
      prefCode: '13',
      cityCode: '13101',
      municipalityName: '千代田区',
      startFiscalYear: 2027,
      years: 2,
    },
    defaults,
  )
  const sc = project.scenarios[0]
  sc.stops = [
    {
      id: 's1',
      name: 'A',
      lat: center.lat,
      lng: center.lng,
      existingStopId: null,
      catchmentM: 2000,
    },
  ]
  sc.route = { loop: false, sequence: ['s1'], segments: [], lengthOverrideKm: null }
  sc.service.weekdayDaysOverride = 245
  sc.service.holidayDaysOverride = 120
  sc.fare.flatFare = 200
  edit(sc)
  const data: PipelineData = {
    coefficients: coefFile,
    cityType: judgeCityType(coefFile, cityTypes, '13', '13101', null),
    population: {
      years: [2025, 2030],
      units: new Map([['U', [POP, POP]]]),
      meshUnits: [{ id: 'U', meshes: [MESH] }],
    },
    holidayData: { holidays: new Map(), yearEnd: { from: '12-29', to: '01-03' } },
    taxRate: 0.1,
  }
  return { project, sc, data }
}

/** 1日あたり（補正前）を、係数ファイルから独立に計算する */
function daily(day: 'weekday' | 'holiday', code = 1): number {
  const v = coefFile.values[String(code)][day]
  return AGE_CLASSES_7.reduce(
    (a, age, i) => a + POP[i] * v[age].outingRate * v[age].tripRate * v[age].busShare,
    0,
  )
}

describe('runScenario（手計算との照合）', () => {
  it('年間延べ乗車人員＝（平日1日×245日＋土休日1日×120日）。運賃収入＝それ×200円', () => {
    const { project, sc, data } = setup()
    const r = runScenario(project, sc, data)
    expect(r.blocked).toBeNull()
    expect(r.cityType.code).toBe(1)
    const riders = daily('weekday') * 245 + daily('holiday') * 120
    expect(r.demand[0].totalAnnual).toBeCloseTo(riders, 6)
    expect(r.revenue[0].fareRevenue).toBeCloseTo(riders * 200, 4)
    expect(r.revenue[0].fareRevenueExTax).toBeCloseTo((riders * 200) / 1.1, 4)
    expect(r.revenue[1].riders).toBeCloseTo(riders, 6) // 人口は同じなので2年目も同じ
  })

  it('立ち上がり係数・運賃弾力性・シナリオ係数を掛ける（ユーザーが入力したときだけ）', () => {
    const { project, sc, data } = setup((s) => {
      s.coefficients.rampUp = [
        { yearIndex: 0, factor: 0.5 },
        { yearIndex: 1, factor: 0.8 },
      ]
      s.coefficients.referenceFare = 100
      s.coefficients.fareElasticity = 0.2 // 運賃が基準の2倍 → 1 − 0.2×1 ＝ 0.8
      s.derivedFrom = { scenarioId: 'x', adjustPercent: -10 }
    })
    const r = runScenario(project, sc, data)
    const base = daily('weekday') * 245 + daily('holiday') * 120
    expect(r.fareFactor).toBeCloseTo(0.8, 12)
    expect(r.demand[0].totalAnnual).toBeCloseTo(base * 0.5 * 0.8 * 0.9, 6)
    expect(r.demand[1].totalAnnual).toBeCloseTo(base * 0.8 * 0.8 * 0.9, 6)
  })

  it('既定では立ち上がり・弾力性・サービス補正は効かない', () => {
    const { project, sc, data } = setup()
    const r = runScenario(project, sc, data)
    expect([
      r.fareFactor,
      r.demand[0].rampUp,
      r.demand[0].serviceFactor,
      r.demand[0].scenarioFactor,
    ]).toEqual([1, 1, 1, 1])
  })

  it('割引区分：運賃200円・半額の人が40%なら実効平均運賃は160円', () => {
    const { project, sc, data } = setup((s) => {
      s.fare.categories = [
        { name: '一般', share: 0.6, discount: 0 },
        { name: '高齢者', share: 0.4, discount: 0.5 },
      ]
    })
    const r = runScenario(project, sc, data)
    expect(r.effectiveFare).toBeCloseTo(160, 9)
  })

  it('係数の上書き（出典つき）は、そのキーだけを差し替える', () => {
    const { project, sc, data } = setup((s) => {
      s.coefficients.overrides = [{ key: 'busShare.weekday.75+', value: 0.5, source: 'テスト' }]
    })
    const r = runScenario(project, sc, data)
    const v = coefFile.values['1'].weekday['75+']
    const expectWeekday =
      daily('weekday') -
      40 * v.outingRate * v.tripRate * v.busShare +
      40 * v.outingRate * v.tripRate * 0.5
    expect(r.demand[0].dailyBase.weekday).toBeCloseTo(expectWeekday, 9)
    expect(r.overriddenKeys).toEqual(['busShare.weekday.75+'])
  })

  it('輸送力を超えたら頭打ちにして警告する（実効定員10人×1便×乗車率1＝1日10人）', () => {
    const { project, sc, data } = setup((s) => {
      s.service.vehicle = {
        ...s.service.vehicle,
        capacity: 10,
        operatorOnBoard: false,
        standingAllowed: true,
      }
      s.service.weekdayTrips = 1
      s.service.holidayTrips = 1
    })
    const r = runScenario(project, sc, data)
    expect(r.demand[0].dailyRiders.weekday).toBeCloseTo(10, 9)
    expect(r.demand[0].totalAnnual).toBeCloseTo(10 * 245 + 10 * 120, 6)
    expect(r.warnings.some((x) => x.includes('頭打ち'))).toBe(true)
  })

  it('対キロ区間制：平均乗車距離を入力すれば、その距離の運賃（初乗り150＋50円/km×2km＝250円）', () => {
    const { project, sc, data } = setup((s) => {
      s.fare.type = 'distance'
      s.fare.baseFare = 150
      s.fare.ratePerKm = 50
      s.fare.avgRideKmOverride = 2
    })
    const r = runScenario(project, sc, data)
    expect(r.fareMethod).toBe('avgRideKm')
    expect(r.averageFare).toBe(250)
  })

  it('開発計画（地点）：勢圏に入れば住民として加わる。外れたら警告して入れない', () => {
    const inside = setup((s) => {
      s.developments = [
        {
          id: 'd1',
          name: '新住宅',
          location: { type: 'point', lat: center.lat, lng: center.lng },
          startFiscalYear: 2027,
          people: 100,
          phaseYears: 1,
          ageMix: { '0-14': 0, '15-64': 0, '65-74': 0, '75+': 1 },
        },
      ]
    })
    const r = runScenario(inside.project, inside.sc, inside.data)
    const v = coefFile.values['1'].weekday['75+']
    const extra = 100 * v.outingRate * v.tripRate * v.busShare
    expect(r.demand[0].dailyBase.weekday).toBeCloseTo(daily('weekday') + extra, 9)
    const outside = setup((s) => {
      s.developments = [
        {
          id: 'd1',
          name: '遠い住宅',
          location: { type: 'point', lat: center.lat + 1, lng: center.lng },
          startFiscalYear: 2027,
          people: 100,
          phaseYears: 1,
          ageMix: null,
        },
      ]
    })
    const r2 = runScenario(outside.project, outside.sc, outside.data)
    expect(r2.demand[0].dailyBase.weekday).toBeCloseTo(daily('weekday'), 9)
    expect(r2.warnings.some((x) => x.includes('勢圏にも入らない'))).toBe(true)
  })

  it('施設需要：来訪者×バス利用率が、住民とは別に加わる（補正係数は掛けない）', () => {
    const { project, sc, data } = setup((s) => {
      s.facilityDemand = [
        {
          id: 'f1',
          name: '病院',
          visitorsPerDay: 100,
          busShare: 0.1,
          startFiscalYear: 2027,
          days: 'weekday',
        },
      ]
    })
    const r = runScenario(project, sc, data)
    // 来訪1人＝往復2乗車（確認事項 Q11）：100人×10%×2＝20乗車/日
    const expected = (daily('weekday') + 20) * 245 + daily('holiday') * 120
    expect(r.demand[0].totalAnnual).toBeCloseTo(expected, 6)
  })

  it('バス停がなければ結果を出さず、理由を返す', () => {
    const { project, sc, data } = setup((s) => {
      s.stops = []
      s.route.sequence = []
    })
    const r = runScenario(project, sc, data)
    expect(r.blocked).toContain('バス停がありません')
    expect(r.revenue).toEqual([])
  })

  it('0〜4歳は需要に数えない（確認事項 Q2）。都市類型を自動判定できない場合は警告に出す', () => {
    const { project, sc, data } = setup()
    const r0 = runScenario(project, sc, data)
    const t = r0.demand[0].terms.filter((x) => x.age === '0-4')
    expect(t.length).toBe(2)
    expect(t.every((x) => x.dailyBase === 0)).toBe(true)
    const d2 = { ...data, cityType: judgeCityType(coefFile, cityTypes, '13', '13204', null) }
    const r = runScenario(project, sc, d2)
    expect(r.warnings.some((x) => x.includes('都市類型'))).toBe(true)
  })
})

describe('部品', () => {
  it('立ち上がり係数：yearIndex が i 以下で最大の設定。なければ 1', () => {
    const t = [
      { yearIndex: 1, factor: 0.5 },
      { yearIndex: 3, factor: 0.9 },
    ]
    expect([0, 1, 2, 3, 9].map((i) => rampUpFactor(t, i))).toEqual([1, 0.5, 0.5, 0.9, 0.9])
    expect(rampUpFactor([], 4)).toBe(1)
  })
  it('係数の上書き：キーが正しくないものは使わず、報告する', () => {
    const base = coefFile.values['1']
    const r = applyOverrides(base, [
      { key: 'outingRate.holiday.15-29', value: 0.1, source: 'a' },
      { key: 'foo', value: 1, source: 'b' },
      { key: 'busShare.weekday.99', value: 1, source: 'c' },
    ])
    expect(r.applied).toEqual(['outingRate.holiday.15-29'])
    expect(r.ignored).toEqual(['foo', 'busShare.weekday.99'])
    expect(r.coefficients.holiday['15-29'].outingRate).toBe(0.1)
    expect(base.holiday['15-29'].outingRate).not.toBe(0.1) // 元の係数は変えない
  })
  it('createScenario の初期値は、立ち上がり・弾力性とも効かない設定', () => {
    const s = createScenario('x', defaults)
    expect(s.coefficients.fareElasticity).toBe(0)
    expect(s.coefficients.rampUp).toEqual([])
  })
})

describe('楽観・悲観シナリオ', () => {
  it('元のシナリオの入力を引き継ぎ、住民の需要だけを±%する。元を変えると反映される', () => {
    const { project, sc, data } = setup()
    const opt = {
      ...structuredClone(sc),
      id: 'opt',
      name: '楽観',
      type: 'optimistic' as const,
      derivedFrom: { scenarioId: sc.id, adjustPercent: 10 },
      stops: [],
    }
    project.scenarios.push(opt)
    const base = runScenario(project, sc, data)
    const r = runScenario(project, resolveDerived(project, opt), data)
    expect(r.scenarioName).toBe('楽観')
    expect(r.demand[0].totalAnnual).toBeCloseTo(base.demand[0].totalAnnual * 1.1, 6)
    // 元の運賃を変えると、楽観シナリオの収入にも反映される
    sc.fare.flatFare = 300
    const r2 = runScenario(project, resolveDerived(project, opt), data)
    expect(r2.revenue[0].fareRevenue).toBeCloseTo(r2.demand[0].totalAnnual * 300, 4)
  })
  it('元がなければ、そのシナリオ自身の入力を使う', () => {
    const { project, sc } = setup()
    const orphan = { ...sc, derivedFrom: { scenarioId: 'none', adjustPercent: 5 } }
    expect(resolveDerived(project, orphan)).toBe(orphan)
  })
})

describe('バス停別の年間延べ乗車人員', () => {
  it('住民分の合計と一致する（バス停1つなら、住民分＝そのバス停）。頭打ちも反映する', () => {
    const { project, sc, data } = setup((s) => {
      s.service.vehicle = {
        ...s.service.vehicle,
        capacity: 10,
        operatorOnBoard: false,
        standingAllowed: true,
      }
      s.service.weekdayTrips = 1
      s.service.holidayTrips = 1
    })
    const r = runScenario(project, sc, data)
    expect(stopAnnualRiders(r.demand[0], 's1')).toBeCloseTo(r.demand[0].residentsAnnual, 6)
    expect(stopAnnualRiders(r.demand[0], 'none')).toBe(0)
  })
})

describe('路線捕捉率（確認事項 Q5）', () => {
  // バス停の約90m先に既存バス停がある
  const existing = [
    { id: 'e1', name: '既存A', operator: '既存バス', lng: center.lng + 0.001, lat: center.lat },
  ]
  const cap = (r: ReturnType<typeof runScenario>) => r.captures[0]

  it('勢圏に既存バス停があり、設定がないあいだは「未設定」と警告し、計算は1.0', () => {
    const { project, sc, data } = setup((s) => (s.stops[0].catchmentM = 300))
    const withStops = runScenario(project, sc, { ...data, existingStops: existing })
    const without = runScenario(project, sc, data)
    expect(cap(withStops)).toMatchObject({ status: 'unset', weekday: 1, holiday: 1 })
    expect(withStops.warnings.some((x) => x.includes('路線捕捉率 未設定'))).toBe(true)
    expect(withStops.demand[0].totalAnnual).toBe(without.demand[0].totalAnnual)
  })

  it('重ならないバス停は1.0で、警告しない', () => {
    const { project, sc, data } = setup((s) => (s.stops[0].catchmentM = 50))
    const r = runScenario(project, sc, { ...data, existingStops: existing })
    expect(cap(r).status).toBe('none')
    expect(r.warnings.some((x) => x.includes('路線捕捉率 未設定'))).toBe(false)
  })

  it('便数を入力して按分：本路線÷（本路線＋既存路線）を、平日と土休日で別々に', () => {
    const { project, sc, data } = setup((s) => {
      s.service.weekdayTrips = 20
      s.service.holidayTrips = 10
      s.stopCapture = [
        {
          stopId: 's1',
          mode: 'trips',
          existingWeekdayTrips: 60,
          existingHolidayTrips: 10,
          rate: 0,
        },
      ]
    })
    const r = runScenario(project, sc, { ...data, existingStops: existing })
    expect(cap(r).weekday).toBeCloseTo(20 / 80, 12) // 0.25
    expect(cap(r).holiday).toBeCloseTo(10 / 20, 12) // 0.5
    // 平日は25%、土休日は50%で計算される
    const expected = daily('weekday') * 0.25 * 245 + daily('holiday') * 0.5 * 120
    expect(r.demand[0].totalAnnual).toBeCloseTo(expected, 6)
    expect(r.warnings.some((x) => x.includes('路線捕捉率 未設定'))).toBe(false)
  })

  it('捕捉率を直接入力：平日も土休日も同じ値で計算する', () => {
    const { project, sc, data } = setup((s) => {
      s.stopCapture = [
        {
          stopId: 's1',
          mode: 'direct',
          existingWeekdayTrips: 0,
          existingHolidayTrips: 0,
          rate: 0.4,
        },
      ]
    })
    const r = runScenario(project, sc, { ...data, existingStops: existing })
    expect(cap(r)).toMatchObject({ status: 'direct', weekday: 0.4, holiday: 0.4 })
    expect(r.demand[0].totalAnnual).toBeCloseTo(
      0.4 * (daily('weekday') * 245 + daily('holiday') * 120),
      6,
    )
  })

  it('全体の手入力（一律の捕捉率）があれば、未設定にならない。バス停ごとの設定が優先', () => {
    const { project, sc, data } = setup((s) => {
      s.coefficients.routeCaptureOverride = 0.5
    })
    const r = runScenario(project, sc, { ...data, existingStops: existing })
    expect(cap(r)).toMatchObject({ status: 'global', weekday: 0.5 })
    sc.stopCapture = [
      { stopId: 's1', mode: 'direct', existingWeekdayTrips: 0, existingHolidayTrips: 0, rate: 0.2 },
    ]
    expect(cap(runScenario(project, sc, { ...data, existingStops: existing }))).toMatchObject({
      status: 'direct',
      weekday: 0.2,
    })
  })

  it('既存バス停から採用したバス停は、その既存バス停自身では「重なり」にならない', () => {
    const { project, sc, data } = setup((s) => (s.stops[0].existingStopId = 'e1'))
    const r = runScenario(project, sc, {
      ...data,
      existingStops: [{ id: 'e1', name: '自分', operator: 'X', lng: center.lng, lat: center.lat }],
    })
    expect(cap(r).status).toBe('none')
  })
})

describe('車両の定員（確認事項 Q7）', () => {
  it('定員が「要確認」の値のとき、頭打ちの警告に併記する。輸送力は途中の入れ替わりを見込まない旨も', () => {
    const { project, sc, data } = setup((s) => {
      s.service.vehicle = {
        ...s.service.vehicle,
        capacity: 11,
        operatorOnBoard: false,
        standingAllowed: true,
        unverified: ['capacity'],
      }
      s.service.weekdayTrips = 1
      s.service.holidayTrips = 1
    })
    const w = runScenario(project, sc, data).warnings.find((x) => x.includes('頭打ち'))
    expect(w).toContain('要確認')
    expect(w).toContain('入れ替わる')
  })
})
