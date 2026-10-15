import type { Scenario, YearAmount } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fmt } from '../../util/format'

type Props = { scenario: Scenario; startFiscalYear: number; years: number; disabled: boolean }

type Kind = 'otherRevenue' | 'subsidies'

function AmountTable({
  scenario,
  kind,
  title,
  note,
  startFiscalYear,
  years,
}: {
  scenario: Scenario
  kind: Kind
  title: string
  note: string
  startFiscalYear: number
  years: number
}) {
  const rows = scenario[kind]
  const set = (fn: (r: YearAmount[]) => YearAmount[]) =>
    useProjectStore.getState().updateScenario(scenario.id, (s) => ({ ...s, [kind]: fn(s[kind]) }))
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <div>
      <h4>{title}</h4>
      <p className="hint">{note}</p>
      {rows.length > 0 && (
        <table className="table" aria-label={title}>
          <thead>
            <tr>
              <th>年度</th>
              <th>項目（例：広告・ラッピング・企業協賛）</th>
              <th>金額（円）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    aria-label="年度"
                    min={2000}
                    max={2100}
                    value={r.fiscalYear}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber
                      if (Number.isFinite(v))
                        set((x) =>
                          x.map((y, j) => (j === i ? { ...y, fiscalYear: Math.round(v) } : y)),
                        )
                    }}
                  />
                </td>
                <td>
                  <input
                    aria-label="項目"
                    value={r.item}
                    onChange={(e) =>
                      set((x) => x.map((y, j) => (j === i ? { ...y, item: e.target.value } : y)))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    aria-label="金額（円）"
                    value={r.amount}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber
                      if (Number.isFinite(v))
                        set((x) => x.map((y, j) => (j === i ? { ...y, amount: v } : y)))
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => set((x) => x.filter((_, j) => j !== i))}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => set((x) => [...x, { fiscalYear: startFiscalYear, item: '', amount: 0 }])}
      >
        ＋ 行を追加
      </button>
      <button
        type="button"
        className="btn"
        title={`${years}年分の行を、同じ金額で作ります`}
        onClick={() => {
          const raw = prompt('毎年の金額（円）を入力してください')
          const v = raw === null ? NaN : Number(raw)
          if (!Number.isFinite(v)) return
          const item = prompt('項目名（例：広告）') ?? ''
          set((x) => [
            ...x,
            ...Array.from({ length: years }, (_, i) => ({
              fiscalYear: startFiscalYear + i,
              item,
              amount: v,
            })),
          ])
        }}
      >
        ＋ 全年度に同じ金額を入れる
      </button>
      {rows.length > 0 && <span className="hint"> 合計 {fmt(total)} 円</span>}
    </div>
  )
}

/** その他収入（F-6-2）と補助金・負担金（F-6-3。参考扱い） */
export function RevenueInputsSection({ scenario, startFiscalYear, years, disabled }: Props) {
  return (
    <div className="card">
      <h3>運賃以外の収入</h3>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
        <AmountTable
          scenario={scenario}
          kind="otherRevenue"
          title="その他収入（広告・ラッピング・企業協賛など）"
          note="入力した金額のまま、年度ごとの合計収入に加えます。"
          startFiscalYear={startFiscalYear}
          years={years}
        />
        <AmountTable
          scenario={scenario}
          kind="subsidies"
          title="補助金・負担金（参考）"
          note="参考として別に集計し、合計収入には含めません。"
          startFiscalYear={startFiscalYear}
          years={years}
        />
      </fieldset>
    </div>
  )
}
