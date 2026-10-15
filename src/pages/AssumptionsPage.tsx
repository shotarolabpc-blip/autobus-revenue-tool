import { Link } from 'react-router'
import { AdjustSection } from '../components/assumptions/AdjustSection'
import { BaselineTable } from '../components/assumptions/BaselineTable'
import { CoefficientSection } from '../components/assumptions/CoefficientSection'
import { DemandInputsSection } from '../components/assumptions/DemandInputsSection'
import { RevenueInputsSection } from '../components/assumptions/RevenueInputsSection'
import {
  loadAttributions,
  loadCityTypes,
  loadCoefficients,
  loadDefaults,
  loadHolidays,
} from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { useActiveScenario, useProjectStore } from '../project/store'

const loadAll = () =>
  Promise.all([
    loadCoefficients(),
    loadCityTypes(),
    loadDefaults(),
    loadHolidays(),
    loadAttributions(),
  ])

/** 前提条件：推計に使う係数・補正・開発計画・収入の入力と、初期値と根拠の一覧（F-5、F-6-2・F-6-3、付録B） */
export function AssumptionsPage() {
  const state = useAsync(loadAll)
  const project = useProjectStore((s) => s.project)
  const scenario = useActiveScenario()

  if (!project || !scenario) {
    return (
      <section className="page" aria-label="前提条件">
        <h2>前提条件</h2>
        <p>
          まず <Link to="/project">プロジェクト</Link> を作成してください。
        </p>
      </section>
    )
  }
  if (state.status === 'loading') return <p className="page-message">読み込み中…</p>
  if (state.status === 'error') return <p className="page-message error">{state.error.message}</p>
  const [coefficients, cityTypes, defaults, holidays, attributions] = state.data

  // 楽観・悲観シナリオは、元のシナリオの入力を引き継ぐので、ここでは編集できない
  const base = scenario.derivedFrom
    ? project.scenarios.find((s) => s.id === scenario.derivedFrom?.scenarioId)
    : null
  const disabled = !!base

  return (
    <section className="page page-narrow" aria-label="前提条件">
      <h2>前提条件（シナリオ：{scenario.name}）</h2>
      {base && (
        <div className="notice-box" role="note">
          <strong>このシナリオは「{base.name}」から自動で作られています。</strong>
          <p>
            入力は「{base.name}
            」を引き継いでいるため、ここでは変更できません。変更するときは、シナリオを「{base.name}
            」に切り替えてください。
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => useProjectStore.getState().setActiveScenario(base.id)}
          >
            「{base.name}」に切り替える
          </button>
        </div>
      )}
      <CoefficientSection
        project={project}
        scenario={scenario}
        coefficients={coefficients}
        cityTypes={cityTypes}
        disabled={disabled}
      />
      <AdjustSection scenario={scenario} defaults={defaults} disabled={disabled} />
      <DemandInputsSection
        scenario={scenario}
        startFiscalYear={project.project.startFiscalYear}
        disabled={disabled}
      />
      <RevenueInputsSection
        scenario={scenario}
        startFiscalYear={project.project.startFiscalYear}
        years={project.project.years}
        disabled={disabled}
      />
      <BaselineTable
        defaults={defaults}
        coefficients={coefficients}
        holidays={holidays}
        attributions={attributions}
      />
    </section>
  )
}
