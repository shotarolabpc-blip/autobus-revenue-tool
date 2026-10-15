/**
 * バス停の勢圏と、既存のバス路線の重なり（Q5：勢圏が既存路線と重なるときは警告し、路線捕捉率の入力を促す）。純粋関数のみ。
 * 国土数値情報のバス路線データ（N07 R4）には運行本数の項目がないため、便数比での自動按分はできない。
 * ここでは「重なっているか」だけを判定し、捕捉率はユーザーが手入力する。
 */
import { pointToSegmentM, type LngLat } from './route'

export type ExistingRoute = { coordinates: LngLat[]; operator: string | null }
export type OverlapStop = { id: string; name: string; lng: number; lat: number; radiusM: number }

const EARTH_R = 6371008.8
const RAD = Math.PI / 180

/** バス停ごとに、勢圏（円）と重なる既存路線の事業者名（重複なし）を返す。重ならないバス停は含めない */
export function overlappingOperators(
  stops: OverlapStop[],
  routes: ExistingRoute[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const st of stops) {
    const dLat = st.radiusM / (EARTH_R * RAD)
    const dLng = dLat / Math.cos(st.lat * RAD)
    const found = new Set<string>()
    for (const r of routes) {
      // 大まかな範囲で絞ってから、線分ごとに距離を測る
      let near = false
      for (const c of r.coordinates) {
        if (Math.abs(c[0] - st.lng) <= dLng * 2 && Math.abs(c[1] - st.lat) <= dLat * 2) {
          near = true
          break
        }
      }
      if (!near) continue
      for (let i = 0; i < r.coordinates.length - 1; i++) {
        if (
          pointToSegmentM([st.lng, st.lat], r.coordinates[i], r.coordinates[i + 1]) <= st.radiusM
        ) {
          found.add(r.operator ?? '事業者不明')
          break
        }
      }
    }
    if (found.size > 0) out.set(st.id, [...found].sort())
  }
  return out
}
