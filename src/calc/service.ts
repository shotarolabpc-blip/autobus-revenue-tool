/**
 * 運行計画・車両に関する計算。要件 F-3（F-3-3・F-3-4）、F-3A（F-3A-3〜F-3A-5）、5.5。純粋関数のみ。
 */

export type VehicleSpec = {
  capacity: number | null
  seats: number | null
  standingAllowed: boolean | null
  operatorOnBoard: boolean | null
  operatorUsesPassengerSeat: boolean | null
  operatorCount: number | null
  rangeKm: number | null
  chargeHours: number | null
}

/**
 * 実効定員（確認事項 Q6）。乗客が使える人数。
 *  - 立席を使わない車両は座席数（乗客用。運転席・保安要員専用の席は含まない）、それ以外は運用定員をもとにする
 *  - 保安要員が乗らなければ、そのまま
 *  - 保安要員が乗り、客席（座席）を使うなら、保安要員の人数を引く。専用席（運転席など）に座るなら引かない
 * 必要な値が未入力なら null（画面では「要入力」。値を推測で補わない）。F-3A-3。
 */
export function effectiveCapacity(v: VehicleSpec): number | null {
  const base = v.standingAllowed === false && v.seats !== null ? v.seats : v.capacity
  if (base === null) return null
  if (v.operatorOnBoard === null) return null
  if (!v.operatorOnBoard) return base
  if (v.operatorUsesPassengerSeat === null) return null
  if (!v.operatorUsesPassengerSeat) return base
  if (v.operatorCount === null) return null
  return Math.max(0, base - v.operatorCount)
}

/** 1日の輸送力 ＝ 実効定員 × 便数 × 最大乗車率（F-3A-4） */
export function dailyCapacity(effCap: number, trips: number, maxLoadFactor: number): number {
  return effCap * trips * maxLoadFactor
}

/** 所要時間（分）＝ ルート延長 ÷ 平均速度（F-3-4）。手修正があればそれを使う */
export function tripMinutes(
  lengthKm: number,
  avgSpeedKmh: number | null,
  override: number | null,
): number | null {
  if (override !== null) return override
  if (!avgSpeedKmh || avgSpeedKmh <= 0) return null
  return (lengthKm / avgSpeedKmh) * 60
}

/** "HH:MM" → 分 */
export function parseHm(s: string | null): number | null {
  if (!s) return null
  const m = /^(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * 1台あたりの1日最大運行便数の目安（F-3A-5）。
 * 運行時間帯の中で、1便ずつ走り、次の便を走る電池が残っていなければ充電する、と仮定して数える。
 */
export function maxTripsPerVehicle(args: {
  serviceMinutes: number
  tripMinutes: number
  tripKm: number
  rangeKm: number | null
  chargeHours: number | null
}): number | null {
  const { serviceMinutes, tripMinutes: t, tripKm, rangeKm, chargeHours } = args
  if (t <= 0 || serviceMinutes <= 0) return null
  if (rangeKm === null || chargeHours === null) {
    // 航続距離・充電時間が未入力なら、時間だけで数える
    return Math.floor(serviceMinutes / t)
  }
  if (tripKm > rangeKm) return 0
  let time = 0
  let remaining = rangeKm
  let trips = 0
  for (let guard = 0; guard < 10_000; guard++) {
    if (remaining < tripKm) {
      time += chargeHours * 60
      remaining = rangeKm
      continue
    }
    if (time + t > serviceMinutes) break
    time += t
    remaining -= tripKm
    trips++
  }
  return trips
}

export type CapacityCheck = {
  /** 頭打ち後の利用者数 */
  riders: number
  capped: boolean
  /** 超過した人数 */
  excess: number
}

/** 推計需要が輸送力を超えたら輸送力で頭打ちにする（5.5） */
export function capByCapacity(demand: number, capacity: number | null): CapacityCheck {
  if (capacity === null || demand <= capacity) return { riders: demand, capped: false, excess: 0 }
  return { riders: capacity, capped: true, excess: demand - capacity }
}
