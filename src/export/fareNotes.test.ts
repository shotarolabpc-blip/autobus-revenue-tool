import { describe, expect, it } from 'vitest'
import { createProject, createScenario } from '../project/factory'
import { ELASTICITY_ZERO_WARNING, type FareReference } from '../calc/fareSuggestion'
import { fareAssumptionRows, fareAssumptionsCsv, fareSourceEntries } from './fareNotes'
import { fareSuggestionFor } from '../calc/fareInputs'

const defaults = { catchmentM: 300, maxLoadFactor: 1, rampUpFactor: 1, fareElasticity: 0 }
const src = (url: string, checkedAt = '2026-10-14') => ({ title: `資料 ${url}`, url, checkedAt })
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
  source: src('https://example.com/' + o.id),
  ...o,
})

const refs: FareReference[] = [
  ref({ id: 'c1', category: 'community', flatFare: 100 }),
  ref({ id: 'c2', category: 'community', flatFare: 100 }),
  ref({ id: 'r1', flatFare: 230, source: src('https://example.com/shared') }),
  ref({ id: 'r2', flatFare: 240, source: src('https://example.com/shared') }),
  ref({ id: 'u1', kind: 'upperLimit', flatFare: 250 }),
]

function setup(
  over: { system?: '実施運賃' | '協議運賃'; flatFare?: number; elasticity?: number } = {},
) {
  const project = createProject(
    {
      name: '運賃テスト',
      prefCode: '13',
      cityCode: '13113',
      municipalityName: '渋谷区',
      startFiscalYear: 2027,
      years: 10,
    },
    defaults,
  )
  const scenario = createScenario('標準', defaults)
  scenario.fare = {
    ...scenario.fare,
    system: over.system ?? '実施運賃',
    flatFare: over.flatFare ?? 100,
  }
  scenario.coefficients = { ...scenario.coefficients, fareElasticity: over.elasticity ?? 0 }
  return { project, scenario }
}

describe('出典一覧（F-4A-5）', () => {
  it('目安のもとにした参考データの出典URLと確認日を、重複なく返す', () => {
    const { project, scenario } = setup()
    const sources = fareSourceEntries(fareSuggestionFor(project, scenario, refs))
    const urls = sources.map((s) => s.url)
    expect(urls).toContain('https://example.com/shared')
    expect(urls.filter((u) => u === 'https://example.com/shared')).toHaveLength(1)
    expect(urls).toContain('https://example.com/c1')
    expect(urls).toContain('https://example.com/u1') // 「高め」のもとにした上限運賃
    expect(sources.every((s) => s.checkedAt === '2026-10-14')).toBe(true)
  })
})

describe('運賃の前提条件の出力（F-4A-4）', () => {
  it('「高め」の運賃で弾力性が0なら、警告が行・警告欄・CSVに入る', () => {
    const { project, scenario } = setup({ flatFare: 250 })
    const r = fareAssumptionRows(project, scenario, refs, '2026-10-15')
    expect(r.warnings).toEqual([ELASTICITY_ZERO_WARNING])
    expect(r.rows.some((x) => x.item === '注意' && x.value === ELASTICITY_ZERO_WARNING)).toBe(true)
    const csv = fareAssumptionsCsv(project, scenario, refs, '2026-10-15', {
      estimatedAt: '2026-10-15T10:00:00+09:00',
      toolVersion: '0.1.0',
    })
    expect(csv).toContain('利用者が減らない計算になっています')
    expect(csv).toContain('【警告】')
  })

  it('弾力性が0でなければ、警告は出ない', () => {
    const { project, scenario } = setup({ flatFare: 250, elasticity: 0.3 })
    expect(fareAssumptionRows(project, scenario, refs, '2026-10-15').warnings).toEqual([])
  })

  it('標準の運賃（高めより低い）なら警告なし。種別ごとの標準と強調が行に入る', () => {
    const { project, scenario } = setup({ flatFare: 100 })
    const r = fareAssumptionRows(project, scenario, refs, '2026-10-15')
    expect(r.warnings).toEqual([])
    const community = r.rows.find((x) => x.item === '運賃の目安：標準（コミュニティバス）')
    expect(community?.value).toBe('100円（均一）')
    expect(community?.note).toContain('この種別を強調')
    expect(r.rows.find((x) => x.item === '運賃の目安：標準（路線バス）')?.value).toBe(
      '240円（均一）',
    )
    expect(r.rows.find((x) => x.item === '運賃の目安：高め')?.value).toBe('250円（均一）')
  })

  it('協議運賃のときは、「高め」の行の見出しが参考表示になる。上限超過の警告は出ない', () => {
    const { project, scenario } = setup({ system: '協議運賃', flatFare: 999, elasticity: 0.3 })
    scenario.fare.upperLimit = { flatFare: 200, baseFare: null, ratePerKm: null, source: 'テスト' }
    const r = fareAssumptionRows(project, scenario, refs, '2026-10-15')
    expect(r.warnings).toEqual([])
    expect(r.rows.some((x) => x.item === '運賃の目安：参考：周辺の路線バスの上限運賃')).toBe(true)
    expect(r.rows.find((x) => x.item === '上限運賃（ユーザー入力）')?.note).toContain(
      '協議運賃のため',
    )
  })

  it('確認日から1年以上たった参考データがあれば、古い可能性がある旨を注意として載せる', () => {
    const { project, scenario } = setup()
    const old = refs.map((x) =>
      x.id === 'r1' ? { ...x, source: { ...x.source, checkedAt: '2025-10-01' } } : x,
    )
    const r = fareAssumptionRows(project, scenario, old, '2026-10-15')
    const note = r.rows.find((x) => x.item === '注意' && x.value.includes('古い可能性'))
    expect(note?.value).toContain('1件')
    expect(note?.source).toContain('r1')
    // 古くなければ出ない
    expect(
      fareAssumptionRows(project, scenario, refs, '2026-10-15').rows.some((x) =>
        x.value.includes('古い可能性'),
      ),
    ).toBe(false)
  })

  it('CSV は項目・値・出典・備考の表と、出典一覧（名称・URL・確認日）を含み、カンマを含む値は引用符で囲む', () => {
    const { project, scenario } = setup()
    const csv = fareAssumptionsCsv(project, scenario, refs, '2026-10-15', {
      estimatedAt: '2026-10-15T10:00:00+09:00',
      toolVersion: '0.1.0',
    })
    expect(csv).toContain('項目,値,出典,備考')
    expect(csv).toContain('【出典一覧】運賃の目安のもとにした参考データ')
    expect(csv).toContain('名称,URL,確認日')
    expect(csv).toContain('https://example.com/shared,2026-10-14')
    expect(csv).toContain('ツール版数,0.1.0')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})
