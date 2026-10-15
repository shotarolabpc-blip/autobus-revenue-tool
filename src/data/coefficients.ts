import type { Coefficients } from '../calc/demand'
import type { CoefficientsFile } from './schemas'

/** 都市類型（全国計は 100）の係数を、需要推計に渡す形にする */
export function toDemandCoefficients(file: CoefficientsFile, cityTypeCode: number): Coefficients {
  const v = file.values[String(cityTypeCode)]
  if (!v) throw new Error(`係数に都市類型 ${cityTypeCode} がありません`)
  return v
}
