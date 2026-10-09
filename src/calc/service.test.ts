import { describe, expect, it } from 'vitest'
import {
  capByCapacity,
  dailyCapacity,
  effectiveCapacity,
  maxTripsPerVehicle,
  parseHm,
  tripMinutes,
  type VehicleSpec,
} from './service'

const v = (o: Partial<VehicleSpec>): VehicleSpec => ({
  capacity: null,
  seats: null,
  standingAllowed: null,
  operatorOnBoard: null,
  operatorCount: null,
  rangeKm: null,
  chargeHours: null,
  ...o,
})

describe('実効定員', () => {
  it('運用定員から乗車する保安要員を引く', () => {
    expect(effectiveCapacity(v({ capacity: 11, operatorOnBoard: true, operatorCount: 1 }))).toBe(10)
    expect(effectiveCapacity(v({ capacity: 11, operatorOnBoard: false }))).toBe(11)
  })
  it('立席を使わない場合は座席数をもとにする', () => {
    expect(
      effectiveCapacity(
        v({ capacity: 23, seats: 15, standingAllowed: false, operatorOnBoard: false }),
      ),
    ).toBe(15)
  })
  it('未入力があれば null（要入力）', () => {
    expect(effectiveCapacity(v({ capacity: 11 }))).toBeNull()
    expect(effectiveCapacity(v({ capacity: 11, operatorOnBoard: true }))).toBeNull()
  })
})

describe('輸送力・所要時間', () => {
  it('輸送力＝実効定員×便数×最大乗車率', () => {
    expect(dailyCapacity(10, 20, 1)).toBe(200)
    expect(dailyCapacity(10, 20, 0.8)).toBe(160)
  })
  it('所要時間＝延長÷平均速度（分）、手修正が優先', () => {
    expect(tripMinutes(6, 12, null)).toBeCloseTo(30)
    expect(tripMinutes(6, 12, 40)).toBe(40)
    expect(tripMinutes(6, null, null)).toBeNull()
  })
  it('時刻の読み取り', () => {
    expect(parseHm('07:30')).toBe(450)
    expect(parseHm(null)).toBeNull()
  })
})

describe('1台の1日最大便数', () => {
  it('航続距離が未入力なら時間だけで数える（12時間÷30分＝24便）', () => {
    expect(
      maxTripsPerVehicle({
        serviceMinutes: 720,
        tripMinutes: 30,
        tripKm: 6,
        rangeKm: null,
        chargeHours: null,
      }),
    ).toBe(24)
  })
  it('電池が足りなくなったら充電する', () => {
    // 1便6km・30分、航続30km → 5便（150分）走って充電2時間（120分）→ 残り450分で…
    // 5便(150) 充電(120) 5便(150) 充電(120) 残り180分で5便？ → 150+120+150+120=540、+5便150=690 ≤ 720 → 15便
    expect(
      maxTripsPerVehicle({
        serviceMinutes: 720,
        tripMinutes: 30,
        tripKm: 6,
        rangeKm: 30,
        chargeHours: 2,
      }),
    ).toBe(15)
  })
  it('1便の距離が航続距離を超えると0便', () => {
    expect(
      maxTripsPerVehicle({
        serviceMinutes: 720,
        tripMinutes: 30,
        tripKm: 40,
        rangeKm: 30,
        chargeHours: 2,
      }),
    ).toBe(0)
  })
})

describe('輸送力による頭打ち', () => {
  it('超えたら輸送力で頭打ちにし、超過分を返す', () => {
    expect(capByCapacity(250, 200)).toEqual({ riders: 200, capped: true, excess: 50 })
    expect(capByCapacity(150, 200)).toEqual({ riders: 150, capped: false, excess: 0 })
    expect(capByCapacity(150, null)).toEqual({ riders: 150, capped: false, excess: 0 })
  })
})
