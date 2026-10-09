import { withBom } from '../util/text'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createProject, duplicateScenario, nextFiscalYear, type ProjectDefaults } from './factory'
import {
  checkIntegrity,
  describePath,
  parseProjectFile,
  projectFileName,
  serializeProject,
  toIsoWithOffset,
} from './io'
import { compareVersions, migrateToLatest, type Migration } from './migrations'
import { CURRENT_SCHEMA_VERSION, projectFileSchema } from './schema'
import { clearBrowserData, deleteDraft, loadDraft, saveDraft } from './storage'
import { useProjectStore } from './store'

const defaults: ProjectDefaults = {
  catchmentM: 300,
  maxLoadFactor: 1,
  rampUpFactor: 1,
  fareElasticity: 0,
}

const sample = () =>
  createProject(
    {
      name: 'テスト案件',
      prefCode: '13',
      cityCode: '13101',
      municipalityName: '千代田区',
      startFiscalYear: 2027,
      years: 10,
    },
    defaults,
  )

describe('スキーマ', () => {
  it('新規作成したプロジェクトはスキーマに合う', () => {
    const p = sample()
    expect(projectFileSchema.safeParse(p).success).toBe(true)
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(p.costs).toBeNull()
    expect(p.scenarios).toHaveLength(1)
    expect(p.scenarios[0].name).toBe('標準')
  })

  it('係数の既定値は「効かせない」（立ち上がり補正なし・弾力性0・サービス補正1）', () => {
    const c = sample().scenarios[0].coefficients
    expect(c.rampUp).toEqual([])
    expect(c.fareElasticity).toBe(0)
    expect(c.serviceFactor).toBe(1)
    expect(c.overrides).toEqual([])
  })

  it('車両の値は空欄（要入力）から始まる', () => {
    const v = sample().scenarios[0].service.vehicle
    expect(v.capacity).toBeNull()
    expect(v.rangeKm).toBeNull()
  })
})

describe('保存と読込', () => {
  it('保存した内容を読み込むと、保存日時以外は元と同じになる', () => {
    const p = sample()
    const now = new Date(2026, 9, 5, 17, 0, 0)
    const text = serializeProject(p, now, '0.1.0')
    const r = parseProjectFile(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect({ ...r.project, savedAt: '' }).toEqual({ ...p, savedAt: '', toolVersion: '0.1.0' })
    expect(r.project.savedAt).toBe(toIsoWithOffset(now))
    expect(r.migrated).toEqual([])
  })

  it('BOM付きのファイルも読める', () => {
    const r = parseProjectFile(withBom(serializeProject(sample(), new Date(), '0.1.0')))
    expect(r.ok).toBe(true)
  })

  it('ファイル名は {プロジェクト名}_{yyyymmdd_hhmm}.busproj.json', () => {
    expect(projectFileName('品川 循環線', new Date(2026, 9, 5, 7, 3))).toBe(
      '品川 循環線_20261005_0703.busproj.json',
    )
    expect(projectFileName('a/b:c', new Date(2026, 0, 1, 0, 0))).toBe(
      'a_b_c_20260101_0000.busproj.json',
    )
  })

  it('保存日時はタイムゾーン付きの ISO 8601', () => {
    expect(toIsoWithOffset(new Date(2026, 9, 5, 17, 0, 0))).toMatch(
      /^2026-10-05T17:00:00[+-]\d{2}:\d{2}$/,
    )
  })
})

describe('読込時の検証（不正なファイル）', () => {
  it('JSONでないファイルは、理由を日本語で返す', () => {
    const r = parseProjectFile('これはJSONではない')
    expect(r).toEqual({ ok: false, errors: [expect.stringContaining('JSON')] })
  })

  it('JSONだがオブジェクトでないもの', () => {
    expect(parseProjectFile('[1,2]').ok).toBe(false)
  })

  it('schemaVersion がないファイル', () => {
    const r = parseProjectFile('{"project":{}}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('schemaVersion')
  })

  it('新しい版のファイルは、ツールの更新を促す', () => {
    const p = { ...sample(), schemaVersion: '99.0' }
    const r = parseProjectFile(JSON.stringify(p))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('新しい版')
  })

  it('必須項目の欠落は、どの項目かを示す', () => {
    const p = sample() as Record<string, unknown>
    const broken = { ...p, project: { ...(p.project as object), name: undefined } }
    const r = parseProjectFile(JSON.stringify(broken))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toContain('プロジェクト › 名称：必須の項目がありません')
  })

  it('値の種類の誤りは、配列の何番目かも示す', () => {
    const p = sample()
    const text = JSON.stringify(p).replace(
      '"stops":[]',
      '"stops":[{"id":"s1","name":"A","lat":"北","lng":139,"existingStopId":null,"catchmentM":300}]',
    )
    const r = parseProjectFile(text)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain('シナリオ1 › バス停1 › 緯度：値の種類が違います（数値が必要です）')
    }
  })

  it('範囲外の値（割引率が1を超える）', () => {
    const p = sample()
    p.scenarios[0].fare.categories[0].discount = 1.5
    const r = parseProjectFile(JSON.stringify(p))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]).toBe('シナリオ1 › 運賃 › 割引区分1 › 割引率：1以下の値にしてください')
  })

  it('存在しないバス停を参照する区間を検出する', () => {
    const p = sample()
    p.scenarios[0].route.segments.push({
      fromStopId: 'x',
      toStopId: 'y',
      method: 'straight',
      via: [],
      coordinates: [],
      lengthKm: null,
      lengthOverrideKm: null,
    })
    expect(checkIntegrity(p)[0]).toContain('存在しないバス停')
  })

  it('describePath は配列番号を1から数える', () => {
    expect(describePath(['scenarios', 1, 'stops', 0, 'lng'])).toBe('シナリオ2 › バス停1 › 経度')
    expect(describePath([])).toBe('ファイル全体')
  })
})

describe('移行（マイグレーション）', () => {
  it('最新版はそのまま', () => {
    const r = migrateToLatest({ schemaVersion: CURRENT_SCHEMA_VERSION, a: 1 })
    expect(r.applied).toEqual([])
    expect(r.data).toEqual({ schemaVersion: CURRENT_SCHEMA_VERSION, a: 1 })
  })

  it('古い版は、版の順に変換を繰り返して最新にする', () => {
    const list: Migration[] = [
      { from: '0.8', to: '0.9', migrate: (d) => ({ ...d, b: 2 }) },
      { from: '0.9', to: '1.0', migrate: (d) => ({ ...d, c: (d.b as number) + 1 }) },
    ]
    const r = migrateToLatest({ schemaVersion: '0.8', a: 1 }, list, '1.0')
    expect(r.applied).toEqual(['0.8→0.9', '0.9→1.0'])
    expect(r.data).toEqual({ schemaVersion: '1.0', a: 1, b: 2, c: 3 })
  })

  it('変換の手順がない古い版はエラー', () => {
    expect(() => migrateToLatest({ schemaVersion: '0.1' }, [], '1.0')).toThrow('対応していません')
  })

  it('版の比較は数値として行う', () => {
    expect(compareVersions('1.10', '1.9')).toBe(1)
    expect(compareVersions('1.0', '1')).toBe(0)
    expect(compareVersions('0.9', '1.0')).toBe(-1)
  })
})

describe('シナリオの操作', () => {
  beforeEach(() => useProjectStore.getState().closeProject())

  it('追加・複製・名前変更・削除ができ、最後の1つは削除できない', () => {
    const st = useProjectStore.getState
    st().newProject(
      {
        name: 'A',
        prefCode: '13',
        cityCode: null,
        municipalityName: '',
        startFiscalYear: 2027,
        years: 10,
      },
      defaults,
    )
    const baseId = st().project!.scenarios[0].id
    st().duplicateScenario(baseId)
    expect(st().project!.scenarios.map((s) => s.name)).toEqual(['標準', '標準のコピー'])
    expect(st().activeScenarioId).toBe(st().project!.scenarios[1].id)

    st().addScenario('ルートB', defaults)
    expect(st().project!.scenarios).toHaveLength(3)

    st().renameScenario(baseId, '  ルートA ')
    expect(st().project!.scenarios[0].name).toBe('ルートA')
    st().renameScenario(baseId, '   ')
    expect(st().project!.scenarios[0].name).toBe('ルートA')

    for (const s of [...st().project!.scenarios]) st().deleteScenario(s.id)
    expect(st().project!.scenarios).toHaveLength(1)
    expect(st().activeScenarioId).toBe(st().project!.scenarios[0].id)
  })

  it('複製は別のIDを持ち、元を変えても影響しない', () => {
    const s = sample().scenarios[0]
    const c = duplicateScenario(s)
    expect(c.id).not.toBe(s.id)
    c.stops.push({ id: 'x', name: 'x', lat: 35, lng: 139, existingStopId: null, catchmentM: 300 })
    expect(s.stops).toHaveLength(0)
  })

  it('変更すると「未保存」になり、保存すると解除される', () => {
    const st = useProjectStore.getState
    st().openProject(sample())
    expect(st().dirty).toBe(false)
    st().updateProject((p) => ({ ...p, project: { ...p.project, years: 15 } }))
    expect(st().dirty).toBe(true)
    st().markSaved('2026-10-05T17:00:00+09:00')
    expect(st().dirty).toBe(false)
  })
})

describe('ブラウザ内の一時保存（IndexedDB）', () => {
  it('保存・復元・削除ができる', async () => {
    const p = sample()
    await saveDraft({ project: p, dirty: true, updatedAt: '2026-10-05T17:00:00+09:00' })
    const d = await loadDraft()
    expect(d?.project).toEqual(p)
    expect(d?.dirty).toBe(true)
    await deleteDraft()
    expect(await loadDraft()).toBeNull()
  })

  it('壊れた一時保存は捨てる', async () => {
    const p = { ...sample(), scenarios: [] }
    await saveDraft({ project: p, dirty: true, updatedAt: '' })
    expect(await loadDraft()).toBeNull()
  })

  it('「ブラウザ内のデータを消去」で一時保存が消える', async () => {
    await saveDraft({ project: sample(), dirty: false, updatedAt: '' })
    await clearBrowserData()
    expect(await loadDraft()).toBeNull()
  })
})

describe('年度', () => {
  it('翌年度（4月始まり）', () => {
    expect(nextFiscalYear(new Date(2026, 9, 9))).toBe(2027)
    expect(nextFiscalYear(new Date(2027, 2, 31))).toBe(2027)
    expect(nextFiscalYear(new Date(2027, 3, 1))).toBe(2028)
  })
})
