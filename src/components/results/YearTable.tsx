import type { ScenarioResult } from '../../calc/pipeline'
import { fmt } from '../../util/format'

/** 年度別の延べ乗車人員と収入の表（F-6-1〜F-6-4） */
export function YearTable({
  result,
  taxIncluded,
}: {
  result: ScenarioResult
  taxIncluded: boolean
}) {
  const tax = taxIncluded ? '税込' : '税抜'
  return (
    <div className="card">
      <h3>年度別の延べ乗車人員と収入</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" aria-label="年度別の延べ乗車人員と収入">
          <thead>
            <tr>
              <th>年度</th>
              <th className="num">運行日数（平日／土休日）</th>
              <th className="num">1日の延べ乗車人員（平日／土休日）</th>
              <th className="num">年間の延べ乗車人員</th>
              <th className="num">平均運賃（円）</th>
              <th className="num">運賃収入（円・{tax}）</th>
              <th className="num">その他収入（円）</th>
              <th className="num">合計（円・{tax}）</th>
              <th className="num">補助金・負担金（参考・円）</th>
              <th>頭打ち</th>
            </tr>
          </thead>
          <tbody>
            {result.demand.map((d, i) => {
              const r = result.revenue[i]
              const capped = [d.capped.weekday ? '平日' : '', d.capped.holiday ? '土休日' : '']
                .filter(Boolean)
                .join('・')
              return (
                <tr key={d.fiscalYear}>
                  <td>{d.fiscalYear}</td>
                  <td className="num">
                    {d.days.weekday}／{d.days.holiday}
                  </td>
                  <td className="num">
                    {fmt(d.dailyRiders.weekday, 1)}／{fmt(d.dailyRiders.holiday, 1)}
                  </td>
                  <td className="num">{fmt(d.totalAnnual)}</td>
                  <td className="num">{fmt(r.effectiveFare, 1)}</td>
                  <td className="num">{fmt(taxIncluded ? r.fareRevenue : r.fareRevenueExTax)}</td>
                  <td className="num">{fmt(r.otherRevenue)}</td>
                  <td className="num">{fmt(taxIncluded ? r.total : r.totalExTax)}</td>
                  <td className="num">{fmt(r.subsidies)}</td>
                  <td>{capped ? <span className="badge badge-warning">{capped}</span> : '−'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        補助金・負担金は参考として別に集計し、合計には含めていません。その他収入と補助金は、入力した金額のまま（税の扱いは変えていません）です。
      </p>
    </div>
  )
}
