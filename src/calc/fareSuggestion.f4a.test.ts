/**
 * 運賃の目安（F-4A）のテスト：種別ごとの標準、強調する種別、協議運賃、弾力性0の警告、参考データの古さ。
 */
import { describe, expect, it } from 'vitest'
import {
  COUNCIL_FARE_NOTE,
  ELASTICITY_ZERO_WARNING,
  fareWarnings,
  highFareWithZeroElasticity,
  highTitle,
  isStale,
  localDateIso,
  staleReferences,
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

const run = (rs: FareReference[]) =>
  suggestFares({ refs: rs, prefCode: '13', cityCode: null, fareType: 'flat', userUpperLimit: null })

describe('種別ごとの「標準」（F-4A-1）', () => {
  const byCat: FareReference[] = [
    ref({ id: 'c1', category: 'community', flatFare: 100 }),
    ref({ id: 'c2', category: 'community', flatFare: 100 }),
    ref({ id: 'c3', category: 'community', flatFare: 120 }),
    ref({ id: 'c4', category: 'community', flatFare: 130 }),
    ref({ id: 'r1', category: 'route', flatFare: 210 }),
    ref({ id: 'r2', category: 'route', flatFare: 230 }),
    ref({ id: 'r3', category: 'route', flatFare: 230 }),
    ref({ id: 'au', category: 'autonomous', flatFare: 190 }),
  ]

  it('種別ごとに、中央値・件数・最小〜最大を返す（表示順はコミュニティバス・路線バス・自動運転バス）', () => {
    const r = run(byCat)
    expect(r.standards.map((x) => x.category)).toEqual(['community', 'route', 'autonomous'])
    expect(r.standards[0].count).toBe(4)
    expect(r.standards[0].suggestion.range).toEqual({ min: 100, max: 130 })
    expect(r.standards[1].count).toBe(3)
    expect(r.standards[1].suggestion.flatFare).toBe(230) // 210・230・230 の中央値
    expect(r.standards[1].suggestion.range).toEqual({ min: 210, max: 230 })
    expect(r.standards[2].suggestion.flatFare).toBe(190)
  })

  it('件数が偶数のときは、中央の2つの平均（100・100・120・130 → (100+120)/2 ＝ 110円）', () => {
    expect(run(byCat).standards[0].suggestion.flatFare).toBe(110)
  })

  it('平均が10円単位でないときは四捨五入（210・225 → 217.5 → 220、100・105 → 102.5 → 100）', () => {
    expect(
      run([ref({ id: 'a', flatFare: 210 }), ref({ id: 'b', flatFare: 225 })]).standard?.flatFare,
    ).toBe(220)
    expect(
      run([ref({ id: 'a', flatFare: 100 }), ref({ id: 'b', flatFare: 105 })]).standard?.flatFare,
    ).toBe(100)
  })

  it('既定で強調するのはコミュニティバス。標準（運賃欄に反映する値）もそれ', () => {
    const r = run(byCat)
    expect(r.emphasized).toBe('community')
    expect(r.emphasisReason).toBe('')
    expect(r.standard?.flatFare).toBe(110)
    expect(r.missingCategories).toEqual([])
  })

  it('コミュニティバスのデータがないときは、件数の多い種別に切り替え、理由を返す', () => {
    const r = run(byCat.filter((x) => x.category !== 'community'))
    expect(r.emphasized).toBe('route')
    expect(r.emphasisReason).toContain('コミュニティバスの')
    expect(r.emphasisReason).toContain('路線バス')
    expect(r.emphasisReason).toContain('3件')
    expect(r.missingCategories).toEqual(['community'])
    expect(r.standard?.flatFare).toBe(230)
  })

  it('強調する種別は件数で決まる（路線バス1件・自動運転バス2件 → 自動運転バス）。同数なら表示順で先のもの', () => {
    const r = run([
      ref({ id: 'r', category: 'route', flatFare: 230 }),
      ref({ id: 'a1', category: 'autonomous', flatFare: 190 }),
      ref({ id: 'a2', category: 'autonomous', flatFare: 200 }),
    ])
    expect(r.emphasized).toBe('autonomous')
    const tie = run([
      ref({ id: 'r', category: 'route', flatFare: 230 }),
      ref({ id: 'a', category: 'autonomous', flatFare: 190 }),
    ])
    expect(tie.emphasized).toBe('route')
  })

  it('標準が1つも出せないときは、強調なし・理由つき（値を推測で補わない）', () => {
    const r = run([])
    expect(r.standards).toEqual([])
    expect(r.emphasized).toBeNull()
    expect(r.standard).toBeNull()
    expect(r.messages.join()).toContain('「標準」は提案できません')
  })

  it('対キロ区間制でも種別ごとに出る（初乗り運賃と賃率の中央値）', () => {
    const r = suggestFares({
      refs: [
        ref({ id: 'a', fareType: 'distance', baseFare: 180, ratePerKm: 40 }),
        ref({ id: 'b', fareType: 'distance', baseFare: 200, ratePerKm: 50 }),
        ref({ id: 'c', fareType: 'distance', category: 'community', baseFare: 100, ratePerKm: 20 }),
      ],
      prefCode: '13',
      cityCode: null,
      fareType: 'distance',
      userUpperLimit: null,
    })
    expect(r.emphasized).toBe('community')
    expect(r.standards.find((x) => x.category === 'route')?.suggestion).toMatchObject({
      baseFare: 190,
      ratePerKm: 45,
    })
  })
})

describe('協議運賃のとき（F-4A-3、F-4-8）', () => {
  const upper: UpperLimit = { flatFare: 200, baseFare: null, ratePerKm: null, source: 'テスト' }
  const fare = { type: 'flat' as const, flatFare: 250, baseFare: 0, ratePerKm: 0 }

  it('上限運賃を超えていても、警告は出さない（実施運賃のときは出す）', () => {
    expect(upperLimitWarnings(fare, upper, '協議運賃')).toEqual([])
    expect(upperLimitWarnings(fare, upper, '実施運賃')).toHaveLength(1)
    expect(upperLimitWarnings(fare, upper)).toHaveLength(1) // 省略時は実施運賃
  })

  it('「標準が上限を超えている」という注意も出さない', () => {
    const refs = [
      ref({ id: 'm', flatFare: 230 }),
      ref({ id: 'u', kind: 'upperLimit', flatFare: 200 }),
    ]
    const base = {
      refs,
      prefCode: '13',
      cityCode: null,
      fareType: 'flat' as const,
      userUpperLimit: null,
    }
    expect(suggestFares({ ...base, system: '実施運賃' }).messages.join()).toContain(
      '上限運賃を超えています',
    )
    expect(suggestFares({ ...base, system: '協議運賃' }).messages.join()).not.toContain(
      '上限運賃を超えています',
    )
  })

  it('「高め」の見出しは「参考：周辺の路線バスの上限運賃」に変わり、説明文がある。実施運賃のときは今のまま', () => {
    expect(highTitle('実施運賃')).toBe('高め')
    expect(highTitle('協議運賃')).toBe('参考：周辺の路線バスの上限運賃')
    expect(COUNCIL_FARE_NOTE).toContain('上限運賃の縛りを受けません')
  })

  it('運賃の警告の一覧でも、協議運賃なら上限超過は出ない', () => {
    const f = { ...fare, system: '協議運賃' as const, upperLimit: upper }
    expect(fareWarnings({ fare: f, high: null, elasticity: 0 })).toEqual([])
    expect(
      fareWarnings({ fare: { ...f, system: '実施運賃' as const }, high: null, elasticity: 0 }),
    ).toHaveLength(1)
  })
})

describe('「高め」を反映したときの運賃弾力性0の警告（F-4A-4）', () => {
  const high = {
    fareType: 'flat' as const,
    flatFare: 250,
    baseFare: null,
    ratePerKm: null,
    basis: '',
    references: [],
    range: null,
  }
  const flat = (flatFare: number) => ({
    type: 'flat' as const,
    flatFare,
    baseFare: 0,
    ratePerKm: 0,
  })

  it('運賃が「高め」以上で、弾力性が0なら警告。弾力性が0でなければ出ない', () => {
    expect(highFareWithZeroElasticity({ fare: flat(250), high, elasticity: 0 })).toBe(true)
    expect(highFareWithZeroElasticity({ fare: flat(260), high, elasticity: 0 })).toBe(true)
    expect(highFareWithZeroElasticity({ fare: flat(250), high, elasticity: 0.3 })).toBe(false)
    expect(highFareWithZeroElasticity({ fare: flat(250), high, elasticity: -0.3 })).toBe(false)
  })

  it('標準と高めの間の運賃（高めより低い運賃）や、目安がない場合は出ない（要件 F-4A-4 は「高め」以上のときだけ）', () => {
    expect(highFareWithZeroElasticity({ fare: flat(249), high, elasticity: 0 })).toBe(false)
    expect(
      highFareWithZeroElasticity({ fare: flat(0), high: { ...high, flatFare: 0 }, elasticity: 0 }),
    ).toBe(false)
    expect(highFareWithZeroElasticity({ fare: flat(300), high: null, elasticity: 0 })).toBe(false)
  })

  it('対キロ区間制：初乗り運賃も賃率も「高め」以上のときだけ警告。片方だけ高い場合は出ない', () => {
    const h = {
      ...high,
      fareType: 'distance' as const,
      flatFare: null,
      baseFare: 240,
      ratePerKm: 35,
    }
    const d = (baseFare: number, ratePerKm: number) => ({
      type: 'distance' as const,
      flatFare: 0,
      baseFare,
      ratePerKm,
    })
    expect(highFareWithZeroElasticity({ fare: d(240, 35), high: h, elasticity: 0 })).toBe(true)
    expect(highFareWithZeroElasticity({ fare: d(240, 34), high: h, elasticity: 0 })).toBe(false)
    expect(highFareWithZeroElasticity({ fare: d(230, 40), high: h, elasticity: 0 })).toBe(false)
    // 制定形態が違う（均一制の運賃に、対キロ区間制の高め）は判定しない
    expect(highFareWithZeroElasticity({ fare: flat(300), high: h, elasticity: 0 })).toBe(false)
  })

  it('運賃の警告の一覧に、弾力性0の警告（画面と出力物で同じ文言）が入る。協議運賃でも入る', () => {
    const f = { ...flat(250), system: '協議運賃' as const, upperLimit: null }
    expect(fareWarnings({ fare: f, high, elasticity: 0 })).toEqual([ELASTICITY_ZERO_WARNING])
    expect(ELASTICITY_ZERO_WARNING).toContain('利用者が減らない計算になっています')
    expect(fareWarnings({ fare: f, high, elasticity: 0.2 })).toEqual([])
  })
})

describe('参考データの古さ（確認日から1年以上）', () => {
  it('確認日のちょうど1年後の日から「古い」。前日までは古くない（境界）', () => {
    expect(isStale('2026-10-14', '2027-10-13')).toBe(false)
    expect(isStale('2026-10-14', '2027-10-14')).toBe(true)
    expect(isStale('2026-10-14', '2027-10-15')).toBe(true)
    expect(isStale('2026-10-14', '2026-10-14')).toBe(false)
  })

  it('年をまたぐ境界', () => {
    expect(isStale('2026-12-31', '2027-12-30')).toBe(false)
    expect(isStale('2026-12-31', '2027-12-31')).toBe(true)
    expect(isStale('2026-01-01', '2026-12-31')).toBe(false)
    expect(isStale('2026-01-01', '2027-01-01')).toBe(true)
  })

  it('うるう日（2月29日）の確認日は、翌年の3月1日から古い', () => {
    expect(isStale('2028-02-29', '2029-02-28')).toBe(false)
    expect(isStale('2028-02-29', '2029-03-01')).toBe(true)
  })

  it('確認日が読めない値は、古いものとして扱う', () => {
    expect(isStale('不明', '2026-10-14')).toBe(true)
  })

  it('今日の日付は、その場所の暦（ブラウザの日付）で作る', () => {
    expect(localDateIso(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14')
    expect(localDateIso(new Date(2027, 0, 5, 0, 0))).toBe('2027-01-05')
  })

  it('古い可能性がある参考データだけを選ぶ', () => {
    const old = ref({ id: 'old', source: { ...src, checkedAt: '2025-10-01' } })
    const fresh = ref({ id: 'fresh', source: { ...src, checkedAt: '2026-09-01' } })
    expect(staleReferences([old, fresh], '2026-10-14').map((r) => r.id)).toEqual(['old'])
  })
})
