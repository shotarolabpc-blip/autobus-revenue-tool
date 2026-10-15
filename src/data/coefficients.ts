import type { Coefficients } from '../calc/demand'
import type { CityTypesFile, CoefficientsFile } from './schemas'

/** 都市類型（全国計は 100）の係数を、需要推計に渡す形にする */
export function toDemandCoefficients(file: CoefficientsFile, cityTypeCode: number): Coefficients {
  const v = file.values[String(cityTypeCode)]
  if (!v) throw new Error(`係数に都市類型 ${cityTypeCode} がありません`)
  return v
}

export type CityTypeJudgement = {
  /** 使う都市類型のコード（coefficients.json の cityTypes） */
  code: number
  name: string
  /** 自動で判定できたか（false＝既定の「全国計」。画面で選んでもらう） */
  auto: boolean
  /** 判定の根拠（手動指定のときはその旨） */
  basis: string
}

/**
 * 都市類型を決める。手動指定 → 自動判定（調査の対象都市の一覧にある市区町村）→ 全国計、の順。
 * 自動判定できない場合は、勝手に決めず「全国計」を使い、その旨を返す（画面と出力物に表示する）。
 */
export function judgeCityType(
  coef: CoefficientsFile,
  types: CityTypesFile,
  prefCode: string,
  cityCode: string | null,
  override: string | null,
): CityTypeJudgement {
  const nameOf = (code: number) => coef.cityTypes.find((c) => c.code === code)?.name ?? String(code)
  if (override !== null && coef.cityTypes.some((c) => String(c.code) === override)) {
    const code = Number(override)
    return { code, name: nameOf(code), auto: false, basis: 'ユーザーが指定した都市類型' }
  }
  const rule =
    cityCode === null
      ? undefined
      : types.rules.find(
          (r) => r.prefCode === prefCode && cityCode >= r.cityCodeFrom && cityCode <= r.cityCodeTo,
        )
  if (rule)
    return { code: rule.cityType, name: nameOf(rule.cityType), auto: true, basis: rule.basis }
  return {
    code: types.fallbackCode,
    name: nameOf(types.fallbackCode),
    auto: false,
    basis:
      '都市類型を自動判定できないため、全国計を使っています（「前提条件」画面で都市類型を選べます）',
  }
}
