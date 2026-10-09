import type { ReactNode } from 'react'

/** 数値の入力欄。空欄は null（要入力）として扱う */
export function NumField({
  label,
  value,
  onChange,
  unit,
  min = 0,
  max,
  step = 'any',
  required = false,
  hint,
  placeholder,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  min?: number
  max?: number
  step?: number | 'any'
  required?: boolean
  hint?: ReactNode
  placeholder?: string
}) {
  const missing = required && value === null
  return (
    <label className={`field field-compact${missing ? ' is-missing' : ''}`}>
      <span>
        {label}
        {missing && <em className="required">要入力</em>}
      </span>
      <span className="input-with-unit">
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => {
            if (e.target.value === '') return onChange(null)
            let v = e.target.valueAsNumber
            if (!Number.isFinite(v)) return
            if (min !== undefined) v = Math.max(min, v)
            if (max !== undefined) v = Math.min(max, v)
            onChange(v)
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}

/** はい／いいえ／未入力 の選択 */
export function TriField({
  label,
  value,
  onChange,
  yes = 'あり',
  no = 'なし',
  hint,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
  yes?: string
  no?: string
  hint?: ReactNode
}) {
  return (
    <label className={`field field-compact${value === null ? ' is-missing' : ''}`}>
      <span>
        {label}
        {value === null && <em className="required">要入力</em>}
      </span>
      <select
        aria-label={label}
        value={value === null ? '' : value ? 'yes' : 'no'}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'yes')}
      >
        <option value="">（未入力）</option>
        <option value="yes">{yes}</option>
        <option value="no">{no}</option>
      </select>
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}

/** 計算結果の表示 */
export function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}
