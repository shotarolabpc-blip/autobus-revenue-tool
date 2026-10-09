import { checkCategories, effectiveFare, excludeTax, fareTable } from '../../calc/fare'
import type { DefaultsFile } from '../../data/schemas'
import { stopDistancesKm } from '../../gis/route'
import type { Fare, Scenario } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fareSettings, overridesByIndex } from '../../calc/fareInputs'
import { fmt } from '../../util/format'
import { NumField, Stat } from '../fields'

/** 割引区分の名前の候補（F-4-6） */
const CATEGORY_NAMES = ['小児', '高齢者', '障がい者', '定期券', '回数券', '無料パス']

/** 運賃設計（F-4-1〜F-4-3、F-4-5、F-4-6） */
export function FareSection({
  scenario,
  defaults,
}: {
  scenario: Scenario
  defaults: DefaultsFile
}) {
  const f = scenario.fare
  const tax = defaults.items.consumptionTaxRate
  const setFare = (patch: Partial<Fare>) =>
    useProjectStore
      .getState()
      .updateScenario(scenario.id, (s) => ({ ...s, fare: { ...s.fare, ...patch } }))

  const { stopKm, totalKm } = stopDistancesKm(scenario.route, scenario.stops)
  const overrides = overridesByIndex(scenario)
  const table = fareTable(stopKm, scenario.route.loop, totalKm, fareSettings(f), overrides)
  const auto = fareTable(stopKm, scenario.route.loop, totalKm, fareSettings(f))
  const cat = checkCategories(f.categories)
  const n = scenario.stops.length

  const setCell = (i: number, j: number, value: number | null) => {
    const from = scenario.stops[i].id
    const to = scenario.stops[j].id
    const rest = f.tableOverrides.filter((o) => !(o.fromStopId === from && o.toStopId === to))
    // 往復ルートは、逆向きも同じ運賃にそろえる（三角表）
    const both = scenario.route.loop
      ? rest
      : rest.filter((o) => !(o.fromStopId === to && o.toStopId === from))
    const add =
      value === null
        ? []
        : scenario.route.loop
          ? [{ fromStopId: from, toStopId: to, fare: value }]
          : [
              { fromStopId: from, toStopId: to, fare: value },
              { fromStopId: to, toStopId: from, fare: value },
            ]
    setFare({ tableOverrides: [...both, ...add] })
  }

  const flatEff = effectiveFare(f.flatFare, f.categories)

  return (
    <>
      <div className="card">
        <h3>運賃（F-4）</h3>
        <div className="field-row">
          <label className="field field-compact">
            <span>運賃制度区分</span>
            <select
              value={f.system}
              onChange={(e) => setFare({ system: e.target.value as Fare['system'] })}
            >
              <option value="実施運賃">実施運賃（上限運賃の範囲内で届出）</option>
              <option value="協議運賃">協議運賃（協議会で協議が調ったうえで届出）</option>
            </select>
            <small className="hint">計算には使わず、出力物に記載します。</small>
          </label>
          <label className="field field-compact">
            <span>制定形態</span>
            <select
              value={f.type}
              onChange={(e) => setFare({ type: e.target.value as Fare['type'] })}
            >
              <option value="flat">均一制</option>
              <option value="distance">対キロ区間制</option>
            </select>
          </label>
        </div>
        {f.type === 'flat' ? (
          <div className="field-grid">
            <NumField
              label="運賃（1乗車・税込）"
              unit="円"
              step={10}
              value={f.flatFare}
              onChange={(x) => setFare({ flatFare: x ?? 0 })}
            />
          </div>
        ) : (
          <div className="field-grid">
            <NumField
              label="初乗り運賃（税込）"
              unit="円"
              step={10}
              value={f.baseFare}
              onChange={(x) => setFare({ baseFare: x ?? 0 })}
            />
            <NumField
              label="賃率（税込）"
              unit="円/km"
              value={f.ratePerKm}
              onChange={(x) => setFare({ ratePerKm: x ?? 0 })}
            />
            <label className="field field-compact">
              <span>端数処理（10円単位）</span>
              <select
                value={f.rounding}
                onChange={(e) => setFare({ rounding: e.target.value as Fare['rounding'] })}
              >
                <option value="ceil10">切上げ</option>
                <option value="round10">四捨五入</option>
                <option value="floor10">切捨て</option>
              </select>
            </label>
            <NumField
              label="平均乗車距離（仮定値）"
              unit="km"
              value={f.avgRideKmOverride}
              placeholder="自動"
              onChange={(x) => setFare({ avgRideKmOverride: x })}
              hint="空欄なら、バス停別の推計乗車数で重み付けし、行き先は均等とみなして平均（暫定）"
            />
          </div>
        )}
        <p className="hint">
          運賃は税込で入力します。税抜換算は {tax.source} による（税率 {tax.value * 100}%）。
        </p>
      </div>

      <div className="card">
        <h3>運賃表（F-4-5）</h3>
        {n < 2 ? (
          <p className="hint">バス停を2つ以上登録すると、運賃表が表示されます。</p>
        ) : (
          <>
            <p className="hint">
              セルを書き換えると手修正になります（太字）。空欄にすると自動計算に戻ります。
              {scenario.route.loop
                ? '循環ルートのため、行（乗車）→ 列（降車）の向きで表示します。'
                : '往復ルートのため、逆向きも同じ運賃です。'}
            </p>
            <div className="table-scroll">
              <table className="table fare-table">
                <thead>
                  <tr>
                    <th>乗車＼降車</th>
                    {scenario.stops.map((s, j) => (
                      <th key={s.id} title={s.name}>
                        {j + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scenario.stops.map((s, i) => (
                    <tr key={s.id}>
                      <th title={s.name}>
                        {i + 1}. {s.name}
                      </th>
                      {scenario.stops.map((t, j) => {
                        const show = scenario.route.loop ? i !== j : j > i
                        if (!show) return <td key={t.id} className="fare-cell-empty" />
                        const manual = overrides.has(`${i}-${j}`)
                        return (
                          <td key={t.id} className={manual ? 'is-manual' : undefined}>
                            <input
                              type="number"
                              step={10}
                              min={0}
                              aria-label={`${s.name}→${t.name}の運賃`}
                              value={table[i][j] ?? ''}
                              title={manual ? `手修正（自動計算：${auto[i][j]}円）` : '自動計算'}
                              onChange={(e) =>
                                setCell(
                                  i,
                                  j,
                                  e.target.value === ''
                                    ? null
                                    : Math.max(0, e.target.valueAsNumber),
                                )
                              }
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {f.tableOverrides.length > 0 && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setFare({ tableOverrides: [] })}
              >
                手修正をすべて取り消す
              </button>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>割引区分と実効平均運賃（F-4-6）</h3>
        <table className="table table-compact">
          <thead>
            <tr>
              <th>区分</th>
              <th className="num">利用者構成比（%）</th>
              <th className="num">割引率（%）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {f.categories.map((c, k) => (
              <tr key={k}>
                <td>
                  <input
                    aria-label={`区分${k + 1}の名称`}
                    value={c.name}
                    onChange={(e) =>
                      setFare({
                        categories: f.categories.map((x, i) =>
                          i === k ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`区分${k + 1}の構成比`}
                    value={Math.round(c.share * 1000) / 10}
                    onChange={(e) =>
                      setFare({
                        categories: f.categories.map((x, i) =>
                          i === k
                            ? {
                                ...x,
                                share:
                                  Math.min(100, Math.max(0, e.target.valueAsNumber || 0)) / 100,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`区分${k + 1}の割引率`}
                    value={Math.round(c.discount * 1000) / 10}
                    onChange={(e) =>
                      setFare({
                        categories: f.categories.map((x, i) =>
                          i === k
                            ? {
                                ...x,
                                discount:
                                  Math.min(100, Math.max(0, e.target.valueAsNumber || 0)) / 100,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    aria-label={`区分${k + 1}を削除`}
                    disabled={f.categories.length <= 1}
                    onClick={() => setFare({ categories: f.categories.filter((_, i) => i !== k) })}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="button-row">
          {CATEGORY_NAMES.filter((nm) => !f.categories.some((c) => c.name === nm)).map((nm) => (
            <button
              key={nm}
              type="button"
              className="btn btn-small"
              onClick={() =>
                setFare({ categories: [...f.categories, { name: nm, share: 0, discount: 0 }] })
              }
            >
              ＋ {nm}
            </button>
          ))}
        </div>
        {!cat.ok && (
          <p className="text-warning">
            構成比の合計が {fmt(cat.shareTotal * 100, 1)}% です。100%
            になるように入力してください（計算では合計で割って比率にそろえます）。
          </p>
        )}
        <div className="stats">
          {f.type === 'flat' ? (
            <>
              <Stat
                label="実効平均運賃（税込）"
                value={`${fmt(flatEff, 1)} 円`}
                note="Σ（構成比 × 運賃 × (1 − 割引率)）"
              />
              <Stat
                label="実効平均運賃（税抜）"
                value={`${fmt(excludeTax(flatEff, tax.value), 1)} 円`}
              />
            </>
          ) : (
            <Stat
              label="実効平均運賃"
              value="推計結果の画面で表示"
              note="対キロ区間制は、バス停別の推計乗車数と平均乗車距離から算出します"
            />
          )}
        </div>
      </div>
    </>
  )
}
