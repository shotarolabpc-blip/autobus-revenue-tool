import { useEffect } from 'react'
import { toIsoWithOffset } from './io'
import { deleteDraft, saveDraft } from './storage'
import { useProjectStore } from './store'

const DELAY_MS = 800

/**
 * 作業中のプロジェクトを IndexedDB に自動で一時保存し（F-1-7）、
 * 未ダウンロードの変更があるときはページを閉じる前に警告する（F-1-8）。
 */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (state.project === prev.project && state.dirty === prev.dirty) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { project, dirty } = useProjectStore.getState()
        const job = project
          ? saveDraft({ project, dirty, updatedAt: toIsoWithOffset(new Date()) })
          : deleteDraft()
        job.catch((e: unknown) => console.warn('一時保存に失敗しました', e))
      }, DELAY_MS)
    })
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])
}
