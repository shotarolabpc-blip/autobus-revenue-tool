import { clear, createStore, del, get, set } from 'idb-keyval'
import { parseProjectFile } from './io'
import type { ProjectFile } from './schema'

/**
 * 作業中データのブラウザ内一時保存（IndexedDB。F-1-7）。
 * サーバへは送信しない。同じPC・同じブラウザでのみ復元できる。
 */
const store = () => createStore('autobus-revenue-tool', 'drafts')
const DRAFT_KEY = 'current'

export type Draft = {
  project: ProjectFile
  /** プロジェクトファイルとしてダウンロードしていない変更があるか */
  dirty: boolean
  /** 一時保存した日時（ISO 8601） */
  updatedAt: string
}

export async function saveDraft(draft: Draft): Promise<void> {
  await set(DRAFT_KEY, draft, store())
}

/** 一時保存を読み込む。壊れている場合は捨てて null を返す */
export async function loadDraft(): Promise<Draft | null> {
  const raw = await get<Draft>(DRAFT_KEY, store())
  if (!raw || typeof raw !== 'object') return null
  const parsed = parseProjectFile(JSON.stringify(raw.project))
  if (!parsed.ok) {
    await del(DRAFT_KEY, store())
    return null
  }
  return { project: parsed.project, dirty: Boolean(raw.dirty), updatedAt: String(raw.updatedAt) }
}

export async function deleteDraft(): Promise<void> {
  await del(DRAFT_KEY, store())
}

/** 「ブラウザ内のデータを消去」（F-1-9）。IndexedDB とこのサイトの localStorage を消す */
export async function clearBrowserData(): Promise<void> {
  await clear(store())
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // 使えない環境では何もしない
  }
}
