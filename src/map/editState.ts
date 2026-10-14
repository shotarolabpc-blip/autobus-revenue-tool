import { create } from 'zustand'

/** 地図のルート編集の状態（操作モード・選択中のバス停） */
export type EditState = {
  mode: 'view' | 'addStop' | 'addVia'
  selectedStopId: string | null
  /** 経由点を置いたときの結果の表示（交差点に合わせた など） */
  viaMessage: string | null
  setViaMessage: (m: string | null) => void
  setMode: (m: EditState['mode']) => void
  select: (id: string | null) => void
}

export const useEditState = create<EditState>()((set) => ({
  mode: 'view',
  selectedStopId: null,
  viaMessage: null,
  setViaMessage: (viaMessage) => set({ viaMessage }),
  setMode: (mode) => set({ mode }),
  select: (selectedStopId) => set({ selectedStopId }),
}))
