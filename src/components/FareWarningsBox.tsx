import { fareWarningsFor } from '../calc/fareInputs'
import { loadFareReferences } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { useActiveScenario, useProjectStore } from '../project/store'

/**
 * 推計結果の画面に出す「運賃に関する注意」（F-4A-4）。
 * 運賃が「高め」（上限運賃の目安）以上で、運賃弾力性が0のとき、利用者の減少を見込んでいない旨を知らせる。
 * 運賃欄・出力物（CSV・Excel の前提条件）と同じ計算（calc/fareInputs.ts）を使う。
 */
export function FareWarningsBox() {
  const project = useProjectStore((s) => s.project)
  const scenario = useActiveScenario()
  const refs = useAsync(loadFareReferences)
  if (!project || !scenario || refs.status !== 'ready') return null
  const warnings = fareWarningsFor(project, scenario, refs.data.items)
  if (warnings.length === 0) return null
  return (
    <div className="notice-box" role="alert" aria-label="運賃に関する注意">
      <strong>運賃に関する注意</strong>
      <ul>
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  )
}
