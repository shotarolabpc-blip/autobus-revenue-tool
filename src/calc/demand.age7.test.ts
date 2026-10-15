/**
 * 年齢区分を調査の7区分にした需要推計（Q3：B、2026-10-15 決定）のテスト。
 * 区分ごとの「外出率×トリップ数×バス分担率」を、そのまま区分の人口に掛けて足し合わせる。
 */
import { describe, expect, it } from 'vitest'
import { AGE_CLASSES_7, expandAgeMix, groupPopulation, type Mix4 } from './ageClasses'
import { computeDemand, interpolatePop, type Coefficients, type DemandInput } from './demand'

/** 1つのバス停が、1つの集計単位（メッシュ）の人口を全部使う（按分率1）ごく小さな例 */
const weights = new Map([['S', new Map([['U', 1]])]])
const pop2025 = [10, 20, 100, 200, 100, 50, 40]
const pop2030 = [10, 20, 100, 160, 100, 60, 50]

/** 1人1日あたり＝外出率×2×0.05。区分ごとの外出率だけを変える（0-4歳は外出率0＝数えない設定） */
const outing = [0, 0.9, 0.8, 0.7, 0.8, 0.7, 0.6]
function coefficients(): Coefficients {
  const make = (k: number) =>
    Object.fromEntries(
      AGE_CLASSES_7.map((a, i) => [a, { outingRate: outing[i] * k, tripRate: 2, busShare: 0.05 }]),
    )
  return { weekday: make(1), holiday: make(0.5) }
}

function input(over: Partial<DemandInput> = {}): DemandInput {
  return {
    fiscalYears: [2027],
    ageClasses: AGE_CLASSES_7,
    stopIds: ['S'],
    weights,
    population: { years: [2025, 2030], units: new Map([['U', [pop2025, pop2030]]]) },
    coefficients: coefficients(),
    captureRate: 1,
    serviceFactor: 1,
    fareFactor: 1,
    rampUp: () => 1,
    areaAdjustPctPerYear: 0,
    developments: [],
    facilities: [],
    days: () => ({ weekday: 245, holiday: 120 }),
    dailyCapacity: { weekday: null, holiday: null },
    ...over,
  }
}

describe('7区分の需要推計（手計算）', () => {
  it('2027年の人口は、2025年から2030年の 2/5 の位置', () => {
    // 30-49歳：200 → 160、65-74歳：50 → 60、75+：40 → 50
    expect(interpolatePop([2025, 2030], [pop2025, pop2030], 2027)).toEqual([
      10, 20, 100, 184, 100, 54, 44,
    ])
  })

  it('区分ごとの係数をそのまま掛けて足し合わせた値になる（平日37.1人/日・休日18.55人/日・年間11,315.5人）', () => {
    const [y] = computeDemand(input())
    // 平日：0×10 ＋ 20×0.09 ＋ 100×0.08 ＋ 184×0.07 ＋ 100×0.08 ＋ 54×0.07 ＋ 44×0.06
    //     ＝ 0 ＋ 1.8 ＋ 8 ＋ 12.88 ＋ 8 ＋ 3.78 ＋ 2.64 ＝ 37.1
    expect(y.dailyBase.weekday).toBeCloseTo(37.1, 9)
    expect(y.dailyBase.holiday).toBeCloseTo(18.55, 9)
    // 年間：37.1×245 ＋ 18.55×120 ＝ 9089.5 ＋ 2226
    expect(y.totalAnnual).toBeCloseTo(11315.5, 6)
  })

  it('内訳は区分ごとに返り、0〜4歳は外出率0なので数えない', () => {
    const [y] = computeDemand(input())
    const weekday = y.terms.filter((t) => t.dayType === 'weekday')
    expect(weekday.map((t) => t.age)).toEqual([...AGE_CLASSES_7])
    expect(weekday[0].dailyBase).toBe(0)
    const c3049 = weekday.find((t) => t.age === '30-49')!
    expect(c3049.population).toBeCloseTo(184, 9)
    expect(c3049.outingRate).toBe(0.7)
    expect(c3049.dailyBase).toBeCloseTo(184 * 0.7 * 2 * 0.05, 9)
  })

  it('15-29・30-49・50-64歳を、別々の係数で計算する（平均した係数とは違う値になる）', () => {
    const [y] = computeDemand(input())
    // 平均した係数（0.8, 0.7, 0.8 の単純平均）で、15-64歳の人口（100+184+100＝384人）に掛けた場合
    const meanOuting = (0.8 + 0.7 + 0.8) / 3
    const viaMean = 384 * meanOuting * 2 * 0.05
    const direct = 100 * 0.08 + 184 * 0.07 + 100 * 0.08
    expect(direct).toBeCloseTo(28.88, 9)
    expect(viaMean).not.toBeCloseTo(direct, 2)
    const sub = y.terms
      .filter((t) => t.dayType === 'weekday' && ['15-29', '30-49', '50-64'].includes(t.age))
      .reduce((a, t) => a + t.dailyBase, 0)
    expect(sub).toBeCloseTo(direct, 9)
  })

  it('3区分の係数が同じなら、15-64歳を1つにまとめた4区分の計算と一致する', () => {
    const same = AGE_CLASSES_7.map((a) => a)
    const coef7: Coefficients = { weekday: {}, holiday: {} }
    for (const day of ['weekday', 'holiday'] as const) {
      for (const a of same) {
        const g = ['15-29', '30-49', '50-64'].includes(a)
        const k = day === 'holiday' ? 0.5 : 1
        coef7[day][a] = {
          outingRate: (g ? 0.8 : outing[same.indexOf(a)]) * k,
          tripRate: 2,
          busShare: 0.05,
        }
      }
    }
    const r7 = computeDemand(input({ coefficients: coef7 }))[0]
    // 4区分：0-14（0-4＋5-14）、15-64、65-74、75+
    const p = (arr: number[]) => [arr[0] + arr[1], arr[2] + arr[3] + arr[4], arr[5], arr[6]]
    const coef4: Coefficients = {
      weekday: {
        '0-14': { outingRate: 0.9, tripRate: 2, busShare: 0.05 },
        '15-64': { outingRate: 0.8, tripRate: 2, busShare: 0.05 },
        '65-74': { outingRate: 0.7, tripRate: 2, busShare: 0.05 },
        '75+': { outingRate: 0.6, tripRate: 2, busShare: 0.05 },
      },
      holiday: {},
    }
    coef4.holiday = Object.fromEntries(
      Object.entries(coef4.weekday).map(([k, v]) => [k, { ...v, outingRate: v.outingRate * 0.5 }]),
    )
    // 0-4歳は外出率0なので、0-14歳の4区分の計算では5-14歳の人口だけを使う（0-4の分を引く）
    const r4 = computeDemand({
      ...input({ coefficients: coef4 }),
      ageClasses: ['0-14', '15-64', '65-74', '75+'],
      population: {
        years: [2025, 2030],
        units: new Map([['U', [p([0, ...pop2025.slice(1)]), p([0, ...pop2030.slice(1)])]]]),
      },
    })[0]
    expect(r7.totalAnnual).toBeCloseTo(r4.totalAnnual, 6)
  })

  it('エリア全体の人口補正率・路線捕捉率は、全区分に同じように掛かる', () => {
    const base = computeDemand(input({ fiscalYears: [2027, 2028] }))
    const adj = computeDemand(
      input({ fiscalYears: [2027, 2028], areaAdjustPctPerYear: -10, captureRate: 0.5 }),
    )
    expect(adj[0].totalAnnual).toBeCloseTo(base[0].totalAnnual * 0.5, 6)
    expect(adj[1].totalAnnual).toBeCloseTo(base[1].totalAnnual * 0.5 * 0.9, 6)
  })
})

describe('開発計画の年齢構成（4階層の入力 → 7区分）', () => {
  const mix = (m: Partial<Mix4>): Mix4 => ({ '0-14': 0, '15-64': 0, '65-74': 0, '75+': 0, ...m })

  it('各階層の割合を、その階層の中の区分に、勢圏の年齢構成の比で分ける', () => {
    // 基準：15-29＝100、30-49＝200、50-64＝100 → 15-64歳の割合1を 25%・50%・25% に分ける
    const m = expandAgeMix(mix({ '15-64': 1 }), [10, 20, 100, 200, 100, 50, 40])
    expect(m).toEqual([0, 0, 0.25, 0.5, 0.25, 0, 0])
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('0-14歳の階層は 0-4歳と5-14歳に、基準の人口の比で分ける。基準が0なら均等', () => {
    const m = expandAgeMix(mix({ '0-14': 0.3, '75+': 0.7 }), [10, 30, 0, 0, 0, 0, 5])
    ;[0.075, 0.225, 0, 0, 0, 0, 0.7].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 12))
    const eq = expandAgeMix(mix({ '15-64': 0.6 }), [0, 0, 0, 0, 0, 0, 0])
    ;[0, 0, 0.2, 0.2, 0.2, 0, 0].forEach((v, k) => expect(eq[k]).toBeCloseTo(v, 12))
  })

  it('開発計画の人数が、年齢構成どおりに勢圏人口へ加わる（15-64歳だけ100人）', () => {
    const m = expandAgeMix(mix({ '15-64': 1 }), pop2027())
    const [y] = computeDemand(
      input({
        developments: [
          {
            stopShares: new Map([['S', 1]]),
            people: 100,
            startFiscalYear: 2027,
            phaseYears: 1,
            ageMix: m,
          },
        ],
      }),
    )
    const dev = y.stops[0].development
    expect(dev[2]).toBeCloseTo(100 * (100 / 384), 9)
    expect(dev[3]).toBeCloseTo(100 * (184 / 384), 9)
    expect(dev[4]).toBeCloseTo(100 * (100 / 384), 9)
    expect(dev[0] + dev[1] + dev[5] + dev[6]).toBe(0)
  })

  function pop2027(): number[] {
    return interpolatePop([2025, 2030], [pop2025, pop2030], 2027)
  }
})

describe('4階層にまとめる（画面の表示用）', () => {
  it('7区分の人口を、0-14／15-64／65-74／75+ にまとめる', () => {
    expect(groupPopulation([10, 20, 100, 184, 100, 54, 44])).toEqual({
      '0-14': 30,
      '15-64': 384,
      '65-74': 54,
      '75+': 44,
    })
  })
})
