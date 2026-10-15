import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGE_CLASSES_7 } from '../calc/ageClasses'
import { toDemandCoefficients } from './coefficients'
import { coefficientsFileSchema } from './schemas'

const file = coefficientsFileSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'coefficients.json'), 'utf8')),
)

describe('coefficients.json（7区分）', () => {
  it('全都市類型・平日／休日・7区分がそろっている', () => {
    expect(file.cityTypes).toHaveLength(11)
    for (const c of file.cityTypes) {
      const v = toDemandCoefficients(file, c.code)
      for (const day of ['weekday', 'holiday'] as const) {
        expect(Object.keys(v[day])).toEqual([...AGE_CLASSES_7])
      }
    }
  })

  it('15-29・30-49・50-64歳は調査の値をそのまま使い、同じ値ではない（平均していない）', () => {
    const v = toDemandCoefficients(file, 100).weekday
    expect(
      new Set([v['15-29'].outingRate, v['30-49'].outingRate, v['50-64'].outingRate]).size,
    ).toBe(3)
  })

  it('0〜4歳は需要に数えない（確認事項 Q2：外出率・トリップ数・バス分担率がすべて0）', () => {
    for (const c of file.cityTypes) {
      const v = toDemandCoefficients(file, c.code)
      for (const day of ['weekday', 'holiday'] as const) {
        expect(v[day]['0-4']).toEqual({ outingRate: 0, tripRate: 0, busShare: 0 })
        // 5〜14歳は調査の値のまま
        expect(v[day]['5-14'].outingRate).toBeGreaterThan(0)
      }
    }
    expect(file.ageMapping['0-4'].note).toContain('数えていません')
  })
})

import { judgeCityType } from './coefficients'
import { cityTypesFileSchema } from './schemas'

const types = cityTypesFileSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'city_types.json'), 'utf8')),
)

describe('都市類型の判定', () => {
  it('東京都区部（13101〜13123）は三大都市圏／中心都市', () => {
    for (const c of ['13101', '13112', '13123']) {
      const j = judgeCityType(file, types, '13', c, null)
      expect(j).toMatchObject({ code: 1, auto: true })
    }
  })
  it('調査の対象都市に挙がっている稲城市・青梅市だけ周辺都市（b・c）', () => {
    expect(judgeCityType(file, types, '13', '13225', null).code).toBe(2)
    expect(judgeCityType(file, types, '13', '13205', null).code).toBe(3)
  })
  it('一覧にない市（三鷹市）は自動判定せず全国計。理由を返す', () => {
    const j = judgeCityType(file, types, '13', '13204', null)
    expect(j).toMatchObject({ code: 100, auto: false })
    expect(j.basis).toContain('自動判定できない')
  })
  it('市区町村が未選択でも全国計。手動指定があればそれを使う', () => {
    expect(judgeCityType(file, types, '13', null, null).code).toBe(100)
    expect(judgeCityType(file, types, '13', '13204', '2')).toMatchObject({ code: 2, auto: false })
  })
  it('関東の中心都市（さいたま・千葉・横浜・川崎）と、調査の対象に挙がっている周辺都市', () => {
    for (const [pref, city, code] of [
      ['11', '11103', 1],
      ['12', '12102', 1],
      ['14', '14104', 1],
      ['14', '14133', 1],
      ['11', '11208', 2],
      ['12', '12207', 2],
      ['14', '14206', 3],
    ] as const) {
      expect(judgeCityType(file, types, pref, city, null), city).toMatchObject({ code, auto: true })
    }
    // 調査の対象に挙がっていない市（相模原市・川越市など）は自動判定しない
    expect(judgeCityType(file, types, '14', '14150', null).auto).toBe(false)
    expect(judgeCityType(file, types, '11', '11201', null).auto).toBe(false)
  })
  it('他県の同じ番号の範囲には当てはまらない', () => {
    expect(judgeCityType(file, types, '27', '13101', null).code).toBe(100)
  })
})
