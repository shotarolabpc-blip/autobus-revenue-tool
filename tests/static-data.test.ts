import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
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
