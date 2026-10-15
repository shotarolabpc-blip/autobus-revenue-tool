import { Link } from 'react-router'
import { FareSection } from '../components/plan/FareSection'
import { ServiceSection } from '../components/plan/ServiceSection'
import { toHolidayData } from '../data/holidays'
import {
  loadDefaults,
  loadFareReferences,
  loadHolidays,
  loadVehiclePresets,
} from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { useActiveScenario, useProjectStore } from '../project/store'

const loadAll = () =>
  Promise.all([loadDefaults(), loadHolidays(), loadVehiclePresets(), loadFareReferences()])

/** 運行計画・車両・運賃の入力（F-3、F-3A、F-4） */
export function PlanPage() {
  const state = useAsync(loadAll)
  const project = useProjectStore((s) => s.project)
  const scenario = useActiveScenario()

  if (!project || !scenario) {
    return (
      <section className="page" aria-label="運行・運賃">
        <h2>運行・運賃</h2>
        <p>
          まず <Link to="/project">プロジェクト</Link> を作成してください。
        </p>
      </section>
    )
  }
  if (state.status === 'loading') return <p className="page-message">読み込み中…</p>
  if (state.status === 'error') return <p className="page-message error">{state.error.message}</p>
  const [defaults, holidays, presets, fareRefs] = state.data
  // 楽観・悲観シナリオは、元のシナリオの入力を引き継ぐので、ここでは編集できない
  const base = scenario.derivedFrom
    ? project.scenarios.find((s) => s.id === scenario.derivedFrom?.scenarioId)
    : null

  return (
    <section className="page page-narrow" aria-label="運行・運賃">
      <h2>運行・運賃（シナリオ：{scenario.name}）</h2>
      {base && (
        <div className="notice-box" role="note">
          <strong>このシナリオは「{base.name}」から自動で作られています。</strong>
          <p>入力は「{base.name}」を引き継いでいるため、ここでは変更できません。</p>
          <button
            type="button"
            className="btn"
            onClick={() => useProjectStore.getState().setActiveScenario(base.id)}
          >
            「{base.name}」に切り替える
          </button>
        </div>
      )}
      <fieldset disabled={!!base} style={{ border: 0, padding: 0, margin: 0 }}>
        <ServiceSection
          project={project}
          scenario={scenario}
          presets={presets}
          holidays={holidays}
          holidayData={toHolidayData(holidays)}
          defaults={defaults}
        />
        <FareSection
          project={project}
          scenario={scenario}
          defaults={defaults}
          fareRefs={fareRefs}
        />
      </fieldset>
    </section>
  )
}
