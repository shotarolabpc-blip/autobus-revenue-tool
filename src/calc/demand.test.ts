import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catchmentWeights, stopForPoint } from '../gis/catchment'
import {
  computeDemand,
  developmentPeople,
  fareFactor,
  interpolatePop,
  type AgePop,
  type Coefficients,
  type DemandInput,
} from './demand'

type Sample = {
  fiscalYears: number[]
  meshes: Record<string, { code: string; pop: Record<string, AgePop> }>
  stops: { id: string; lng: number; lat: number; radiusM: number }[]
  coefficients: Coefficients
  days: { weekday: number; holiday: number }
  expected: {
    circleShareOfMesh: number
    '2027': {
      stopPop: Record<string, AgePop>
      dailyWeekday: number
      dailyHoliday: number
      annual: number
    }
    '2028': { dailyWeekday: number; dailyHoliday: number; annual: number }
  }
}

const sample = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'demand_sample.json'), 'utf8'),
) as Sample

/** 相対誤差 1% 以内（面積は10m格子で数えるため） */
const near = (actual: number, expected: number, tol = 0.01) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * tol + 1e-9)

function sampleInput(over: Partial<DemandInput> = {}): DemandInput {
  const units = Object.values(sample.meshes).map((m) => ({ id: m.code, meshes: [m.code] }))
  const weights = catchmentWeights(sample.stops, units, 5)
  return {
    fiscalYears: sample.fiscalYears,
    stopIds: sample.stops.map((s) => s.id),
    weights,
    population: {
      years: [2025, 2030],
      units: new Map(
        Object.values(sample.meshes).map((m) => [m.code, [m.pop['2025'], m.pop['2030']]]),
      ),
    },
    coefficients: sample.coefficients,
    captureRate: 1,
    serviceFactor: 1,
    fareFactor: 1,
    rampUp: () => 1,
    areaAdjustPctPerYear: 0,
    developments: [],
    facilities: [],
    days: () => sample.days,
    dailyCapacity: { weekday: null, holiday: null },
    ...over,
  }
}

describe('手計算サンプル（バス停3つ・メッシュ2つ）', () => {
  it('勢圏の面積按分：円がメッシュの中に収まるバス停は 円の面積÷メッシュの面積、境界のバス停は半分ずつ', () => {
    const w = sampleInput().weights
    const f = sample.expected.circleShareOfMesh
    near(w.get('A')!.get('533946111')!, f)
    expect(w.get('A')!.has('533946112')).toBe(false)
    near(w.get('B')!.get('533946112')!, f)
    near(w.get('C')!.get('533946111')!, f / 2)
    near(w.get('C')!.get('533946112')!, f / 2)
  })

  it('2027年度：バス停ごとの勢圏人口・1日あたり・年間利用者数が期待値と一致', () => {
    const [y2027, y2028] = computeDemand(sampleInput())
    const e = sample.expected['2027']
    for (const st of y2027.stops) {
      e.stopPop[st.stopId].forEach((v, k) => near(st.pop[k], v))
    }
    near(y2027.dailyRiders.weekday, e.dailyWeekday)
    near(y2027.dailyRiders.holiday, e.dailyHoliday)
    near(y2027.totalAnnual, e.annual)
    near(y2028.totalAnnual, sample.expected['2028'].annual)
  })

  it('内訳（各項）を掛け合わせると合計に一致する', () => {
    const [y] = computeDemand(sampleInput())
    for (const t of y.terms) {
      expect(t.dailyBase).toBeCloseTo(
        t.population * t.outingRate * t.tripRate * t.busShare * t.captureRate,
        10,
      )
    }
    const sumWeekday = y.terms
      .filter((t) => t.dayType === 'weekday')
      .reduce((a, t) => a + t.dailyBase, 0)
    expect(sumWeekday).toBeCloseTo(y.dailyBase.weekday, 10)
  })
})

describe('勢圏が重なる部分は二重計上しない', () => {
  it('同じ位置の2つのバス停は、人口を分け合い合計は1つ分', () => {
    const units = [{ id: '533946111', meshes: ['533946111'] }]
    const one = catchmentWeights(
      [{ id: 'X', lng: 139.765625, lat: 35.6770833, radiusM: 150 }],
      units,
      5,
    )
    const two = catchmentWeights(
      [
        { id: 'X', lng: 139.765625, lat: 35.6770833, radiusM: 150 },
        { id: 'Y', lng: 139.7662, lat: 35.6770833, radiusM: 150 },
      ],
      units,
      5,
    )
    const total = (w: Map<string, Map<string, number>>) =>
      [...w.values()].reduce((a, m) => a + (m.get('533946111') ?? 0), 0)
    // 2つの円の和集合は1つの円より大きいが、重なりの分は1回しか数えない
    expect(total(two)).toBeGreaterThan(total(one))
    expect(total(two)).toBeLessThan(2 * total(one))
  })

  it('秘匿・合算をまとめた集計単位は、構成メッシュに均等に分布するとみなす', () => {
    const merged = [{ id: 'U', meshes: ['533946111', '533946112'] }]
    const w = catchmentWeights(
      [{ id: 'A', lng: 139.765625, lat: 35.6770833, radiusM: 100 }],
      merged,
      5,
    )
    near(w.get('A')!.get('U')!, sample.expected.circleShareOfMesh / 2)
  })
})

describe('補正・頭打ち', () => {
  it('5年刻みの人口を年次で線形補間する', () => {
    expect(
      interpolatePop(
        [2025, 2030],
        [
          [100, 0, 0, 0],
          [50, 0, 0, 0],
        ],
        2027,
      ),
    ).toEqual([80, 0, 0, 0])
    expect(
      interpolatePop(
        [2025, 2030],
        [
          [100, 0, 0, 0],
          [50, 0, 0, 0],
        ],
        2040,
      ),
    ).toEqual([50, 0, 0, 0])
  })

  it('輸送力を超える需要は輸送力で頭打ちにし、印を付ける', () => {
    const [y] = computeDemand(sampleInput({ dailyCapacity: { weekday: 30, holiday: null } }))
    expect(y.capped.weekday).toBe(true)
    expect(y.dailyRiders.weekday).toBe(30)
    expect(y.capped.holiday).toBe(false)
    near(y.totalAnnual, 30 * 245 + sample.expected['2027'].dailyHoliday * 120)
  })

  it('補正係数（サービス・運賃・立ち上がり）は掛け算で効く', () => {
    const base = computeDemand(sampleInput())[0].totalAnnual
    const adj = computeDemand(
      sampleInput({ serviceFactor: 0.8, fareFactor: 0.9, rampUp: (i) => (i === 0 ? 0.5 : 1) }),
    )
    near(adj[0].totalAnnual, base * 0.8 * 0.9 * 0.5)
  })

  it('運賃弾力性：基準運賃より10%高く、弾力性0.3なら3%減る。既定（0）は補正なし', () => {
    expect(fareFactor(220, 200, 0.3)).toBeCloseTo(0.97)
    expect(fareFactor(220, 200, 0)).toBe(1)
    expect(fareFactor(220, null, 0.3)).toBe(1)
  })

  it('エリア全体の人口補正率（%／年）は開始年度からの複利', () => {
    const [y0, y1] = computeDemand(sampleInput({ areaAdjustPctPerYear: -1 }))
    const [b0, b1] = computeDemand(sampleInput())
    near(y0.totalAnnual, b0.totalAnnual)
    near(y1.totalAnnual, b1.totalAnnual * 0.99)
  })

  it('開発計画：段階入居で年ごとに増え、勢圏に入るバス停の人口に加わる', () => {
    expect(developmentPeople(500, 2027, 3, 2026)).toBe(0)
    expect(developmentPeople(500, 2027, 3, 2027)).toBeCloseTo(166.667, 2)
    expect(developmentPeople(500, 2027, 3, 2029)).toBe(500)
    const stops = sample.stops
    const at = stopForPoint(stops, 139.7657, 35.67709)
    expect(at).toBe('A')
    const [y0] = computeDemand(
      sampleInput({
        developments: [
          {
            stopShares: new Map([['A', 1]]),
            people: 100,
            startFiscalYear: 2027,
            phaseYears: 1,
            ageMix: [0, 1, 0, 0],
          },
        ],
      }),
    )
    const a = y0.stops.find((s) => s.stopId === 'A')!
    expect(a.development).toEqual([0, 100, 0, 0])
    const [b0] = computeDemand(sampleInput())
    // 15-64歳が100人増える：平日 100×0.8×2.5×0.03 = 6人/日
    near(y0.dailyRiders.weekday - b0.dailyRiders.weekday, 6)
  })

  it('施設需要は開始年度から、指定した日種別の運行日数分を加える（補正係数は掛けない）', () => {
    const [y0, y1] = computeDemand(
      sampleInput({
        serviceFactor: 0.5,
        facilities: [{ dailyRiders: 10, startFiscalYear: 2028, days: 'weekday' }],
      }),
    )
    expect(y0.facilityAnnual).toBe(0)
    expect(y1.facilityAnnual).toBe(10 * 245)
  })
})
