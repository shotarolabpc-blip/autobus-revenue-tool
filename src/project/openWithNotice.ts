import { useNotice } from '../components/notice'
import { openProjectFile } from './actions'
import { useProjectStore } from './store'

/** 開いているプロジェクトに未保存の変更があれば確認する */
export function confirmDiscardChanges(): boolean {
  if (!useProjectStore.getState().dirty) return true
  return confirm(
    '保存（ダウンロード）していない変更があります。変更を破棄して別のプロジェクトを開きますか？',
  )
}

/** プロジェクトファイルを開き、結果を画面に知らせる */
export async function openFileWithNotice(file: File): Promise<boolean> {
  if (!confirmDiscardChanges()) return false
  const r = await openProjectFile(file)
  if (!r.ok) {
    useNotice.getState().show({
      kind: 'error',
      title: `「${file.name}」を読み込めませんでした`,
      messages: r.errors,
    })
    return false
  }
  if (r.migrated.length) {
    useNotice.getState().show({
      kind: 'info',
      title: '古い形式のファイルを変換しました',
      messages: [
        `形式を最新に変換して読み込みました（${r.migrated.join('、')}）。保存すると新しい形式になります。`,
      ],
    })
  }
  return true
}
