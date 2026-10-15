import type { Migration, RawProject } from './index'

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

/**
 * 車両に「保安要員が客席を使うか（operatorUsesPassengerSeat）」「出典未確認の項目（unverified）」を足す。
 * 古い形式では、保安要員が乗る車両は座席（定員）から保安要員の人数を引いていたので、同じ結果になるよう
 * 「乗る→客席を使う」「乗らない→使わない」「未入力→未入力」と読み替える。
 */
function vehicle(v: unknown): unknown {
  if (typeof v !== 'object' || v === null) return v
  const x = v as Record<string, unknown>
  return {
    ...x,
    operatorUsesPassengerSeat:
      x.operatorOnBoard === true ? true : x.operatorOnBoard === false ? false : null,
    unverified: [],
  }
}

/**
 * 1.2 → 1.3：路線捕捉率のバス停ごとの設定（stopCapture）を足す（確認事項 Q5。入力がないので空＝すべて未設定）。
 */
export const v1_2_to_v1_3: Migration = {
  from: '1.2',
  to: '1.3',
  migrate: (data: RawProject): RawProject => {
    const out: RawProject = { ...data }
    if (Array.isArray(data.scenarios)) {
      out.scenarios = data.scenarios.map((sc: unknown) => {
        if (typeof sc !== 'object' || sc === null) return sc
        const s = sc as Record<string, unknown>
        const service = obj(s.service)
        return {
          ...s,
          stopCapture: [],
          service: { ...service, vehicle: vehicle(service.vehicle) },
        }
      })
    }
    if (Array.isArray(data.userVehiclePresets)) {
      out.userVehiclePresets = data.userVehiclePresets.map(vehicle)
    }
    return out
  },
}
