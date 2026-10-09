import { useState } from 'react'
import type { ProjectDefaults } from '../project/factory'
import type { Scenario } from '../project/schema'
import { useProjectStore } from '../project/store'

const TYPE_LABELS: Record<Scenario['type'], string> = {
  base: '標準',
  optimistic: '楽観',
  pessimistic: '悲観',
  custom: '−',
}

/** シナリオの一覧と、追加・複製・削除・名前変更（F-1-2） */
export function ScenarioList({ defaults }: { defaults: ProjectDefaults }) {
  const scenarios = useProjectStore((s) => s.project?.scenarios ?? [])
  const activeId = useProjectStore((s) => s.activeScenarioId)
  const st = useProjectStore.getState
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const commitRename = () => {
    if (editing) st().renameScenario(editing.id, editing.name)
    setEditing(null)
  }

  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>表示</th>
            <th>シナリオ名</th>
            <th>種類</th>
            <th>バス停数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s.id} className={s.id === activeId ? 'is-active' : undefined}>
              <td>
                <input
                  type="radio"
                  name="active-scenario"
                  aria-label={`${s.name}を表示`}
                  checked={s.id === activeId}
                  onChange={() => st().setActiveScenario(s.id)}
                />
              </td>
              <td>
                {editing?.id === s.id ? (
                  <input
                    aria-label="シナリオ名"
                    value={editing.name}
                    autoFocus
                    onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  s.name
                )}
              </td>
              <td>{TYPE_LABELS[s.type]}</td>
              <td className="num">{s.stops.length}</td>
              <td className="actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setEditing({ id: s.id, name: s.name })}
                >
                  名前変更
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => st().duplicateScenario(s.id)}
                >
                  複製
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  disabled={scenarios.length <= 1}
                  title={scenarios.length <= 1 ? '最後のシナリオは削除できません' : undefined}
                  onClick={() => {
                    if (confirm(`シナリオ「${s.name}」を削除します。よろしいですか？`)) {
                      st().deleteScenario(s.id)
                    }
                  }}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="btn"
        onClick={() => st().addScenario(`シナリオ${scenarios.length + 1}`, defaults)}
      >
        ＋ 空のシナリオを追加
      </button>
    </div>
  )
}
