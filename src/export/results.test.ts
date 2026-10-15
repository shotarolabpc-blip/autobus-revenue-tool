import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runScenario, type PipelineData } from '../calc/pipeline'
import { judgeCityType } from '../data/coefficients'
import {
  attributionsFileSchema,
  cityTypesFileSchema,
  coefficientsFileSchema,
  fareReferencesFileSchema,
} from '../data/schemas'
import { meshBounds } from '../gis/mesh'
import { createProject } from '../project/factory'
import { buildSheets, sheetToCsv, type ExportContext } from './results'
import { sheetsToXlsx } from './xlsx'

const read = (f: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', f), 'utf8'))
const coefFile = coefficientsFileSchema.parse(read('coefficients.json'))
const cityTypes = cityTypesFileSchema.parse(read('city_types.json'))
const fareRefs = fareReferencesFileSchema.parse(read('fare_references.json'))
const attributions = attributionsFileSchema.parse(read('attributions.json')).items

const MESH = '533946111'
const [w, s, e, n] = meshBounds(MESH)
const POP = [10, 20, 100, 200, 100, 50, 40]

function context(): ExportContext {
  const project = createProject(
    {
      name: 'テスト,市',
      prefCode: '13',
      cityCode: '13101',
      municipalityName: '千代田区',
      startFiscalYear: 2027,
      years: 3,
    },
    { catchmentM: 300, maxLoadFactor: 1, rampUpFactor: 1, fareElasticity: 0 },
  )
  const sc = project.scenarios[0]
  sc.stops = [
    {
      id: 's1',
      name: 'A駅',
      lat: (s + n) / 2,
      lng: (w + e) / 2,
      existingStopId: null,
      catchmentM: 2000,
    },
  ]
  sc.route = { loop: false, sequence: ['s1'], segments: [], lengthOverrideKm: null }
  sc.fare.flatFare = 200
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
  return {
    project,
    scenario: sc,
    result: runScenario(project, sc, data),
    coefficientsFile: coefFile,
    fareRefs,
    attributions,
    populationVersion: 'R6国政局推計（テスト）',
    taxRate: 0.1,
    toolVersion: '9.9.9',
    now: new Date(2026, 9, 15, 12, 0, 0),
  }
}

describe('出力（CSV・Excel）', () => {
  it('シートは 前提条件／運賃表／年度別推計／バス停別／出典一覧', () => {
    expect(buildSheets(context()).map((x) => x.name)).toEqual([
      '前提条件',
      '運賃表',
      '年度別推計',
      'バス停別',
      '出典一覧',
    ])
  })

  it('すべてのシートの先頭に、推計日時・シナリオ名・データ版数・出典・ツール版数が入る（F-8-7）', () => {
    for (const sheet of buildSheets(context())) {
      const head = sheet.rows.slice(0, 6).map((r) => r[0])
      expect(head).toEqual([
        '推計日時',
        'プロジェクト',
        'シナリオ',
        'データ版数',
        '出典',
        'ツール版数',
      ])
      expect(sheet.rows[5][1]).toBe('v9.9.9')
      expect(String(sheet.rows[3][1])).toContain('R6国政局推計（テスト）')
      expect(String(sheet.rows[4][1])).toContain('全国都市交通特性調査')
    }
  })

  it('年度別推計：3年分の行があり、運賃収入は 延べ乗車人員 × 運賃 と一致する', () => {
    const ctx = context()
    const sheet = buildSheets(ctx).find((x) => x.name === '年度別推計')!
    const header = sheet.rows[7]
    const rows = sheet.rows.slice(8)
    expect(rows).toHaveLength(3)
    const iRiders = header.indexOf('年間延べ乗車人員（合計）')
    const iFare = header.indexOf('運賃収入（税込・円）')
    for (const r of rows) {
      expect(Math.abs((r[iFare] as number) - (r[iRiders] as number) * 200)).toBeLessThan(
        (r[iRiders] as number) * 0.0005 * 200 + 1,
      )
    }
    expect(rows.map((r) => r[0])).toEqual([2027, 2028, 2029])
  })

  it('前提条件：都市類型・係数の出典・0〜4歳の暫定・上限運賃などを載せる', () => {
    const sheet = buildSheets(context()).find((x) => x.name === '前提条件')!
    const items = sheet.rows.map((r) => String(r[0]))
    expect(items).toContain('都市類型')
    expect(items).toContain('係数の出典')
    expect(items.some((i) => i.startsWith('運賃の目安：標準'))).toBe(true)
    expect(items.some((i) => i.startsWith('運賃の目安：'))).toBe(true)
    expect(items).toContain('注意')
    // 係数の表（日種別×7区分）
    expect(items.filter((i) => /^(平日|土休日) /.test(i))).toHaveLength(14)
  })

  it('出典一覧：地理院・国土数値情報・OSM・全国都市交通特性調査・車両スペックの出典を含む（規則5）', () => {
    const sheet = buildSheets(context()).find((x) => x.name === '出典一覧')!
    const text = sheet.rows.map((r) => r.join(' ')).join('\n')
    for (const word of [
      '地理院タイル',
      '国土数値情報',
      'OpenStreetMap',
      '全国都市交通特性調査',
      '車両スペック',
    ]) {
      expect(text).toContain(word)
    }
  })

  it('CSV：UTF-8 BOM 付き。カンマを含む値は引用符で囲む', () => {
    const sheet = buildSheets(context()).find((x) => x.name === '年度別推計')!
    const csv = sheetToCsv(sheet)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"テスト,市"')
    expect(csv.split('\r\n')[0]).toBe('﻿推計日時,' + (sheet.rows[0][1] as string))
  })

  it('Excel：5つのシートを持つファイルができる（ブラウザ内で生成）', async () => {
    const blob = await sheetsToXlsx(buildSheets(context()))
    expect(blob.size).toBeGreaterThan(5000)
    const { Workbook } = await import('exceljs')
    const wb = new Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map((x) => x.name)).toEqual([
      '前提条件',
      '運賃表',
      '年度別推計',
      'バス停別',
      '出典一覧',
    ])
    expect(wb.getWorksheet('年度別推計')!.getCell('A1').value).toBe('推計日時')
  })
})
