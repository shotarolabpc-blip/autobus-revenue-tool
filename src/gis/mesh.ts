/**
 * 地域メッシュ（JIS X 0410）のコードと範囲の変換。
 * 500mメッシュ（2分の1地域メッシュ、9桁）まで扱う。緯度経度は JGD2011。
 */

/** [西, 南, 東, 北] */
export type Bounds = [number, number, number, number]

const LAT1 = 2 / 3 // 1次メッシュ：緯度40分
const LNG1 = 1 // 1次メッシュ：経度1度

/** メッシュコード（4・6・8・9桁）の範囲 */
export function meshBounds(code: string): Bounds {
  if (!/^\d{4}(\d{2}(\d{2}(\d)?)?)?$/.test(code))
    throw new Error(`メッシュコードが不正です: ${code}`)
  const d = code.split('').map(Number)
  let lat = (d[0] * 10 + d[1]) * LAT1
  let lng = d[2] * 10 + d[3] + 100
  let h = LAT1
  let w = LNG1
  if (code.length >= 6) {
    h /= 8
    w /= 8
    lat += d[4] * h
    lng += d[5] * w
  }
  if (code.length >= 8) {
    h /= 10
    w /= 10
    lat += d[6] * h
    lng += d[7] * w
  }
  if (code.length === 9) {
    h /= 2
    w /= 2
    const q = d[8] // 1:南西 2:南東 3:北西 4:北東
    if (q < 1 || q > 4) throw new Error(`メッシュコードが不正です: ${code}`)
    if (q === 2 || q === 4) lng += w
    if (q === 3 || q === 4) lat += h
  }
  return [lng, lat, lng + w, lat + h]
}

/** 範囲にかかる2次メッシュ（6桁）のコード一覧 */
export function secondMeshesInBounds([west, south, east, north]: Bounds): string[] {
  const h = LAT1 / 8
  const w = LNG1 / 8
  const out: string[] = []
  const eps = 1e-9
  for (let lat = Math.floor(south / h) * h; lat < north - eps; lat += h) {
    for (let lng = Math.floor((west - 100) / w) * w + 100; lng < east - eps; lng += w) {
      const la = Math.round(lat / h) // 2次メッシュ単位の緯度の通し番号
      const lo = Math.round((lng - 100) / w)
      const p = Math.floor(la / 8)
      const u = Math.floor(lo / 8)
      if (p < 0 || p > 99 || u < 0 || u > 99) continue
      out.push(`${String(p).padStart(2, '0')}${String(u).padStart(2, '0')}${la % 8}${lo % 8}`)
    }
  }
  return out
}
