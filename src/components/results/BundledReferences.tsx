import { useState } from 'react'
import { referenceKpi } from '../../calc/reference'
import type { ReferenceActualsFile } from '../../data/schemas'
import { newId } from '../../project/factory'
import type { UserReference } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fmt } from '../../util/format'

type Item = ReferenceActualsFile['items'][number]

const CATEGORY_LABELS = {
  route: '路線バス',
  community: 'コミュニティバス',
  other: 'その他',
} as const

const sourceText = (i: Item) => `${i.source.title}（${i.source.url}、${i.source.checkedAt}確認）`

/** 同梱の参考実績の一覧・検索・絞り込み（事業者・規模。F-5-5）。「比較に追加」でプロジェクトの実績に入れる */
export function BundledReferences({
  data,
  existing,
}: {
  data: ReferenceActualsFile
  existing: UserReference[]
}) {
  const [q, setQ] = useState('')
  const [operator, setOperator] = useState('')
  const [category, setCategory] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')

  const operators = [...new Set(data.items.map((i) => i.operator))].sort()
  const minV = min === '' ? null : Number(min)
  const maxV = max === '' ? null : Number(max)
  const shown = data.items.filter(
    (i) =>
      (q === '' || `${i.name} ${i.operator}`.includes(q)) &&
      (operator === '' || i.operator === operator) &&
      (category === '' || i.category === category) &&
      (minV === null || i.dailyRiders >= minV) &&
      (maxV === null || i.dailyRiders <= maxV),
  )
  const added = (i: Item) => existing.some((e) => e.name === i.name && e.source === sourceText(i))

  return (
    <div>
      <h4>同梱の参考実績（{data.items.length}件）</h4>
      <p className="hint">{data.note}</p>
      {data.items.length === 0 ? (
        <p className="hint">
          同梱の参考実績は、まだ入っていません。公式の資料から読み取って確認した実績を入れる手順は、
          <code>docs/reference_data.md</code> にあります。
        </p>
      ) : (
        <>
          <div className="field-grid">
            <label className="field field-compact">
              <span>路線名・事業者で検索</span>
              <input
                aria-label="路線名・事業者で検索"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="field field-compact">
              <span>事業者</span>
              <select
                aria-label="事業者で絞り込む"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
              >
                <option value="">すべて</option>
                {operators.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-compact">
              <span>種別</span>
              <select
                aria-label="種別で絞り込む"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">すべて</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-compact">
              <span>規模：1日の乗車人員（下限）</span>
              <input
                aria-label="1日の乗車人員の下限"
                type="number"
                min={0}
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label className="field field-compact">
              <span>規模：1日の乗車人員（上限）</span>
              <input
                aria-label="1日の乗車人員の上限"
                type="number"
                min={0}
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" aria-label="同梱の参考実績">
              <thead>
                <tr>
                  <th>路線</th>
                  <th>種別</th>
                  <th className="num">1日の乗車人員</th>
                  <th className="num">平均運賃（円）</th>
                  <th>出典</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const k = referenceKpi({ ...i, source: sourceText(i) })
                  return (
                    <tr key={i.id}>
                      <td>
                        {i.name}
                        <div className="hint">
                          {i.operator}
                          {i.fiscalYear ? `（${i.fiscalYear}年度）` : ''}
                        </div>
                      </td>
                      <td>{CATEGORY_LABELS[i.category]}</td>
                      <td className="num">{fmt(i.dailyRiders)}</td>
                      <td className="num">{k.avgFare === null ? '−' : fmt(k.avgFare, 1)}</td>
                      <td>
                        <a href={i.source.url} target="_blank" rel="noopener noreferrer">
                          {i.source.title}
                        </a>
                        （{i.source.checkedAt}確認）
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={added(i)}
                          onClick={() =>
                            useProjectStore.getState().updateProject((p) => ({
                              ...p,
                              userReferenceData: [
                                ...p.userReferenceData,
                                { ...i, id: newId(), source: sourceText(i) },
                              ],
                            }))
                          }
                        >
                          {added(i) ? '追加済み' : '比較に追加'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
