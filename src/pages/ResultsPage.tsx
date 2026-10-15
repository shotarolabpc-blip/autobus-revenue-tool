import { FareWarningsBox } from '../components/FareWarningsBox'

export function ResultsPage() {
  return (
    <section className="page">
      <h2>推計結果</h2>
      <FareWarningsBox />
      <p className="page-placeholder">
        ここに年度別の延べ乗車人員・収入のグラフと表を表示します（準備中）。
      </p>
    </section>
  )
}
