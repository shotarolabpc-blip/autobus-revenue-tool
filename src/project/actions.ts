import type { DefaultsFile } from '../data/schemas'
import { downloadText } from '../export/download'
import type { ProjectDefaults } from './factory'
import { parseProjectFile, projectFileName, serializeProject, toIsoWithOffset } from './io'
import { useProjectStore } from './store'

/** defaults.json から新規作成用の初期値を取り出す */
export function toProjectDefaults(d: DefaultsFile): ProjectDefaults {
  return {
    catchmentM: d.items.catchmentM.value,
    maxLoadFactor: d.items.maxLoadFactor.value,
    rampUpFactor: d.items.rampUpFactor.value,
    fareElasticity: d.items.fareElasticity.value,
  }
}

/** 表示中のプロジェクトをファイルとしてダウンロードする（F-1-3） */
export function saveProjectToFile(): void {
  const { project, markSaved } = useProjectStore.getState()
  if (!project) return
  const now = new Date()
  const text = serializeProject(project, now, __APP_VERSION__)
  downloadText(projectFileName(project.project.name, now), text, 'application/json')
  markSaved(toIsoWithOffset(now))
}

export type OpenResult = { ok: true; migrated: string[] } | { ok: false; errors: string[] }

/** 選択・ドロップされたファイルを読み込む（F-1-4） */
export async function openProjectFile(file: File): Promise<OpenResult> {
  if (file.size > 50 * 1024 * 1024) {
    return { ok: false, errors: ['ファイルが大きすぎます（50MBまで）'] }
  }
  const text = await file.text()
  const r = parseProjectFile(text)
  if (!r.ok) return r
  useProjectStore.getState().openProject(r.project, false)
  return { ok: true, migrated: r.migrated }
}
