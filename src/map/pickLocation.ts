import { create } from 'zustand'

/** 開発計画の場所を地図のクリックで選ぶ（F-5-1）。選び終わるまでの対象を覚えておく */
export type PickTarget = { scenarioId: string; developmentId: string; name: string }

type PickState = {
  target: PickTarget | null
  start: (t: PickTarget) => void
  clear: () => void
}

export const usePickLocation = create<PickState>()((set) => ({
  target: null,
  start: (target) => set({ target }),
  clear: () => set({ target: null }),
}))
