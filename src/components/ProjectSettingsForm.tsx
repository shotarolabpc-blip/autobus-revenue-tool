import { useEffect, useState } from 'react'
import type { DefaultsFile, Municipality, Prefecture } from '../data/schemas'
import { loadMunicipalities } from '../data/staticData'
import type { NewProjectInput } from '../project/factory'

type Props = {
  prefectures: Prefecture[]
  defaults: DefaultsFile
  initial: NewProjectInput
  submitLabel: string
  onSubmit: (v: NewProjectInput) => void
  onCancel?: () => void
}

/** プロジェクトの基本情報（名称・対象自治体・推計開始年度・推計年数。F-1-1） */
export function ProjectSettingsForm({
  prefectures,
  defaults,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [v, setV] = useState(initial)
  // 入力前からエラーを出さないよう、一度ボタンを押してから表示する
  const [submitted, setSubmitted] = useState(false)
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const years = defaults.items.projectYears

  useEffect(() => {
    let alive = true
    loadMunicipalities(v.prefCode).then((m) => alive && setMunicipalities(m))
    return () => {
      alive = false
    }
  }, [v.prefCode])

  const errors: string[] = []
  if (!v.name.trim()) errors.push('プロジェクト名を入力してください')
  if (!Number.isInteger(v.startFiscalYear) || v.startFiscalYear < 2000 || v.startFiscalYear > 2100)
    errors.push('推計開始年度は2000〜2100の整数で入力してください')
  if (!Number.isInteger(v.years) || v.years < (years.min ?? 1) || v.years > (years.max ?? 50))
    errors.push(`推計年数は${years.min}〜${years.max}年で入力してください`)

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (errors.length === 0) onSubmit({ ...v, name: v.name.trim() })
      }}
    >
      <label className="field">
        <span>プロジェクト名</span>
        <input
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          placeholder="例：○○市 自動運転バス 駅前循環線"
          required
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>都道府県</span>
          <select
            value={v.prefCode}
            onChange={(e) =>
              setV({ ...v, prefCode: e.target.value, cityCode: null, municipalityName: '' })
            }
          >
            {prefectures.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
                {p.dataAvailable ? '' : '（データ未整備）'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>対象自治体（市区町村）</span>
          {municipalities.length > 0 ? (
            <select
              value={v.cityCode ?? ''}
              onChange={(e) => {
                const m = municipalities.find((x) => x.code === e.target.value)
                setV({ ...v, cityCode: m?.code ?? null, municipalityName: m?.name ?? '' })
              }}
            >
              <option value="">（選択してください）</option>
              {municipalities.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={v.municipalityName}
              onChange={(e) => setV({ ...v, municipalityName: e.target.value })}
              placeholder="例：千代田区"
            />
          )}
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>推計開始年度</span>
          <input
            type="number"
            value={Number.isNaN(v.startFiscalYear) ? '' : v.startFiscalYear}
            onChange={(e) => setV({ ...v, startFiscalYear: e.target.valueAsNumber })}
          />
        </label>
        <label className="field">
          <span>
            推計年数（{years.min}〜{years.max}年）
          </span>
          <input
            type="number"
            min={years.min}
            max={years.max}
            value={Number.isNaN(v.years) ? '' : v.years}
            onChange={(e) => setV({ ...v, years: e.target.valueAsNumber })}
          />
          <small className="hint">
            初期値 {years.value}年：{years.source}
          </small>
        </label>
      </div>
      {submitted && errors.length > 0 && (
        <ul className="form-errors">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitted && errors.length > 0}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
