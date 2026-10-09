import { Link } from 'react-router'
import { FareSection } from '../components/plan/FareSection'
import { ServiceSection } from '../components/plan/ServiceSection'
import { toHolidayData } from '../data/holidays'
import { loadDefaults, loadHolidays, loadVehiclePresets } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { useActiveScenario, useProjectStore } from '../project/store'

const loadAll = () => Promise.all([loadDefaults(), loadHolidays(), loadVehiclePresets()])

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
  const [defaults, holidays, presets] = state.data

  return (
    <section className="page page-narrow" aria-label="運行・運賃">
      <h2>運行・運賃（シナリオ：{scenario.name}）</h2>
      <ServiceSection
        project={project}
        scenario={scenario}
        presets={presets}
        holidays={holidays}
        holidayData={toHolidayData(holidays)}
        defaults={defaults}
      />
      <FareSection scenario={scenario} defaults={defaults} />
    </section>
  )
}
