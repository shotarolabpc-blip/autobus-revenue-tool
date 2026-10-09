import { saveProjectToFile } from '../project/actions'
import { useProjectStore } from '../project/store'

/** ヘッダー右側：プロジェクト名・シナリオ切替・保存ボタン */
export function ProjectBar() {
  const project = useProjectStore((s) => s.project)
  const activeId = useProjectStore((s) => s.activeScenarioId)
  const dirty = useProjectStore((s) => s.dirty)
  const setActive = useProjectStore((s) => s.setActiveScenario)

  if (!project) return <div className="project-bar project-bar-empty">プロジェクト未作成</div>

  return (
    <div className="project-bar">
      <span className="project-bar-name" title={project.project.name}>
        {project.project.name}
      </span>
      <label className="project-bar-scenario">
        シナリオ
        <select value={activeId ?? ''} onChange={(e) => setActive(e.target.value)}>
          {project.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {dirty && (
        <span className="badge badge-warning" title="ダウンロードしていない変更があります">
          未保存
        </span>
      )}
      <button type="button" className="btn btn-primary" onClick={saveProjectToFile}>
        保存（ダウンロード）
      </button>
    </div>
  )
}
