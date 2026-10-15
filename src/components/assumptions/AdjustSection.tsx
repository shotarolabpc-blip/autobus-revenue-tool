import type { DefaultsFile } from '../../data/schemas'
import type { Scenario } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { NumField, TextField } from '../fields'

type Props = { scenario: Scenario; defaults: DefaultsFile; disabled: boolean }

/**
 * 補正係数（立ち上がり・運行サービス・運賃弾力性）、路線捕捉率、エリア全体の人口補正（5.1A、F-5-3）。
 * 根拠のある公的な値がないものは、既定では効かせない（立ち上がり＝100%、弾力性＝0、運行サービス＝1）。
 * 値を入れるときは出典を書いてもらい、結果と出力物に「ユーザー設定」と出典を載せる。
 */
export function AdjustSection({ scenario, defaults, disabled }: Props) {
  const c = scenario.coefficients
  const setCoef = (patch: Partial<Scenario['coefficients']>) =>
    useProjectStore
      .getState()
      .updateScenario(scenario.id, (s) => ({ ...s, coefficients: { ...s.coefficients, ...patch } }))
  const setArea = (v: number) =>
    useProjectStore
      .getState()
      .updateScenario(scenario.id, (s) => ({ ...s, areaPopulationAdjustPctPerYear: v }))

  const rampSorted = [...c.rampUp].sort((a, b) => a.yearIndex - b.yearIndex)
  const needSource = (changed: boolean, source: string | null) => changed && !(source ?? '').trim()
  const elasticityChanged = c.fareElasticity !== 0
  const serviceChanged = c.serviceFactor !== 1

  return (
    <div className="card">
      <h3>補正係数・路線捕捉率・エリア全体の人口補正</h3>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
        <p className="hint">
          公的な根拠のある値がないため、立ち上がり係数は100%、運賃弾力性は0、運行サービス補正は1（＝補正なし）を初期値にしています
          （{defaults.items.rampUpFactor.source}
          ）。値を入れたときは、出典を必ず書いてください。結果と出力物に「ユーザー設定」と出典が載ります。
        </p>
        <div className="field-grid">
          <NumField
            label="運行サービス補正係数（便数・運行時間帯）"
            value={c.serviceFactor}
            onChange={(v) => setCoef({ serviceFactor: v ?? 1 })}
            step="any"
            hint="1＝補正なし。需要に掛けます"
          />
          <TextField
            label="運行サービス補正の出典"
            value={c.serviceFactorSource ?? ''}
            required={needSource(serviceChanged, c.serviceFactorSource)}
            onChange={(v) => setCoef({ serviceFactorSource: v || null })}
          />
          <NumField
            label="運賃弾力性"
            value={c.fareElasticity}
            onChange={(v) => setCoef({ fareElasticity: v ?? 0 })}
            min={0}
            step="any"
            hint="運賃が基準より1%上がると、利用が何%減るか。0＝運賃を変えても利用が変わらない計算"
          />
          <NumField
            label="運賃弾力性の基準運賃（税込）"
            unit="円"
            value={c.referenceFare}
            onChange={(v) => setCoef({ referenceFare: v })}
            hint="弾力性を使うときに必要です"
          />
          <TextField
            label="運賃弾力性の出典"
            value={c.fareElasticitySource ?? ''}
            required={needSource(elasticityChanged, c.fareElasticitySource)}
            onChange={(v) => setCoef({ fareElasticitySource: v || null })}
          />
          <NumField
            label="路線捕捉率（手入力）"
            unit="%"
            min={0}
            max={100}
            value={
              c.routeCaptureOverride === null
                ? null
                : Math.round(c.routeCaptureOverride * 10000) / 100
            }
            onChange={(v) => setCoef({ routeCaptureOverride: v === null ? null : v / 100 })}
            placeholder="空欄＝100%"
            hint="勢圏が既存のバス路線と重なるときは、本路線を使う割合を入れてください。空欄は、重なりを考慮しない（100%）計算です。"
          />
          <NumField
            label="エリア全体の人口補正率"
            unit="%/年"
            min={-100}
            value={scenario.areaPopulationAdjustPctPerYear}
            onChange={(v) => setArea(v ?? 0)}
            hint="人口推計から上下させたいとき（例：−0.5）。複利で毎年かかります"
          />
        </div>

        <h4>立ち上がり係数（運行開始からの年数ごと）</h4>
        <p className="hint">
          運行開始から何年目以降に何倍にするか。例：0年目 50%、1年目 80%、2年目
          100%。設定がない年は100%です。
        </p>
        <table className="table" aria-label="立ち上がり係数">
          <thead>
            <tr>
              <th>運行開始から（年目以降）</th>
              <th>係数（%）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rampSorted.map((r) => (
              <tr key={r.yearIndex}>
                <td className="num">{r.yearIndex}</td>
                <td>
                  <input
                    type="number"
                    aria-label={`${r.yearIndex}年目の係数（%）`}
                    min={0}
                    step="any"
                    value={Math.round(r.factor * 10000) / 100}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber
                      if (!Number.isFinite(v) || v < 0) return
                      setCoef({
                        rampUp: c.rampUp.map((x) =>
                          x.yearIndex === r.yearIndex ? { ...x, factor: v / 100 } : x,
                        ),
                      })
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() =>
                      setCoef({ rampUp: c.rampUp.filter((x) => x.yearIndex !== r.yearIndex) })
                    }
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
          onClick={() => {
            const next =
              rampSorted.length === 0 ? 0 : rampSorted[rampSorted.length - 1].yearIndex + 1
            setCoef({ rampUp: [...c.rampUp, { yearIndex: next, factor: 1 }] })
          }}
        >
          ＋ 行を追加
        </button>
        <TextField
          label="立ち上がり係数の出典"
          value={c.rampUpSource ?? ''}
          required={needSource(c.rampUp.length > 0, c.rampUpSource)}
          onChange={(v) => setCoef({ rampUpSource: v || null })}
        />
      </fieldset>
    </div>
  )
}
