import { useEffect, useState } from 'react'
import { deleteDraft, loadDraft, type Draft } from '../project/storage'
import { useProjectStore } from '../project/store'
import { Modal } from './Modal'

/** 再訪時に「前回の作業を復元しますか」と聞く（F-1-7） */
export function RestoreDraftDialog() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const openProject = useProjectStore((s) => s.openProject)

  useEffect(() => {
    loadDraft()
      .then((d) => {
        if (d && !useProjectStore.getState().project) setDraft(d)
      })
      .catch(() => undefined)
  }, [])

  if (!draft) return null

  const restore = () => {
    openProject(draft.project, draft.dirty)
    setDraft(null)
  }
  const discard = () => {
    if (!confirm('前回の作業内容を破棄します。よろしいですか？')) return
    deleteDraft().catch(() => undefined)
    setDraft(null)
  }

  return (
    <Modal
      title="前回の作業を復元しますか？"
      actions={
        <>
          <button type="button" className="btn" onClick={discard}>
            破棄する
          </button>
          <button type="button" className="btn btn-primary" onClick={restore} autoFocus>
            復元する
          </button>
        </>
      }
    >
      <p>
        このブラウザに、前回の作業内容が一時保存されています。
        <br />
        プロジェクト：<strong>{draft.project.project.name}</strong>
        <br />
        一時保存した日時：{new Date(draft.updatedAt).toLocaleString('ja-JP')}
      </p>
      {draft.dirty && (
        <p className="text-warning">ファイルとしてダウンロードしていない変更が含まれています。</p>
      )}
    </Modal>
  )
}
