import { create } from 'zustand'

export type Notice = {
  title: string
  messages: string[]
  kind: 'error' | 'info'
}

type NoticeState = {
  notice: Notice | null
  show: (n: Notice) => void
  close: () => void
}

/** 画面中央に出すお知らせ（読込エラーなど） */
export const useNotice = create<NoticeState>()((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  close: () => set({ notice: null }),
}))
