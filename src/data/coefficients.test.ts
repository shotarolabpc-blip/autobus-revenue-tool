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

  it('0〜4歳は暫定で5〜14歳と同じ値（Q2未決定）で、暫定の印がついている', () => {
    const v = toDemandCoefficients(file, 100)
    expect(v.weekday['0-4']).toEqual(v.weekday['5-14'])
    expect(file.ageMapping['0-4'].provisional).toBe(true)
    expect(file.ageMapping['5-14'].provisional).toBe(false)
  })
})
