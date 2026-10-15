import { useRef, useState } from 'react'
import type { ScenarioResult } from '../../calc/pipeline'
import {
  estimateKpi,
  parseReferenceCsv,
  ratio,
  referenceKpi,
  REFERENCE_CSV_HEADER,
  type Kpi,
} from '../../calc/reference'
import { loadReferenceActuals } from '../../data/staticData'
import { useAsync } from '../../data/useAsync'
import { downloadBlob } from '../../export/download'
import { BundledReferences } from './BundledReferences'
import { newId } from '../../project/factory'
import type { ProjectFile, Scenario, UserReference } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fmt } from '../../util/format'
import { withBom } from '../../util/text'
import { NumField, TextField } from '../fields'

type Props = { project: ProjectFile; scenario: Scenario; result: ScenarioResult }

const empty = (): UserReference => ({
  id: '',
  name: '',
  operator: '',
  fiscalYear: null,
  dailyRiders: 0,
  dailyTrips: null,
  dailyFareRevenue: null,
  routeLengthKm: null,
  source: '',
})

/** 参考実績との比較（F-5-6〜F-5-8）：推計の桁感を、既存路線の実績と並べて確かめる */
export function ReferenceCompare({ project, scenario, result }: Props) {
  const refs = project.userReferenceData
  const bundled = useAsync(loadReferenceActuals)
  const [draft, setDraft] = useState<UserReference>(empty)
  const [errors, setErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const setRefs = (fn: (r: UserReference[]) => UserReference[]) =>
    useProjectStore
      .getState()
      .updateProject((p) => ({ ...p, userReferenceData: fn(p.userReferenceData) }))

  const y = result.demand[0]
  const rev = result.revenue[0]
  const est: Kpi | null =
    y && rev
      ? estimateKpi(
          y,
          rev,
          scenario.service.weekdayTrips,
          scenario.service.holidayTrips,
          result.routeKm,
        )
      : null
  const canAdd = draft.name.trim() !== '' && draft.source.trim() !== '' && draft.dailyRiders > 0

  const rows = refs.map((r) => ({ r, k: referenceKpi(r) }))
  const cell = (v: number | null, d = 0) => (v === null ? '−' : fmt(v, d))
  const rt = (a: number | null, b: number | null) => {
    const v = ratio(a, b)
    return v === null ? '−' : `${fmt(v, 2)}倍`
  }

  return (
    <div className="card">
      <h3>参考実績との比較（桁感の確認）</h3>
      <p className="hint">
        事業者から入手した実績や、公開されている路線の実績を入れると、推計と並べて桁を確かめられます。
        推計は、初年度（{y?.fiscalYear}年度）の値です。
        実績はこのプロジェクトのファイルに含めて保存されます（外部へは送りません）。
      </p>

      {bundled.status === 'ready' && <BundledReferences data={bundled.data} existing={refs} />}

      <h4>実績を追加</h4>
      <div className="field-grid">
        <TextField
          label="路線名"
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
        />
        <TextField
          label="事業者"
          value={draft.operator}
          onChange={(v) => setDraft({ ...draft, operator: v })}
        />
        <NumField
          label="年度"
          step={1}
          value={draft.fiscalYear}
          onChange={(v) => setDraft({ ...draft, fiscalYear: v === null ? null : Math.round(v) })}
        />
        <NumField
          label="1日の乗車人員"
          unit="人/日"
          value={draft.dailyRiders || null}
          onChange={(v) => setDraft({ ...draft, dailyRiders: v ?? 0 })}
        />
        <NumField
          label="1日の便数"
          unit="便"
          value={draft.dailyTrips}
          onChange={(v) => setDraft({ ...draft, dailyTrips: v })}
        />
        <NumField
          label="1日の乗車料収入"
          unit="円/日"
          value={draft.dailyFareRevenue}
          onChange={(v) => setDraft({ ...draft, dailyFareRevenue: v })}
        />
        <NumField
          label="路線延長"
          unit="km"
          value={draft.routeLengthKm}
          onChange={(v) => setDraft({ ...draft, routeLengthKm: v })}
        />
        <TextField
          label="出典（資料名・URLなど）"
          value={draft.source}
          required
          onChange={(v) => setDraft({ ...draft, source: v })}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={!canAdd}
          onClick={() => {
            setRefs((r) => [
              ...r,
              { ...draft, id: newId(), name: draft.name.trim(), source: draft.source.trim() },
            ])
            setDraft(empty())
          }}
        >
          追加
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          CSVから読み込む
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            downloadBlob(
              '参考実績_読込用の見出し.csv',
              new Blob([withBom(`${REFERENCE_CSV_HEADER}\r\n`)], {
                type: 'text/csv;charset=utf-8',
              }),
            )
          }
        >
          CSVの見出しをダウンロード
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          aria-label="参考実績のCSVを選ぶ"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const r = parseReferenceCsv(await file.text(), newId)
            setErrors(r.errors)
            if (r.items.length > 0) setRefs((x) => [...x, ...r.items])
          }}
        />
      </div>
      {errors.length > 0 && (
        <ul className="form-errors" role="alert">
          {errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}

      {est && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" aria-label="推計と参考実績の比較">
            <thead>
              <tr>
                <th>路線</th>
                <th className="num">1日の乗車人員</th>
                <th className="num">1便あたり乗車人数</th>
                <th className="num">平均運賃（円）</th>
                <th className="num">路線延長（km）</th>
                <th className="num">推計÷実績（1日の乗車人員）</th>
                <th className="num">推計÷実績（1便あたり）</th>
                <th className="num">推計÷実績（平均運賃）</th>
                <th>出典</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr className="is-active">
                <td>
                  <strong>
                    推計（{result.scenarioName}・{y?.fiscalYear}年度）
                  </strong>
                </td>
                <td className="num">{cell(est.dailyRiders, 1)}</td>
                <td className="num">{cell(est.perTrip, 1)}</td>
                <td className="num">{cell(est.avgFare, 1)}</td>
                <td className="num">{cell(est.routeLengthKm, 2)}</td>
                <td />
                <td />
                <td />
                <td>このツールの推計</td>
                <td />
              </tr>
              {rows.map(({ r, k }) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    {r.operator && (
                      <div className="hint">
                        {r.operator}
                        {r.fiscalYear ? `（${r.fiscalYear}年度）` : ''}
                      </div>
                    )}
                  </td>
                  <td className="num">{cell(k.dailyRiders, 1)}</td>
                  <td className="num">{cell(k.perTrip, 1)}</td>
                  <td className="num">{cell(k.avgFare, 1)}</td>
                  <td className="num">{cell(k.routeLengthKm, 2)}</td>
                  <td className="num">{rt(est.dailyRiders, k.dailyRiders)}</td>
                  <td className="num">{rt(est.perTrip, k.perTrip)}</td>
                  <td className="num">{rt(est.avgFare, k.avgFare)}</td>
                  <td>{r.source}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => setRefs((x) => x.filter((y2) => y2.id !== r.id))}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        都市部の公営バスは、自動運転バスより規模がかなり大きいため、上限の目安として見てください。郊外・地方では、コミュニティバスの実績が主な比較対象です。
      </p>
    </div>
  )
}
