import { useState } from 'react'
import { AGE_CLASSES_7 } from '../../calc/ageClasses'
import { applyOverrides } from '../../calc/pipeline'
import { judgeCityType } from '../../data/coefficients'
import type { CityTypesFile, CoefficientsFile } from '../../data/schemas'
import type { ProjectFile, Scenario } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fmt } from '../../util/format'
import { NumField, TextField } from '../fields'

type Props = {
  project: ProjectFile
  scenario: Scenario
  coefficients: CoefficientsFile
  cityTypes: CityTypesFile
  disabled: boolean
}

const ITEMS = [
  { key: 'outingRate', label: '外出率' },
  { key: 'tripRate', label: 'トリップ数（回/人/日）' },
  { key: 'busShare', label: 'バス分担率' },
] as const

/** 都市類型と、外出率・トリップ数・バス分担率の係数（5.1A）。値は出典つきで上書きできる */
export function CoefficientSection({
  project,
  scenario,
  coefficients,
  cityTypes,
  disabled,
}: Props) {
  const m = project.project.municipality
  const judged = judgeCityType(
    coefficients,
    cityTypes,
    m.prefCode,
    m.cityCode,
    scenario.coefficients.cityTypeOverride,
  )
  const base = coefficients.values[String(judged.code)]
  const applied = applyOverrides(base, scenario.coefficients.overrides)
  const setCoef = (patch: Partial<Scenario['coefficients']>) =>
    useProjectStore
      .getState()
      .updateScenario(scenario.id, (s) => ({ ...s, coefficients: { ...s.coefficients, ...patch } }))

  const [draft, setDraft] = useState<{
    day: 'weekday' | 'holiday'
    age: string
    item: (typeof ITEMS)[number]['key']
    value: number | null
    source: string
  }>({ day: 'weekday', age: '65-74', item: 'busShare', value: null, source: '' })
  const key = `${draft.item}.${draft.day}.${draft.age}`
  const canAdd = draft.value !== null && draft.source.trim() !== ''
  const pct = (v: number) => `${fmt(v * 100, 2)}%`

  return (
    <div className="card">
      <h3>都市類型と係数（外出率・トリップ数・バス分担率）</h3>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="field-row">
          <label className="field field-compact">
            <span>都市類型</span>
            <select
              aria-label="都市類型"
              value={scenario.coefficients.cityTypeOverride ?? ''}
              onChange={(e) => setCoef({ cityTypeOverride: e.target.value || null })}
            >
              <option value="">
                自動判定（{judged.auto ? judged.name : '判定できない場合は全国計'}）
              </option>
              {coefficients.cityTypes.map((c) => (
                <option key={c.code} value={String(c.code)}>
                  {c.name}
                </option>
              ))}
            </select>
            <small className="hint">
              使用中：{judged.name}。{judged.basis}
            </small>
          </label>
        </div>
        <p className="hint">
          出典：{coefficients.survey.name}（{coefficients.survey.provider}）。
          {Object.values(coefficients.tables).join(' ／ ')}。
          年齢区分は調査の区分をそのまま使っています（Q3：B）。
          {coefficients.ageMapping['0-4']?.provisional &&
            '0〜4歳は調査の対象外のため、暫定で5〜14歳の値を使っています（確認事項 Q2 が未決定）。'}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" aria-label="係数の表">
            <thead>
              <tr>
                <th rowSpan={2}>年齢区分</th>
                <th colSpan={3}>平日</th>
                <th colSpan={3}>土休日</th>
              </tr>
              <tr>
                <th className="num">外出率</th>
                <th className="num">トリップ数</th>
                <th className="num">バス分担率</th>
                <th className="num">外出率</th>
                <th className="num">トリップ数</th>
                <th className="num">バス分担率</th>
              </tr>
            </thead>
            <tbody>
              {AGE_CLASSES_7.map((age) => (
                <tr key={age}>
                  <td>{age}歳</td>
                  {(['weekday', 'holiday'] as const).flatMap((day) =>
                    ITEMS.map((it) => {
                      const v = applied.coefficients[day][age][it.key]
                      const over = applied.applied.includes(`${it.key}.${day}.${age}`)
                      return (
                        <td key={`${day}-${it.key}`} className="num">
                          {it.key === 'tripRate' ? fmt(v, 3) : pct(v)}
                          {over && <span className="badge badge-warning">上書き</span>}
                        </td>
                      )
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4>係数を上書きする（出典が必要です）</h4>
        <p className="hint">
          手元に根拠のある値があるときだけ使ってください。上書きした値は、結果の画面と出力物に「ユーザー設定」と出典つきで載ります。
        </p>
        <div className="field-grid">
          <label className="field field-compact">
            <span>日種別</span>
            <select
              aria-label="上書きする日種別"
              value={draft.day}
              onChange={(e) => setDraft({ ...draft, day: e.target.value as 'weekday' | 'holiday' })}
            >
              <option value="weekday">平日</option>
              <option value="holiday">土休日</option>
            </select>
          </label>
          <label className="field field-compact">
            <span>年齢区分</span>
            <select
              aria-label="上書きする年齢区分"
              value={draft.age}
              onChange={(e) => setDraft({ ...draft, age: e.target.value })}
            >
              {AGE_CLASSES_7.map((a) => (
                <option key={a} value={a}>
                  {a}歳
                </option>
              ))}
            </select>
          </label>
          <label className="field field-compact">
            <span>項目</span>
            <select
              aria-label="上書きする項目"
              value={draft.item}
              onChange={(e) => setDraft({ ...draft, item: e.target.value as typeof draft.item })}
            >
              {ITEMS.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <NumField
            label="新しい値（割合は 0.05 のように入力）"
            value={draft.value}
            onChange={(v) => setDraft({ ...draft, value: v })}
            step="any"
          />
          <TextField
            label="出典（資料名・調査年など）"
            value={draft.source}
            required
            onChange={(v) => setDraft({ ...draft, source: v })}
          />
        </div>
        <button
          type="button"
          className="btn"
          disabled={!canAdd}
          onClick={() => {
            setCoef({
              overrides: [
                ...scenario.coefficients.overrides.filter((o) => o.key !== key),
                { key, value: draft.value ?? 0, source: draft.source.trim() },
              ],
            })
            setDraft({ ...draft, value: null, source: '' })
          }}
        >
          上書きを追加
        </button>
        {scenario.coefficients.overrides.length > 0 && (
          <table className="table" aria-label="係数の上書き一覧">
            <thead>
              <tr>
                <th>項目</th>
                <th className="num">値</th>
                <th>出典</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scenario.coefficients.overrides.map((o) => (
                <tr key={o.key}>
                  <td>{o.key}</td>
                  <td className="num">{o.value}</td>
                  <td>{o.source}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() =>
                        setCoef({
                          overrides: scenario.coefficients.overrides.filter((x) => x.key !== o.key),
                        })
                      }
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>
    </div>
  )
}
