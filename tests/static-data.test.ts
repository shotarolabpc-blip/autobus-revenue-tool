import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  fareReferencesFileSchema,
  attributionsFileSchema,
  basemapsFileSchema,
  prefecturesFileSchema,
} from '../src/data/schemas'

const read = (p: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'))

describe('配信する設定データ（public/data）', () => {
  const attributions = attributionsFileSchema.parse(read('attributions.json')).items
  const basemaps = basemapsFileSchema.parse(read('basemaps.json'))
  const prefectures = prefecturesFileSchema.parse(read('prefectures.json'))

  it('出典の id が重複していない', () => {
    const ids = attributions.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('すべての背景地図に、登録済みの出典が付いている', () => {
    const ids = new Set(attributions.map((a) => a.id))
    for (const b of basemaps.items) {
      expect(b.attributionIds.length).toBeGreaterThan(0)
      for (const id of b.attributionIds) expect(ids.has(id)).toBe(true)
    }
  })

  it('背景地図は標準地図・淡色地図・航空写真の3種類で、既定値が存在する', () => {
    expect(basemaps.items.map((b) => b.label)).toEqual(['標準地図', '淡色地図', '航空写真'])
    expect(basemaps.items.some((b) => b.id === basemaps.defaultId)).toBe(true)
  })

  it('都道府県は01〜47が順にそろい、既定の都道府県が存在する', () => {
    expect(prefectures.items.map((p) => p.code)).toEqual(
      Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')),
    )
    expect(prefectures.items.some((p) => p.code === prefectures.defaultCode)).toBe(true)
  })
})

describe('運賃の参考データ（public/data/fare_references.json）', () => {
  const file = fareReferencesFileSchema.parse(read('fare_references.json'))
  const municipalities = new Set(
    (read('municipalities/13.json') as { items: { code: string }[] }).items.map((m) => m.code),
  )

  it('IDが重複せず、すべての値に出典（https の URL と確認日）がある', () => {
    const ids = file.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const i of file.items) {
      expect(i.source.url.startsWith('https://')).toBe(true)
      expect(i.source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('制定形態に合った金額が入っている（均一制は均一運賃、対キロ区間制は初乗り運賃と賃率）', () => {
    for (const i of file.items) {
      if (i.fareType === 'flat') expect(i.flatFare).toBeGreaterThan(0)
      else {
        expect(i.baseFare).toBeGreaterThan(0)
        expect(i.ratePerKm).toBeGreaterThan(0)
      }
    }
  })

  it('市区町村コードは、行政区域データから作った市区町村一覧に存在する', () => {
    for (const i of file.items)
      for (const c of i.cityCodes ?? []) expect(municipalities.has(c)).toBe(true)
  })

  it('相場と上限運賃の両方があり、同じ制定形態の上限は相場より低くない（東京都・均一制）', () => {
    const flat = (k: string) => file.items.filter((i) => i.kind === k && i.fareType === 'flat')
    expect(flat('market').length).toBeGreaterThan(0)
    expect(flat('upperLimit').length).toBeGreaterThan(0)
    const maxMarket = Math.max(...flat('market').map((i) => i.flatFare as number))
    const maxLimit = Math.max(...flat('upperLimit').map((i) => i.flatFare as number))
    expect(maxLimit).toBeGreaterThanOrEqual(maxMarket)
  })
})
