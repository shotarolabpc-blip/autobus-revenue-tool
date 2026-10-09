import type { Map as MlMap } from 'maplibre-gl'

/**
 * 地図レイヤーの重なり順を決める目印（表示しないレイヤー）。
 * 背景地図 → 人口メッシュ → 参照データ（既存路線・既存バス停）→ 推計結果 → 編集中のルート・バス停 の順に重ねる。
 */
export const SLOTS = ['slot-population', 'slot-reference', 'slot-analysis', 'slot-edit'] as const
export type Slot = (typeof SLOTS)[number]

export function addSlots(map: MlMap): void {
  for (const id of SLOTS) {
    if (!map.getLayer(id)) {
      map.addLayer({ id, type: 'background', layout: { visibility: 'none' } })
    }
  }
}
