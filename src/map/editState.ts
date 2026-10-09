import { create } from 'zustand'

/** 地図のルート編集の状態（操作モード・選択中のバス停） */
export type EditState = {
  mode: 'view' | 'addStop'
  selectedStopId: string | null
  setMode: (m: EditState['mode']) => void
  select: (id: string | null) => void
}

export const useEditState = create<EditState>()((set) => ({
  mode: 'view',
  selectedStopId: null,
  setMode: (mode) => set({ mode }),
  select: (selectedStopId) => set({ selectedStopId }),
}))
