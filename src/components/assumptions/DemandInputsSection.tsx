import { newId } from '../../project/factory'
import type { Development, FacilityDemand, Scenario } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { NumField, TextField } from '../fields'

type Props = { scenario: Scenario; startFiscalYear: number; disabled: boolean }

const upd = (id: string, fn: (s: Scenario) => Scenario) =>
  useProjectStore.getState().updateScenario(id, fn)

const AGE4 = [
  ['0-14', '0〜14歳'],
  ['15-64', '15〜64歳'],
  ['65-74', '65〜74歳'],
  ['75+', '75歳以上'],
] as const

/** 開発計画（F-5-1・F-5-2）と施設需要（F-5-4）の入力 */
export function DemandInputsSection({ scenario, startFiscalYear, disabled }: Props) {
  const setDev = (id: string, patch: Partial<Development>) =>
    upd(scenario.id, (s) => ({
      ...s,
      developments: s.developments.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  const setFac = (id: string, patch: Partial<FacilityDemand>) =>
    upd(scenario.id, (s) => ({
      ...s,
      facilityDemand: s.facilityDemand.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  const first = scenario.stops[0]

  return (
    <>
      <div className="card">
        <h3>開発計画（住宅・マンションなど、人口が増える計画）</h3>
        <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
          <p className="hint">
            地点（緯度・経度）またはメッシュで場所を指定します。その場所を勢圏に含むバス停の人口に、開始年度から段階的に加わります。
            勢圏に入らない計画は、計算に入れず、結果画面で知らせます。
          </p>
          {scenario.developments.map((d) => (
            <div key={d.id} className="card">
              <div className="field-grid">
                <TextField
                  label="名称"
                  value={d.name}
                  onChange={(v) => setDev(d.id, { name: v })}
                />
                <label className="field field-compact">
                  <span>場所の指定</span>
                  <select
                    aria-label="場所の指定"
                    value={d.location.type}
                    onChange={(e) =>
                      setDev(d.id, {
                        location:
                          e.target.value === 'point'
                            ? { type: 'point', lat: first?.lat ?? 35.68, lng: first?.lng ?? 139.76 }
                            : { type: 'mesh', meshCode: '' },
                      })
                    }
                  >
                    <option value="point">地点（緯度・経度）</option>
                    <option value="mesh">メッシュ（9桁のコード）</option>
                  </select>
                </label>
                {d.location.type === 'point' ? (
                  <>
                    <NumField
                      label="緯度"
                      min={-90}
                      max={90}
                      value={d.location.lat}
                      onChange={(v) =>
                        d.location.type === 'point' &&
                        setDev(d.id, { location: { ...d.location, lat: v ?? d.location.lat } })
                      }
                    />
                    <NumField
                      label="経度"
                      min={-180}
                      max={180}
                      value={d.location.lng}
                      onChange={(v) =>
                        d.location.type === 'point' &&
                        setDev(d.id, { location: { ...d.location, lng: v ?? d.location.lng } })
                      }
                    />
                  </>
                ) : (
                  <TextField
                    label="メッシュコード（500mメッシュ・9桁）"
                    value={d.location.meshCode}
                    hint="人口メッシュのコード。9桁の数字"
                    onChange={(v) =>
                      setDev(d.id, {
                        location: { type: 'mesh', meshCode: v.replace(/\D/g, '').slice(0, 9) },
                      })
                    }
                  />
                )}
                <NumField
                  label="開始年度"
                  min={2000}
                  max={2100}
                  step={1}
                  value={d.startFiscalYear}
                  onChange={(v) => setDev(d.id, { startFiscalYear: v ?? startFiscalYear })}
                />
                <NumField
                  label="増える人数（入居が完了したとき）"
                  unit="人"
                  value={d.people}
                  onChange={(v) => setDev(d.id, { people: v ?? 0 })}
                />
                <NumField
                  label="入居にかける年数（段階入居）"
                  unit="年"
                  min={1}
                  step={1}
                  value={d.phaseYears}
                  onChange={(v) => setDev(d.id, { phaseYears: Math.max(1, Math.round(v ?? 1)) })}
                />
              </div>
              <label className="inline-radio">
                <input
                  type="checkbox"
                  checked={d.ageMix !== null}
                  onChange={(e) =>
                    setDev(d.id, {
                      ageMix: e.target.checked
                        ? { '0-14': 0.15, '15-64': 0.6, '65-74': 0.15, '75+': 0.1 }
                        : null,
                    })
                  }
                />
                年齢構成を指定する（しない場合は、その勢圏の年齢構成に合わせます）
              </label>
              {d.ageMix && (
                <div className="field-grid">
                  {AGE4.map(([k, label]) => (
                    <NumField
                      key={k}
                      label={`${label}の割合`}
                      unit="%"
                      min={0}
                      max={100}
                      value={Math.round((d.ageMix?.[k] ?? 0) * 1000) / 10}
                      onChange={(v) =>
                        d.ageMix && setDev(d.id, { ageMix: { ...d.ageMix, [k]: (v ?? 0) / 100 } })
                      }
                    />
                  ))}
                  {Math.abs(AGE4.reduce((a, [k]) => a + (d.ageMix?.[k] ?? 0), 0) - 1) > 1e-6 && (
                    <p className="error">
                      割合の合計が100%になっていません（合計で割って、割合をそろえて計算します）。
                    </p>
                  )}
                </div>
              )}
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() =>
                  upd(scenario.id, (s) => ({
                    ...s,
                    developments: s.developments.filter((x) => x.id !== d.id),
                  }))
                }
              >
                この開発計画を削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              upd(scenario.id, (s) => ({
                ...s,
                developments: [
                  ...s.developments,
                  {
                    id: newId(),
                    name: `開発計画${s.developments.length + 1}`,
                    location: {
                      type: 'point',
                      lat: first?.lat ?? 35.68,
                      lng: first?.lng ?? 139.76,
                    },
                    startFiscalYear,
                    people: 0,
                    phaseYears: 1,
                    ageMix: null,
                  },
                ],
              }))
            }
          >
            ＋ 開発計画を追加
          </button>
        </fieldset>
      </div>

      <div className="card">
        <h3>施設需要（病院・商業施設・観光地など）</h3>
        <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
          <p className="hint">
            来訪者数×バス利用率×2（往復）を、住民の需要とは別に加えます（補正係数は掛けません）。勢圏の中に住んでいる来訪者は、住民の需要と二重に数えるおそれがあるため、
            勢圏の外から来る人だけを入力してください。
          </p>
          {scenario.facilityDemand.map((f) => (
            <div key={f.id} className="card">
              <div className="field-grid">
                <TextField
                  label="名称"
                  value={f.name}
                  onChange={(v) => setFac(f.id, { name: v })}
                />
                <NumField
                  label="来訪者数（1日あたり）"
                  unit="人/日"
                  hint="来訪1人＝往復2乗車（行きと帰りのバス）として数えます"
                  value={f.visitorsPerDay}
                  onChange={(v) => setFac(f.id, { visitorsPerDay: v ?? 0 })}
                />
                <NumField
                  label="バス利用率"
                  unit="%"
                  min={0}
                  max={100}
                  value={Math.round(f.busShare * 1000) / 10}
                  onChange={(v) => setFac(f.id, { busShare: (v ?? 0) / 100 })}
                />
                <NumField
                  label="開始年度"
                  min={2000}
                  max={2100}
                  step={1}
                  value={f.startFiscalYear}
                  onChange={(v) => setFac(f.id, { startFiscalYear: v ?? startFiscalYear })}
                />
                <label className="field field-compact">
                  <span>来訪がある日</span>
                  <select
                    aria-label="来訪がある日"
                    value={f.days}
                    onChange={(e) =>
                      setFac(f.id, { days: e.target.value as FacilityDemand['days'] })
                    }
                  >
                    <option value="all">全運行日</option>
                    <option value="weekday">平日のみ</option>
                    <option value="holiday">土休日のみ</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() =>
                  upd(scenario.id, (s) => ({
                    ...s,
                    facilityDemand: s.facilityDemand.filter((x) => x.id !== f.id),
                  }))
                }
              >
                この施設を削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              upd(scenario.id, (s) => ({
                ...s,
                facilityDemand: [
                  ...s.facilityDemand,
                  {
                    id: newId(),
                    name: `施設${s.facilityDemand.length + 1}`,
                    visitorsPerDay: 0,
                    busShare: 0,
                    startFiscalYear,
                    days: 'all',
                  },
                ],
              }))
            }
          >
            ＋ 施設を追加
          </button>
        </fieldset>
      </div>
    </>
  )
}
