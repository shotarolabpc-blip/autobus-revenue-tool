import { suggestFares, upperLimitWarnings, type FareSuggestion } from '../../calc/fareSuggestion'
import type { FareReferencesFile } from '../../data/schemas'
import type { Fare, ProjectFile, Scenario } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { NumField } from '../fields'

type Props = {
  project: ProjectFile
  scenario: Scenario
  fareRefs: FareReferencesFile
}

function describe(s: FareSuggestion): string {
  return s.fareType === 'flat'
    ? `${s.flatFare} 円（均一）`
    : `初乗り ${s.baseFare} 円 ＋ ${s.ratePerKm} 円/km`
}

/** 「標準」「高め」の1列分（金額・根拠・もとにした参考データ・「〜にする」ボタン） */
function SuggestionColumn({
  title,
  s,
  tone,
  onApply,
}: {
  title: string
  s: FareSuggestion | null
  tone: string
  onApply: (s: FareSuggestion) => void
}) {
  return (
    <div className={`suggestion suggestion-${tone}`}>
      <div className="suggestion-title">{title}</div>
      {s ? (
        <>
          <div className="suggestion-value">{describe(s)}</div>
          <div className="hint">{s.basis}</div>
          {s.range && s.range.min !== s.range.max && (
            <div className="hint">
              参考にした運賃の幅：{s.range.min}〜{s.range.max}円
            </div>
          )}
          <button type="button" className="btn btn-small" onClick={() => onApply(s)}>
            {title}にする
          </button>
          {s.references.length > 0 && (
            <details className="suggestion-refs">
              <summary>もとにした参考データ（{s.references.length}件）</summary>
              <ul>
                {s.references.map((r) => (
                  <li key={r.id}>
                    {r.operator}：
                    {r.fareType === 'flat'
                      ? `${r.flatFare}円`
                      : `初乗り${r.baseFare}円＋${r.ratePerKm}円/km`}
                    <br />
                    <a href={r.source.url} target="_blank" rel="noopener noreferrer">
                      {r.source.title}
                    </a>
                    <small className="hint">（{r.source.checkedAt} 確認）</small>
                    {r.note && <small className="hint"> {r.note}</small>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <div className="hint">提案できません（下の理由を確認してください）</div>
      )}
    </div>
  )
}

/** 運賃の目安：「標準」（相場）と「高め」（上限運賃）の提案、上限運賃の入力と超過の警告（F-4-8） */
export function FareSuggestionCard({ project, scenario, fareRefs }: Props) {
  const f = scenario.fare
  const setFare = (patch: Partial<Fare>) =>
    useProjectStore
      .getState()
      .updateScenario(scenario.id, (s) => ({ ...s, fare: { ...s.fare, ...patch } }))
  const upper = f.upperLimit
  const setUpper = (patch: Partial<NonNullable<Fare['upperLimit']>>) =>
    setFare({
      upperLimit: {
        flatFare: null,
        baseFare: null,
        ratePerKm: null,
        source: '',
        ...upper,
        ...patch,
      },
    })

  const { prefCode, cityCode, name } = project.project.municipality
  const result = suggestFares({
    refs: fareRefs.items,
    prefCode,
    cityCode,
    fareType: f.type,
    userUpperLimit: upper,
  })
  const warnings = upperLimitWarnings(f, upper)

  const apply = (s: FareSuggestion) => {
    if (s.fareType === 'flat') setFare({ flatFare: s.flatFare ?? 0 })
    else setFare({ baseFare: s.baseFare ?? 0, ratePerKm: s.ratePerKm ?? 0 })
  }

  return (
    <div className="card" aria-label="運賃の目安">
      <h3>運賃の目安（標準・高め）</h3>
      <p className="hint">
        乗合バスの運賃には、法律で決まった金額の上限はありません。事業者が国から認可を受けた「上限運賃」の範囲内で届け出る（実施運賃）か、
        地域公共交通会議などで協議が調った額を届け出ます（協議運賃）。そのため、
        <strong>「標準」＝この地域で実際に運行しているバスの運賃（相場）の中央値</strong>、
        <strong>「高め」＝上限運賃（法律の範囲でいちばん高い額）</strong>
        を目安として示します。実際の運賃は、運行事業者・自治体・協議会と調整して決めてください。
      </p>
      <p className="hint">
        対象地域：{name || '（自治体未選択）'}（都道府県コード {prefCode}）／{' '}
        {f.type === 'flat' ? '均一制' : '対キロ区間制'}で提案（制定形態は上の「運賃」で切り替え）
      </p>
      <div className="suggestions">
        <SuggestionColumn title="標準" s={result.standard} tone="standard" onApply={apply} />
        <SuggestionColumn title="高め" s={result.high} tone="high" onApply={apply} />
      </div>
      {result.messages.map((m) => (
        <p key={m} className="text-warning">
          {m}
        </p>
      ))}
      <p className="hint">
        {fareRefs.notice}（参考データの確認日：{fareRefs.checkedAt}）
      </p>
      {fareRefs.notFound.length > 0 && (
        <details>
          <summary>
            公式資料で確認できなかった項目（{fareRefs.notFound.length}件・空欄のままです）
          </summary>
          <ul>
            {fareRefs.notFound.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}

      <h4>上限運賃（運行事業者が認可を受けた額・税込）</h4>
      <p className="hint">
        運行事業者が決まっている場合は、認可を受けた上限運賃を入力してください。「高め」の目安になり、運賃がこれを超えると警告します。
      </p>
      <div className="field-grid">
        <NumField
          label="均一制の上限運賃"
          unit="円"
          step={10}
          value={upper?.flatFare ?? null}
          onChange={(x) => setUpper({ flatFare: x })}
        />
        <NumField
          label="初乗り運賃の上限"
          unit="円"
          step={10}
          value={upper?.baseFare ?? null}
          onChange={(x) => setUpper({ baseFare: x })}
        />
        <NumField
          label="賃率の上限"
          unit="円/km"
          value={upper?.ratePerKm ?? null}
          onChange={(x) => setUpper({ ratePerKm: x })}
        />
        <label className="field field-compact">
          <span>出典（事業者名・認可日など）</span>
          <input
            value={upper?.source ?? ''}
            onChange={(e) => setUpper({ source: e.target.value })}
            placeholder="例：○○バス 令和7年 関東運輸局認可"
          />
        </label>
      </div>
      {upper && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setFare({ upperLimit: null })}
        >
          上限運賃の入力を消す
        </button>
      )}
      {warnings.map((w) => (
        <p key={w} className="text-warning" role="alert">
          ⚠ {w}
        </p>
      ))}
    </div>
  )
}
