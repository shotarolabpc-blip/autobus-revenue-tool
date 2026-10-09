/**
 * 勢圏人口の面積按分（要件 5.1、F-2-8）。純粋関数のみ。
 *
 * - 人口は500mメッシュ（秘匿・合算をまとめた「集計単位」）ごと。集計単位の人口は構成メッシュに均等に分布するとみなす。
 * - 勢圏（バス停を中心とする円）とメッシュの重なりの面積の割合で人口を配分する（面積按分）。
 * - 勢圏が重なる部分は二重計上しない：重なった場所は「最も近いバス停」の勢圏として数える。
 * - 面積は、メッシュを細かい格子（既定10m）に分けて数える（格子の中心がどの勢圏に入るか）。
 */
import { meshBounds } from './mesh'

export type CatchmentStop = { id: string; lng: number; lat: number; radiusM: number }
export type MeshUnit = { id: string; meshes: string[] }

/** バス停ごとの「集計単位 → 人口の配分割合（0〜1）」 */
export type CatchmentWeights = Map<string, Map<string, number>>

const EARTH_R = 6371008.8
const RAD = Math.PI / 180

export function catchmentWeights(
  stops: CatchmentStop[],
  units: MeshUnit[],
  cellM = 10,
): CatchmentWeights {
  const out: CatchmentWeights = new Map(stops.map((s) => [s.id, new Map()]))
  if (stops.length === 0) return out
  for (const unit of units) {
    const share = 1 / unit.meshes.length // 構成メッシュに均等に分布
    for (const mesh of unit.meshes) {
      const [w, s, e, n] = meshBounds(mesh)
      const lat0 = (s + n) / 2
      const mPerLat = EARTH_R * RAD
      const mPerLng = EARTH_R * RAD * Math.cos(lat0 * RAD)
      // メッシュの近くのバス停だけを調べる
      const near = stops.filter((st) => {
        const dx = Math.max(w - st.lng, 0, st.lng - e) * mPerLng
        const dy = Math.max(s - st.lat, 0, st.lat - n) * mPerLat
        return dx * dx + dy * dy <= st.radiusM * st.radiusM
      })
      if (near.length === 0) continue
      const widthM = (e - w) * mPerLng
      const heightM = (n - s) * mPerLat
      const nx = Math.max(1, Math.round(widthM / cellM))
      const ny = Math.max(1, Math.round(heightM / cellM))
      const counts = new Map<string, number>()
      // バス停の位置をメッシュの南西角からの m に直す
      const local = near.map((st) => ({
        id: st.id,
        x: (st.lng - w) * mPerLng,
        y: (st.lat - s) * mPerLat,
        r2: st.radiusM * st.radiusM,
      }))
      for (let iy = 0; iy < ny; iy++) {
        const y = ((iy + 0.5) / ny) * heightM
        for (let ix = 0; ix < nx; ix++) {
          const x = ((ix + 0.5) / nx) * widthM
          let best: string | null = null
          let bestD = Infinity
          for (const st of local) {
            const d = (x - st.x) ** 2 + (y - st.y) ** 2
            if (d <= st.r2 && d < bestD) {
              bestD = d
              best = st.id
            }
          }
          if (best) counts.set(best, (counts.get(best) ?? 0) + 1)
        }
      }
      const total = nx * ny
      for (const [id, c] of counts) {
        const m = out.get(id)!
        m.set(unit.id, (m.get(unit.id) ?? 0) + (c / total) * share)
      }
    }
  }
  return out
}

/** 勢圏にかかる可能性のある範囲（人口メッシュの読込範囲） */
export function catchmentBounds(stops: CatchmentStop[]): [number, number, number, number] | null {
  if (stops.length === 0) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const st of stops) {
    const dLat = st.radiusM / (EARTH_R * RAD)
    const dLng = dLat / Math.cos(st.lat * RAD)
    w = Math.min(w, st.lng - dLng)
    e = Math.max(e, st.lng + dLng)
    s = Math.min(s, st.lat - dLat)
    n = Math.max(n, st.lat + dLat)
  }
  return [w, s, e, n]
}

/** 点（開発計画の地点）が入る勢圏のバス停（最も近いもの）。どの勢圏にも入らなければ null */
export function stopForPoint(stops: CatchmentStop[], lng: number, lat: number): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const st of stops) {
    const dx = (lng - st.lng) * EARTH_R * RAD * Math.cos(lat * RAD)
    const dy = (lat - st.lat) * EARTH_R * RAD
    const d = Math.hypot(dx, dy)
    if (d <= st.radiusM && d < bestD) {
      bestD = d
      best = st.id
    }
  }
  return best
}
