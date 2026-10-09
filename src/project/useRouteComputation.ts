import { useEffect } from 'react'
import { create } from 'zustand'
import { computeRoute } from '../routing/client'
import type { LngLat } from '../gis/route'
import { applyComputedSegment, pendingSegments, setSegmentMethod } from './routeEdit'
import { useProjectStore } from './store'

type SegmentStatus = { state: 'computing' } | { state: 'fallback'; message: string }

type RouteStatusState = {
  /** 区間（出発>到着）ごとの状態 */
  segments: Record<string, SegmentStatus>
  set: (key: string, s: SegmentStatus | null) => void
}

export const useRouteStatus = create<RouteStatusState>()((set) => ({
  segments: {},
  set: (key, s) =>
    set((st) => {
      const next = { ...st.segments }
      if (s) next[key] = s
      else delete next[key]
      return { segments: next }
    }),
}))

export const segmentKey = (fromStopId: string, toStopId: string) => `${fromStopId}>${toStopId}`

/**
 * 表示中のシナリオで「自動（道路沿い）」の区間が未計算なら、Web Worker で経路を計算して反映する。
 * 経路が見つからない区間は直線に切り替え、理由を表示する（F-2-5：直線結線＋距離手入力）。
 */
export function useRouteComputation(prefCode: string | null): void {
  useEffect(() => {
    if (!prefCode) return
    const running = new Set<string>()
    let alive = true

    const run = async () => {
      const { project, activeScenarioId } = useProjectStore.getState()
      const scenario = project?.scenarios.find((s) => s.id === activeScenarioId)
      if (!scenario) return
      for (const p of pendingSegments(scenario)) {
        const key = segmentKey(p.seg.fromStopId, p.seg.toStopId) + JSON.stringify(p.seg.via)
        if (running.has(key)) continue
        running.add(key)
        const statusKey = segmentKey(p.seg.fromStopId, p.seg.toStopId)
        useRouteStatus.getState().set(statusKey, { state: 'computing' })
        const scenarioId = scenario.id
        computeLegs(prefCode, p.points)
          .then((r) => {
            if (!alive) return
            const st = useProjectStore.getState()
            if (r.ok) {
              st.updateScenario(scenarioId, (s) =>
                applyComputedSegment(s, p.seg, r.coordinates, r.lengthKm),
              )
              useRouteStatus.getState().set(statusKey, null)
            } else {
              st.updateScenario(scenarioId, (s) => {
                const i = s.route.segments.findIndex(
                  (x) =>
                    x.fromStopId === p.seg.fromStopId &&
                    x.toStopId === p.seg.toStopId &&
                    x.method === 'auto',
                )
                return i < 0 ? s : setSegmentMethod(s, i, 'straight')
              })
              useRouteStatus.getState().set(statusKey, {
                state: 'fallback',
                message: `${r.message}。直線でつないでいます（距離は手入力できます）`,
              })
            }
          })
          .finally(() => running.delete(key))
      }
    }
    run()
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (s.project !== prev.project || s.activeScenarioId !== prev.activeScenarioId) run()
    })
    return () => {
      alive = false
      unsub()
    }
  }, [prefCode])
}

/** 経由点を順に通る経路（区間ごとに計算してつなぐ） */
async function computeLegs(
  prefCode: string,
  points: LngLat[],
): Promise<{ ok: true; coordinates: LngLat[]; lengthKm: number } | { ok: false; message: string }> {
  const coords: LngLat[] = []
  let m = 0
  for (let i = 0; i < points.length - 1; i++) {
    try {
      const { result } = await computeRoute(prefCode, points[i], points[i + 1])
      if (!result.found) return { ok: false, message: result.message }
      // 線はバス停（経由点）から道路までの寄せた部分も描くが、距離は道路の部分だけ数える
      const leg: LngLat[] = [points[i], ...result.coordinates, points[i + 1]]
      coords.push(...(coords.length ? leg.slice(1) : leg))
      m += result.lengthM
    } catch (e) {
      return { ok: false, message: `経路計算でエラーが発生しました（${String(e)}）` }
    }
  }
  return { ok: true, coordinates: coords, lengthKm: m / 1000 }
}
