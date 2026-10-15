import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { kpis } from '../calc/revenue'
import { FareWarningsBox } from '../components/FareWarningsBox'
import { Stat } from '../components/fields'
import { Breakdown } from '../components/results/Breakdown'
import { ReferenceCompare } from '../components/results/ReferenceCompare'
import { resolveDerived } from '../calc/pipeline'
import { ExportBar } from '../components/results/ExportBar'
import { SERIES_COLORS } from '../components/results/chartUtil'
import { SeriesChart } from '../components/results/SeriesChart'
import { YearTable } from '../components/results/YearTable'
import { useActiveScenario, useProjectStore } from '../project/store'
import { useResults } from '../project/useResults'
import { fmt } from '../util/format'

const MAX_COMPARE = 4

/** 推計結果（F-6、F-7、F-8-1）：年度別の延べ乗車人員・収入、主要KPI、シナリオ比較、内訳 */
export function ResultsPage() {
  const project = useProjectStore((s) => s.project)
  const active = useActiveScenario()
  const state = useResults(project)
  const [taxIncluded, setTaxIncluded] = useState(true)
  const [compareIds, setCompareIds] = useState<string[] | null>(null)
  const ridersChart = useRef<SVGSVGElement>(null)
  const revenueChart = useRef<SVGSVGElement>(null)

  const results = state.status === 'ready' ? state.results : null
  const detail = results?.find((r) => r.scenarioId === active?.id) ?? results?.[0] ?? null
  const shownIds = useMemo(
    () =>
      (compareIds ?? results?.slice(0, MAX_COMPARE).map((r) => r.scenarioId) ?? []).slice(
        0,
        MAX_COMPARE,
      ),
    [compareIds, results],
  )

  if (!project) {
    return (
      <section className="page" aria-label="推計結果">
        <h2>推計結果</h2>
        <p>
          まず <Link to="/project">プロジェクト</Link> を作成してください。
        </p>
      </section>
    )
  }
  if (state.status === 'loading') return <p className="page-message">計算しています…</p>
  if (state.status === 'error') return <p className="page-message error">{state.message}</p>
  if (!results || !detail) return null

  const rawScenario = project.scenarios.find((x) => x.id === detail.scenarioId)
  const detailScenario = rawScenario ? resolveDerived(project, rawScenario) : null
  const shown = results.filter((r) => shownIds.includes(r.scenarioId) && !r.blocked)
  const years = detail.fiscalYears
  const k = kpis(detail.revenue)
  const rev = (r: {
    fareRevenue: number
    fareRevenueExTax: number
    total: number
    totalExTax: number
  }) =>
    taxIncluded
      ? { fare: r.fareRevenue, total: r.total }
      : { fare: r.fareRevenueExTax, total: r.totalExTax }
  const taxLabel = taxIncluded ? '税込' : '税抜'
  const meta = `${project.project.name}／推計日時 ${new Date().toLocaleString('ja-JP')}／ツール版数 v${__APP_VERSION__}`

  return (
    <section className="page" aria-label="推計結果">
      <h2>推計結果（シナリオ：{detail.scenarioName}）</h2>
      <p className="hint">
        「延べ乗車人員」は、乗車した回数の合計です（往復で2回乗れば2回と数えます）。実人数ではありません。
        年度の人口は、その年の暦年の値（5年刻みの推計を線形補間）を使います。
      </p>

      <div className="card">
        <h3>表示するシナリオ</h3>
        <div className="field-row">
          <label className="field field-compact">
            <span>くわしく見るシナリオ</span>
            <select
              aria-label="くわしく見るシナリオ"
              value={detail.scenarioId}
              onChange={(e) => useProjectStore.getState().setActiveScenario(e.target.value)}
            >
              {results.map((r) => (
                <option key={r.scenarioId} value={r.scenarioId}>
                  {r.scenarioName}
                </option>
              ))}
            </select>
          </label>
          <div className="radio-group" role="radiogroup" aria-label="金額の表示">
            <span className="radio-group-label">金額の表示</span>
            <label className="inline-radio">
              <input
                type="radio"
                name="tax"
                checked={taxIncluded}
                onChange={() => setTaxIncluded(true)}
              />
              税込
            </label>
            <label className="inline-radio">
              <input
                type="radio"
                name="tax"
                checked={!taxIncluded}
                onChange={() => setTaxIncluded(false)}
              />
              税抜
            </label>
          </div>
        </div>
        {results.length > 1 && (
          <div>
            <span className="hint">グラフで比べるシナリオ（最大{MAX_COMPARE}つ）：</span>
            {results.map((r) => {
              const on = shownIds.includes(r.scenarioId)
              return (
                <label key={r.scenarioId} className="inline-radio">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && shownIds.length >= MAX_COMPARE}
                    onChange={() =>
                      setCompareIds(
                        on
                          ? shownIds.filter((id) => id !== r.scenarioId)
                          : [...shownIds, r.scenarioId],
                      )
                    }
                  />{' '}
                  {r.scenarioName}
                </label>
              )
            })}
          </div>
        )}
      </div>

      {detail.blocked ? (
        <div className="notice-box" role="alert">
          <strong>推計できません</strong>
          <p>{detail.blocked}</p>
        </div>
      ) : (
        <>
          <FareWarningsBox />
          {detail.warnings.length > 0 && (
            <div className="notice-box" role="note" aria-label="推計の前提についての注意">
              <strong>推計の前提についての注意</strong>
              <ul>
                {detail.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {k && (
            <div className="card">
              <h3>主要な値（{detail.scenarioName}）</h3>
              <div className="field-grid">
                <Stat
                  label={`初年度（${k.first.fiscalYear}年度）の延べ乗車人員`}
                  value={`${fmt(k.first.riders)} 人/年`}
                  note={`運賃収入 ${fmt(rev(k.first).fare)} 円（${taxLabel}）`}
                />
                <Stat
                  label={`最終年度（${k.last.fiscalYear}年度）の延べ乗車人員`}
                  value={`${fmt(k.last.riders)} 人/年`}
                  note={`運賃収入 ${fmt(rev(k.last).fare)} 円（${taxLabel}）`}
                />
                <Stat
                  label={`累計（${years.length}年間）の延べ乗車人員`}
                  value={`${fmt(k.cumulative.riders)} 人`}
                  note={`運賃収入 ${fmt(rev(k.cumulative).fare)} 円（${taxLabel}）`}
                />
                <Stat
                  label={`累計の合計収入（${taxLabel}）`}
                  value={`${fmt(rev(k.cumulative).total)} 円`}
                  note="運賃収入＋その他収入（補助金・負担金は含みません）"
                />
              </div>
            </div>
          )}

          <div className="card">
            <h3>年度別のグラフ</h3>
            <SeriesChart
              ref={ridersChart}
              title="年度別 延べ乗車人員"
              unit="人/年"
              years={years}
              series={shown.map((r, i) => ({
                name: r.scenarioName,
                color: SERIES_COLORS[i % SERIES_COLORS.length],
                values: r.demand.map((d) => d.totalAnnual),
              }))}
              footnote={meta}
            />
            <SeriesChart
              ref={revenueChart}
              title={`年度別 運賃収入（${taxLabel}）`}
              unit="円"
              years={years}
              series={shown.map((r, i) => ({
                name: r.scenarioName,
                color: SERIES_COLORS[i % SERIES_COLORS.length],
                values: r.revenue.map((x) => rev(x).fare),
              }))}
              footnote={meta}
            />
            <ExportBar
              project={project}
              state={state}
              detail={detail}
              ridersChart={ridersChart}
              revenueChart={revenueChart}
            />
          </div>

          <YearTable result={detail} taxIncluded={taxIncluded} />
          <Breakdown result={detail} />
          {detailScenario && (
            <ReferenceCompare project={project} scenario={detailScenario} result={detail} />
          )}
        </>
      )}

      <p className="hint">
        推計は「人口 × 外出率 × 1日トリップ数 ×
        バス分担率」の積み上げです。係数は全国都市交通特性調査（令和3年）の値で、
        根拠のない補正（立ち上がり・運賃弾力性など）は、入力しない限り効かせていません。出典は「前提条件」画面にあります。
      </p>
    </section>
  )
}
