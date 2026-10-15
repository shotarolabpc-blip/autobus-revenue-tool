/**
 * バス停の勢圏と、既存のバス停の重なり（確認事項 Q5）。純粋関数のみ。
 *
 * 「重なる」の判定：勢圏の円の中に、既存のバス停（国土数値情報のバス停データ）が1つでもあるか。
 * 乗客はバス停で乗るので説明しやすく、閾値の数値が要らない。
 * 国土数値情報のバス路線データ（N07 R4）には運行本数の項目がないため、便数は利用者に入力してもらう。
 */
import { distanceM } from './route'

export type ExistingStop = {
  id: string
  name: string
  operator: string | null
  lng: number
  lat: number
}
export type OverlapStop = {
  id: string
  name: string
  lng: number
  lat: number
  radiusM: number
  /** 既存のバス停から採用したバス停の参照ID（その既存バス停自身は「重なり」に数えない） */
  existingStopId: string | null
}

/** バス停ごとに、勢圏（円）の中にある既存バス停を返す。1つもないバス停は含めない */
export function existingStopsInCatchments(
  stops: OverlapStop[],
  existing: ExistingStop[],
): Map<string, ExistingStop[]> {
  const out = new Map<string, ExistingStop[]>()
  for (const st of stops) {
    const found = existing.filter(
      (e) =>
        e.id !== st.existingStopId && distanceM([st.lng, st.lat], [e.lng, e.lat]) <= st.radiusM,
    )
    if (found.length > 0) out.set(st.id, found)
  }
  return out
}

/** 重なる既存バス停の事業者名（重複なし・五十音順） */
export function operatorsOf(stops: ExistingStop[]): string[] {
  return [...new Set(stops.map((s) => s.operator ?? '事業者不明'))].sort()
}
