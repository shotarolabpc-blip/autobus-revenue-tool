import { describe, expect, it } from 'vitest'
import {
  refsForArea,
  suggestFares,
  upperLimitWarnings,
  type FareReference,
  type UpperLimit,
} from './fareSuggestion'

const src = { title: 'テスト', url: 'https://example.com/', checkedAt: '2026-10-14' }
const ref = (o: Partial<FareReference> & Pick<FareReference, 'id'>): FareReference => ({
  kind: 'market',
  category: 'route',
  prefCode: '13',
  cityCodes: null,
  operator: o.id,
  fareType: 'flat',
  flatFare: null,
  baseFare: null,
  ratePerKm: null,
  source: src,
  ...o,
})

const refs: FareReference[] = [
  ref({ id: 'a', flatFare: 210 }),
  ref({ id: 'b', flatFare: 100, cityCodes: ['13113'] }), // 渋谷区のコミュニティバス
  ref({ id: 'c', flatFare: 220 }),
  ref({ id: 'd', flatFare: 100, prefCode: '14' }), // ほかの県
  ref({ id: 'e', fareType: 'distance', baseFare: 180, ratePerKm: 40 }),
  ref({ id: 'f', fareType: 'distance', baseFare: 200, ratePerKm: 50 }),
  ref({ id: 'g', fareType: 'distance', baseFare: 220, ratePerKm: 60 }),
  ref({ id: 'u1', kind: 'upperLimit', flatFare: 230 }),
  ref({ id: 'u2', kind: 'upperLimit', flatFare: 250 }),
  ref({ id: 'u3', kind: 'upperLimit', fareType: 'distance', baseFare: 230, ratePerKm: 80 }),
]

describe('参考データの絞り込み', () => {
  it('都道府県全体のものと、その市区町村のものだけを使う（ほかの県・ほかの市区町村は使わない）', () => {
    expect(
      refsForArea(refs, '13', '13113')
        .map((r) => r.id)
        .slice(0, 3),
    ).toEqual(['a', 'b', 'c'])
    expect(refsForArea(refs, '13', '13101').map((r) => r.id)).not.toContain('b')
    expect(refsForArea(refs, '13', null).map((r) => r.id)).not.toContain('b')
    expect(refsForArea(refs, '13', null).map((r) => r.id)).not.toContain('d')
  })
})

describe('「標準」＝相場の中央値', () => {
  it('均一制：地域に当てはまる運賃の中央値（10円単位）と、最小・最大、もとにした参考データ', () => {
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'flat',
      userUpperLimit: null,
    })
    // 210・220 の中央値 215 → 10円単位に四捨五入 220
    expect(r.standard?.flatFare).toBe(220)
    expect(r.standard?.range).toEqual({ min: 210, max: 220 })
    expect(r.standard?.references.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('市区町村の参考データがある地域では、それも含めて中央値をとる（100・210・220 → 210）', () => {
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: '13113',
      fareType: 'flat',
      userUpperLimit: null,
    })
    expect(r.standard?.flatFare).toBe(210)
    expect(r.standard?.range).toEqual({ min: 100, max: 220 })
  })

  it('対キロ区間制：初乗り運賃と賃率それぞれの中央値', () => {
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'distance',
      userUpperLimit: null,
    })
    expect(r.standard).toMatchObject({ baseFare: 200, ratePerKm: 50, flatFare: null })
  })

  it('参考データがない地域・制定形態は、提案せずに理由を返す（数値を推測で入れない）', () => {
    const r = suggestFares({
      refs,
      prefCode: '27',
      cityCode: null,
      fareType: 'flat',
      userUpperLimit: null,
    })
    expect(r.standard).toBeNull()
    expect(r.high).toBeNull()
    expect(r.messages.join()).toContain('「標準」は提案できません')
    expect(r.messages.join()).toContain('「高め」は提案できません')
  })
})

describe('「高め」＝上限運賃', () => {
  it('参考データの上限運賃のうち、最も高い額', () => {
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'flat',
      userUpperLimit: null,
    })
    expect(r.high?.flatFare).toBe(250)
    const d = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'distance',
      userUpperLimit: null,
    })
    expect(d.high).toMatchObject({ baseFare: 230, ratePerKm: 80 })
  })

  it('対キロ区間制：複数の事業者の最大値を混ぜず、初乗り運賃が最も高い事業者の認可額をそのまま使う', () => {
    const two = [
      ref({
        id: 'x',
        kind: 'upperLimit',
        fareType: 'distance',
        baseFare: 230,
        ratePerKm: 46.1,
        operator: 'X社',
      }),
      ref({
        id: 'y',
        kind: 'upperLimit',
        fareType: 'distance',
        baseFare: 240,
        ratePerKm: 35,
        operator: 'Y社',
      }),
    ]
    const r = suggestFares({
      refs: two,
      prefCode: '13',
      cityCode: null,
      fareType: 'distance',
      userUpperLimit: null,
    })
    // 初乗り240・賃率35（Y社）。「初乗り240・賃率46.1」のような、どの事業者にもない組み合わせにしない
    expect(r.high).toMatchObject({ baseFare: 240, ratePerKm: 35 })
    expect(r.high?.references.map((x) => x.id)).toEqual(['y'])
    expect(r.high?.basis).toContain('Y社')
  })

  it('ユーザーが入力した上限運賃（事業者の認可額）を優先する', () => {
    const user: UpperLimit = {
      flatFare: 240,
      baseFare: null,
      ratePerKm: null,
      source: '○○バス 令和7年認可',
    }
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'flat',
      userUpperLimit: user,
    })
    expect(r.high?.flatFare).toBe(240)
    expect(r.high?.basis).toContain('○○バス')
    expect(r.high?.references).toEqual([])
  })

  it('均一制の上限しか入力されていないのに対キロ区間制を選んだ場合は、参考データにフォールバックする', () => {
    const user: UpperLimit = { flatFare: 240, baseFare: null, ratePerKm: null, source: '' }
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'distance',
      userUpperLimit: user,
    })
    expect(r.high?.baseFare).toBe(230)
  })

  it('標準が上限を超えているときは注意を出す', () => {
    const low: UpperLimit = { flatFare: 200, baseFare: null, ratePerKm: null, source: 'テスト' }
    const r = suggestFares({
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'flat',
      userUpperLimit: low,
    })
    expect(r.messages.join()).toContain('上限運賃を超えています')
  })
})

describe('上限運賃の警告', () => {
  const upper: UpperLimit = { flatFare: 230, baseFare: 200, ratePerKm: 50, source: '' }
  it('均一制：上限を超えたら警告、以下なら警告なし', () => {
    expect(
      upperLimitWarnings({ type: 'flat', flatFare: 240, baseFare: 0, ratePerKm: 0 }, upper),
    ).toEqual(['運賃 240円 が、上限運賃 230円 を超えています'])
    expect(
      upperLimitWarnings({ type: 'flat', flatFare: 230, baseFare: 0, ratePerKm: 0 }, upper),
    ).toEqual([])
  })
  it('対キロ区間制：初乗り運賃・賃率それぞれを確かめる', () => {
    const w = upperLimitWarnings(
      { type: 'distance', flatFare: 0, baseFare: 210, ratePerKm: 60 },
      upper,
    )
    expect(w).toHaveLength(2)
    expect(w[0]).toContain('初乗り運賃 210円')
    expect(w[1]).toContain('賃率 60円/km')
  })
  it('上限を入力していなければ警告しない／入力のない項目は確かめない', () => {
    expect(
      upperLimitWarnings({ type: 'flat', flatFare: 999, baseFare: 0, ratePerKm: 0 }, null),
    ).toEqual([])
    const partial: UpperLimit = { flatFare: null, baseFare: null, ratePerKm: null, source: '' }
    expect(
      upperLimitWarnings({ type: 'flat', flatFare: 999, baseFare: 0, ratePerKm: 0 }, partial),
    ).toEqual([])
  })
})
