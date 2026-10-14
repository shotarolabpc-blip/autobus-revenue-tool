import { useRef, useState } from 'react'
import { downloadText } from '../export/download'
import { routeKm, segmentKms } from '../gis/route'
import { importStops, routeToGeoJson, stopsToCsv } from '../gis/stopsIO'
import { useEditState } from '../map/editState'
import { newId } from '../project/factory'
import {
  addStop,
  addVisit,
  moveStopOrder,
  removeVia,
  removeVisit,
  setAllCatchments,
  setLoop,
  setRouteLengthOverride,
  setSequence,
  setSegmentLengthOverride,
  setSegmentMethod,
  updateStop,
} from '../project/routeEdit'
import type { Scenario, Segment } from '../project/schema'
import { useProjectStore } from '../project/store'
import { segmentKey, useRouteStatus } from '../project/useRouteComputation'
import { withBom } from '../util/text'
import { useNotice } from './notice'

const METHOD_LABELS: Record<Segment['method'], string> = {
  auto: '自動（道路沿い）',
  straight: '直線',
  manual: '手描き',
}

type Props = {
  scenario: Scenario
  catchmentOptions: number[]
  catchmentSource: string
  dataVersions: Record<string, string>
}

/** 数値の入力（空欄＝null） */
function NumberInput({
  value,
  onChange,
  placeholder,
  label,
  step = 0.01,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  label: string
  step?: number
}) {
  return (
    <input
      type="number"
      className="input-small"
      aria-label={label}
      step={step}
      min={0}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, e.target.valueAsNumber))}
    />
  )
}

/** ルート・バス停の一覧と編集（F-2-3〜F-2-11） */
export function RoutePanel({ scenario, catchmentOptions, catchmentSource, dataVersions }: Props) {
  const mode = useEditState((s) => s.mode)
  const viaMessage = useEditState((s) => s.viaMessage)
  const selected = useEditState((s) => s.selectedStopId)
  const statuses = useRouteStatus((s) => s.segments)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const update = (fn: (s: Scenario) => Scenario) =>
    useProjectStore.getState().updateScenario(scenario.id, fn)

  const stops = scenario.stops
  const segKm = segmentKms(scenario.route, stops)
  const totalKm = routeKm({ ...scenario.route, lengthOverrideKm: null }, stops)
  const catchments = [...new Set(stops.map((s) => s.catchmentM))]
  const sequence = scenario.route.sequence
  const stopById = new Map(stops.map((x) => [x.id, x]))
  const [revisitId, setRevisitId] = useState('')

  const exportFiles = (kind: 'geojson' | 'csv') => {
    const base = `${scenario.name}_ルート`
    if (kind === 'csv') {
      downloadText(`${base}.csv`, withBom(stopsToCsv(stops)), 'text/csv')
    } else {
      const gj = routeToGeoJson(stops, scenario.route, {
        scenario: scenario.name,
        exportedAt: new Date().toISOString(),
        tool: `自動運転バス 収入予測ツール v${__APP_VERSION__}`,
        dataVersions,
      })
      downloadText(`${base}.geojson`, JSON.stringify(gj, null, 2), 'application/geo+json')
    }
  }

  const importFile = async (file: File) => {
    const r = importStops(await file.text(), file.name, catchmentOptions[0] ?? 300)
    if (!r.ok) {
      useNotice.getState().show({
        kind: 'error',
        title: `「${file.name}」を読み込めませんでした`,
        messages: r.errors,
      })
      return
    }
    if (
      stops.length &&
      !confirm(
        `今のバス停（${stops.length}件）を、読み込んだ ${r.stops.length}件に置き換えます。よろしいですか？`,
      )
    ) {
      return
    }
    update((s) => {
      let next: Scenario = {
        ...s,
        stops: [],
        route: { ...s.route, sequence: [], segments: [], lengthOverrideKm: null },
      }
      if (r.loop !== null) next = setLoop(next, r.loop)
      for (const st of r.stops) next = addStop(next, { ...st, id: newId() })
      // 停車順がファイルにあれば、同じバス停を何度も通る並びに置き換える
      if (r.sequence) {
        const ids = next.stops.map((x) => x.id)
        next = setSequence(
          next,
          r.sequence.map((k) => ids[k - 1]),
        )
      }
      return next
    })
  }

  return (
    <div className="map-panel route-panel" aria-label="ルートとバス停">
      <div className="panel-title">ルートとバス停（{scenario.name}）</div>

      <div className="button-row">
        <button
          type="button"
          className={`btn btn-small${mode === 'addStop' ? ' btn-primary' : ''}`}
          aria-pressed={mode === 'addStop'}
          onClick={() => {
            useEditState.getState().setViaMessage(null)
            useEditState.getState().setMode(mode === 'addStop' ? 'view' : 'addStop')
          }}
        >
          {mode === 'addStop' ? '追加を終える' : '＋ バス停を追加'}
        </button>
        <button
          type="button"
          className={`btn btn-small${mode === 'addVia' ? ' btn-primary' : ''}`}
          aria-pressed={mode === 'addVia'}
          disabled={scenario.route.segments.length === 0}
          title={scenario.route.segments.length === 0 ? 'バス停を2つ以上置くと使えます' : undefined}
          onClick={() => {
            useEditState.getState().setViaMessage(null)
            useEditState.getState().setMode(mode === 'addVia' ? 'view' : 'addVia')
          }}
        >
          {mode === 'addVia' ? '経由点の追加を終える' : '＋ 経由点を追加'}
        </button>
      </div>
      <p className="panel-note">
        {mode === 'addStop'
          ? '地図をクリックすると新しいバス停を置きます。既存バス停（参照データ）をクリックすると、そのバス停を採用します。すでにルートにあるバス停（番号の丸）をクリックすると、停車順にもう一度加えます。'
          : mode === 'addVia'
            ? '「この交差点を通ってほしい」場所を地図でクリックしてください。いちばん近い区間に経由点を加え、近くに交差点があればそこに合わせます（バス停にはなりません）。'
            : 'バス停の番号はドラッグで移動できます。ルートの線をドラッグしても経由点を追加できます（経由点はダブルクリックまたは下の一覧の×で削除）。'}
      </p>
      {viaMessage && (
        <p className="panel-note" role="status">
          {viaMessage}
        </p>
      )}

      <div className="field-inline">
        <span>運行形態</span>
        <label>
          <input
            type="radio"
            checked={!scenario.route.loop}
            onChange={() => update((s) => setLoop(s, false))}
          />
          往復
        </label>
        <label>
          <input
            type="radio"
            checked={scenario.route.loop}
            onChange={() => update((s) => setLoop(s, true))}
          />
          循環
        </label>
      </div>
      <div className="field-inline">
        <span>勢圏（半径）</span>
        <select
          aria-label="勢圏の半径"
          value={catchments.length === 1 ? catchments[0] : ''}
          onChange={(e) => update((s) => setAllCatchments(s, Number(e.target.value)))}
        >
          {catchments.length !== 1 && <option value="">（バス停ごとに異なる）</option>}
          {catchmentOptions.map((m) => (
            <option key={m} value={m}>
              {m}m
            </option>
          ))}
        </select>
      </div>
      <p className="panel-note">出典：{catchmentSource}</p>

      {sequence.length === 0 ? (
        <p className="panel-note">
          バス停がまだありません。「＋ バス停を追加」から置いてください。
        </p>
      ) : (
        <ol className="stop-list" aria-label="停車順">
          {sequence.map((stopId, i) => {
            const s = stopById.get(stopId)
            if (!s) return null
            const revisit = sequence.indexOf(stopId) < i
            const segIdx = i < scenario.route.segments.length ? i : undefined
            const seg = segIdx !== undefined ? scenario.route.segments[segIdx] : undefined
            const st = seg ? statuses[segmentKey(seg.fromStopId, seg.toStopId)] : undefined
            return (
              <li key={`${i}-${stopId}`}>
                <div
                  className={`stop-row${s.id === selected ? ' is-selected' : ''}${dragIndex === i ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex !== null) update((sc) => moveStopOrder(sc, dragIndex, i))
                    setDragIndex(null)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  onClick={() => useEditState.getState().select(s.id)}
                  data-own-drop
                >
                  <span className="drag-handle" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <span className="stop-no">{i + 1}</span>
                  <input
                    className="stop-name"
                    aria-label={`停車${i + 1}のバス停の名称`}
                    value={s.name}
                    onChange={(e) => update((sc) => updateStop(sc, s.id, { name: e.target.value }))}
                  />
                  {revisit && (
                    <span
                      className="badge"
                      title="このバス停は、停車順に前にも出てきます（名称・位置は共通）"
                    >
                      再訪
                    </span>
                  )}
                  {s.existingStopId && (
                    <span className="badge" title={`既存バス停 ${s.existingStopId}`}>
                      既存
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`停車${i + 1}を上へ`}
                    disabled={i === 0}
                    onClick={() => update((sc) => moveStopOrder(sc, i, i - 1))}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`停車${i + 1}を下へ`}
                    disabled={i === sequence.length - 1}
                    onClick={() => update((sc) => moveStopOrder(sc, i, i + 1))}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    aria-label={`停車${i + 1}を削除`}
                    onClick={() => {
                      const onlyOnce = sequence.filter((x) => x === stopId).length === 1
                      const msg = onlyOnce
                        ? `バス停「${s.name}」を削除します。よろしいですか？`
                        : `停車順の${i + 1}番目（バス停「${s.name}」）を外します。このバス停は、ほかの回では残ります。よろしいですか？`
                      if (confirm(msg)) update((sc) => removeVisit(sc, i))
                    }}
                  >
                    ×
                  </button>
                </div>
                {seg && segIdx !== undefined && (
                  <div className="segment-row">
                    <span className="segment-arrow" aria-hidden="true">
                      ↓
                    </span>
                    <select
                      aria-label={`区間${segIdx + 1}の引き方`}
                      value={seg.method}
                      onChange={(e) =>
                        update((sc) =>
                          setSegmentMethod(sc, segIdx, e.target.value as Segment['method']),
                        )
                      }
                    >
                      {Object.entries(METHOD_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <span className="segment-km">
                      {seg.method === 'auto' && seg.coordinates.length === 0
                        ? '計算中…'
                        : `${(seg.lengthKm ?? segKm[segIdx]).toFixed(2)} km`}
                    </span>
                    <NumberInput
                      label={`区間${segIdx + 1}の距離（手修正、km）`}
                      value={seg.lengthOverrideKm}
                      placeholder="手修正"
                      onChange={(v) => update((sc) => setSegmentLengthOverride(sc, segIdx, v))}
                    />
                    {st?.state === 'fallback' && (
                      <p className="panel-note text-warning">{st.message}</p>
                    )}
                  </div>
                )}
                {seg && segIdx !== undefined && seg.via.length > 0 && (
                  <ul className="via-list" aria-label={`区間${segIdx + 1}の経由点`}>
                    {seg.via.map((v, k) => (
                      <li key={`${k}-${v[0]}-${v[1]}`}>
                        <span className="via-dot" aria-hidden="true" />
                        経由点{k + 1}
                        <small className="hint">
                          （{v[1].toFixed(5)}, {v[0].toFixed(5)}）
                        </small>
                        <button
                          type="button"
                          className="btn-icon btn-danger"
                          aria-label={`区間${segIdx + 1}の経由点${k + 1}を削除`}
                          onClick={() => update((sc) => removeVia(sc, segIdx, k))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {stops.length >= 1 && (
        <div className="field-inline" data-testid="revisit">
          <span>もう一度通るバス停</span>
          <select
            aria-label="もう一度通るバス停"
            value={revisitId}
            onChange={(e) => setRevisitId(e.target.value)}
          >
            <option value="">（選択してください）</option>
            {stops.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-small"
            disabled={!revisitId}
            onClick={() => {
              update((sc) => addVisit(sc, revisitId))
              setRevisitId('')
            }}
          >
            停車順の最後に加える
          </button>
        </div>
      )}
      {stops.length >= 2 && (
        <div className="route-total">
          <div>
            ルート総延長：
            <strong>
              {(scenario.route.lengthOverrideKm ?? segKm.reduce((a, b) => a + b, 0)).toFixed(2)} km
            </strong>
            {scenario.route.lengthOverrideKm !== null && (
              <small className="hint">（手修正。区間の合計 {totalKm.toFixed(2)} km）</small>
            )}
          </div>
          <label className="field-inline">
            <span>総延長の手修正（km）</span>
            <NumberInput
              label="ルート総延長の手修正（km）"
              value={scenario.route.lengthOverrideKm}
              placeholder="自動"
              onChange={(v) => update((sc) => setRouteLengthOverride(sc, v))}
            />
          </label>
          <p className="panel-note">
            {scenario.route.loop ? '循環：1周の距離' : '往復：片道の距離'}
            。直線の区間は直線距離です。
          </p>
        </div>
      )}

      <div className="button-row">
        <button
          type="button"
          className="btn btn-small"
          disabled={!stops.length}
          onClick={() => exportFiles('geojson')}
        >
          GeoJSON 出力
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!stops.length}
          onClick={() => exportFiles('csv')}
        >
          CSV 出力
        </button>
        <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
          読み込む
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".geojson,.json,.csv"
          data-testid="route-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importFile(f)
          }}
        />
      </div>
    </div>
  )
}
