import { useRef, useState } from 'react'
import { downloadText } from '../export/download'
import { routeKm, segmentKms } from '../gis/route'
import { importStops, routeToGeoJson, stopsToCsv } from '../gis/stopsIO'
import { useEditState } from '../map/editState'
import { newId } from '../project/factory'
import {
  addStop,
  moveStopOrder,
  removeStop,
  setAllCatchments,
  setLoop,
  setRouteLengthOverride,
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
  const segIndexFrom = new Map(scenario.route.segments.map((seg, i) => [seg.fromStopId, i]))

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
        route: { ...s.route, segments: [], lengthOverrideKm: null },
      }
      if (r.loop !== null) next = setLoop(next, r.loop)
      for (const st of r.stops) next = addStop(next, { ...st, id: newId() })
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
          onClick={() => useEditState.getState().setMode(mode === 'addStop' ? 'view' : 'addStop')}
        >
          {mode === 'addStop' ? '追加を終える' : '＋ バス停を追加'}
        </button>
      </div>
      <p className="panel-note">
        {mode === 'addStop'
          ? '地図をクリックすると新しいバス停を置きます。既存バス停（参照データ）をクリックすると、そのバス停を採用します。'
          : 'バス停の番号はドラッグで移動できます。ルートの線をドラッグすると経由点を追加できます（経由点はダブルクリックで削除）。'}
      </p>

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

      {stops.length === 0 ? (
        <p className="panel-note">
          バス停がまだありません。「＋ バス停を追加」から置いてください。
        </p>
      ) : (
        <ol className="stop-list">
          {stops.map((s, i) => {
            const segIdx = segIndexFrom.get(s.id)
            const seg = segIdx !== undefined ? scenario.route.segments[segIdx] : undefined
            const st = seg ? statuses[segmentKey(seg.fromStopId, seg.toStopId)] : undefined
            return (
              <li key={s.id}>
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
                    aria-label={`バス停${i + 1}の名称`}
                    value={s.name}
                    onChange={(e) => update((sc) => updateStop(sc, s.id, { name: e.target.value }))}
                  />
                  {s.existingStopId && (
                    <span className="badge" title={`既存バス停 ${s.existingStopId}`}>
                      既存
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`バス停${i + 1}を上へ`}
                    disabled={i === 0}
                    onClick={() => update((sc) => moveStopOrder(sc, i, i - 1))}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`バス停${i + 1}を下へ`}
                    disabled={i === stops.length - 1}
                    onClick={() => update((sc) => moveStopOrder(sc, i, i + 1))}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    aria-label={`バス停${i + 1}を削除`}
                    onClick={() => {
                      if (confirm(`バス停「${s.name}」を削除します。よろしいですか？`)) {
                        update((sc) => removeStop(sc, s.id))
                      }
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
              </li>
            )
          })}
        </ol>
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
