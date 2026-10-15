import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  COUNCIL_FARE_NOTE,
  highTitle,
  isStale,
  staleReferences,
  upperLimitWarnings,
  type FareReference,
  type FareSuggestion,
  type SuggestionResult,
} from '../../calc/fareSuggestion'
import type { FareReferencesFile } from '../../data/schemas'
import type { Fare, ProjectFile, Scenario } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { NumField } from '../fields'

type Props = {
  project: ProjectFile
  scenario: Scenario
  fareRefs: FareReferencesFile
  /** 運賃の目安（運賃欄・結果・出力物と同じ計算結果） */
  result: SuggestionResult
  /** 今日の日付（YYYY-MM-DD。参考データの古さの判定に使う） */
  todayIso: string
}

function describe(s: FareSuggestion): string {
  return s.fareType === 'flat'
    ? `${s.flatFare} 円（均一）`
    : `初乗り ${s.baseFare} 円 ＋ ${s.ratePerKm} 円/km`
}

/** もとにした参考データの一覧（出典リンク・確認日。古い可能性があるものには印を付ける） */
function ReferenceList({ refs, todayIso }: { refs: FareReference[]; todayIso: string }) {
  return (
    <details className="suggestion-refs">
      <summary>もとにした参考データ（{refs.length}件）</summary>
      <ul>
        {refs.map((r) => (
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
            {isStale(r.source.checkedAt, todayIso) && (
              <span className="badge badge-warning" title="確認日から1年以上たっています">
                古い可能性があります
              </span>
            )}
            {r.note && <small className="hint"> {r.note}</small>}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** 「標準」の1種別分（金額・件数・幅・根拠・「〜にする」ボタン） */
function StandardColumn({
  title,
  suggestion,
  count,
  emphasized,
  todayIso,
  onApply,
}: {
  title: string
  suggestion: FareSuggestion
  count: number
  emphasized: boolean
  todayIso: string
  onApply: (s: FareSuggestion) => void
}) {
  return (
    <div className={`suggestion suggestion-standard${emphasized ? ' is-emphasized' : ''}`}>
      <div className="suggestion-title">
        標準：{title}
        {emphasized && <span className="badge badge-strong">強調</span>}
      </div>
      <div className="suggestion-value">{describe(suggestion)}</div>
      <div className="hint">{count}件の中央値</div>
      {suggestion.range && suggestion.range.min !== suggestion.range.max && (
        <div className="hint">
          参考にした運賃の幅：{suggestion.range.min}〜{suggestion.range.max}円
        </div>
      )}
      <button type="button" className="btn btn-small" onClick={() => onApply(suggestion)}>
        「{title}」の標準にする
      </button>
      <ReferenceList refs={suggestion.references} todayIso={todayIso} />
    </div>
  )
}

/** 運賃の目安：種別ごとの「標準」（相場）と「高め」（上限運賃）の提案、上限運賃の入力と超過の警告（F-4A、F-4-8） */
export function FareSuggestionCard({ project, scenario, fareRefs, result, todayIso }: Props) {
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

  const { name, prefCode } = project.project.municipality
  const council = f.system === '協議運賃'
  // 上限運賃を超えた警告（実施運賃のみ）。弾力性0の警告は、運賃欄と結果の画面に出す
  const warnings = upperLimitWarnings(f, f.upperLimit, f.system)
  const used = [
    ...result.standards.flatMap((x) => x.suggestion.references),
    ...(result.high?.references ?? []),
  ]
  const stale = staleReferences(used, todayIso)

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
        <strong>
          「標準」＝この地域で実際に運行しているバスの運賃（相場）の中央値（種別ごと）
        </strong>
        、<strong>「高め」＝上限運賃（法律の範囲でいちばん高い額）</strong>
        を目安として示します。目安は提案で、ボタンを押したときだけ運賃欄に入ります。実際の運賃は、運行事業者・自治体・協議会と調整して決めてください。
      </p>
      <p className="hint">
        対象地域：{name || '（自治体未選択）'}（都道府県コード {prefCode}）／ 運賃制度：{f.system}{' '}
        ／ {f.type === 'flat' ? '均一制' : '対キロ区間制'}
        で提案（制定形態・運賃制度は上の「運賃」で切り替え）
      </p>

      <h4>標準（相場）：種別ごと</h4>
      <div className="suggestions">
        {CATEGORY_ORDER.map((category) => {
          const x = result.standards.find((s) => s.category === category)
          return x ? (
            <StandardColumn
              key={category}
              title={CATEGORY_LABELS[category]}
              suggestion={x.suggestion}
              count={x.count}
              emphasized={result.emphasized === category}
              todayIso={todayIso}
              onApply={apply}
            />
          ) : (
            <div key={category} className="suggestion suggestion-missing">
              <div className="suggestion-title">標準：{CATEGORY_LABELS[category]}</div>
              <div className="hint">
                この地域の{CATEGORY_LABELS[category]}の参考データはありません
              </div>
            </div>
          )
        })}
      </div>
      {result.emphasisReason && <p className="text-warning">{result.emphasisReason}</p>}

      <h4>{highTitle(f.system)}</h4>
      {council && <p className="hint">{COUNCIL_FARE_NOTE}</p>}
      <div className="suggestions">
        <div className={`suggestion suggestion-high${council ? ' is-reference' : ''}`}>
          <div className="suggestion-title">{highTitle(f.system)}</div>
          {result.high ? (
            <>
              <div className="suggestion-value">{describe(result.high)}</div>
              <div className="hint">{result.high.basis}</div>
              <button type="button" className="btn btn-small" onClick={() => apply(result.high!)}>
                {council ? 'この運賃を運賃欄に反映する（参考）' : '高めにする'}
              </button>
              {result.high.references.length > 0 && (
                <ReferenceList refs={result.high.references} todayIso={todayIso} />
              )}
            </>
          ) : (
            <div className="hint">提案できません（下の理由を確認してください）</div>
          )}
        </div>
      </div>

      {result.messages.map((m) => (
        <p key={m} className="text-warning">
          {m}
        </p>
      ))}
      {stale.length > 0 && (
        <p className="text-warning" role="status">
          目安のもとにした参考データのうち{stale.length}
          件は、確認日から1年以上たっています。古い可能性があります（年1回見直します）。
        </p>
      )}
      <p className="hint">
        {fareRefs.notice}（参考データの確認日：{fareRefs.checkedAt}）
      </p>
      {fareRefs.notFound.length > 0 && (
        <details>
          <summary>
            公式資料で確認できなかった・載せていない項目（{fareRefs.notFound.length}件）
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
        運行事業者が決まっている場合は、認可を受けた上限運賃を入力してください。
        {council
          ? '「参考」の目安に使います。協議運賃のため、運賃がこれを超えても警告は出しません。'
          : '「高め」の目安になり、運賃がこれを超えると警告します。'}
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
