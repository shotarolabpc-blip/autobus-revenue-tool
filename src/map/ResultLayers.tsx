import type { Map as MlMap } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import type { FeatureCollection, Point, Polygon } from 'geojson'
import type { YearDemand } from '../calc/demand'
import { stopAnnualRiders } from '../calc/pipeline'
import type { Attribution } from '../data/schemas'
import { downloadBlob } from '../export/download'
import { circlePolygon } from '../gis/route'
import type { ProjectFile, Scenario } from '../project/schema'
import { useResults } from '../project/useResults'
import { fmt } from '../util/format'

const CATCHMENT = 'result-catchments'
const CATCHMENT_LINE = 'result-catchments-line'
const STOPS = 'result-stops'

/** 勢圏人口のヒートマップの色（淡い → 濃い） */
const HEAT = ['#fff5eb', '#fdd0a2', '#fd8d3c', '#e6550d', '#a63603']

type Props = {
  map: MlMap
  project: ProjectFile
  scenarioId: string
  /** PNG の下端に入れる出典（地図の背景・データ） */
  attributions: Attribution[]
  basemapAttributionIds: string[]
}

function buildLayerData(year: YearDemand, scenario: Scenario) {
  const stops = year.stops.map((s) => {
    const st = scenario.stops.find((x) => x.id === s.stopId)
    return {
      id: s.stopId,
      name: st?.name ?? s.stopId,
      lng: st?.lng ?? 0,
      lat: st?.lat ?? 0,
      radiusM: st?.catchmentM ?? 300,
      pop: s.pop.reduce((a, b) => a + b, 0),
      riders: stopAnnualRiders(year, s.stopId),
    }
  })
  const maxPop = Math.max(1, ...stops.map((s) => s.pop))
  const maxRiders = Math.max(1, ...stops.map((s) => s.riders))
  const polygons: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature',
      properties: { name: s.name, pop: s.pop, riders: s.riders },
      geometry: { type: 'Polygon', coordinates: [circlePolygon([s.lng, s.lat], s.radiusM)] },
    })),
  }
  const points: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature',
      properties: { name: s.name, pop: s.pop, riders: s.riders },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  }
  return { stops, maxPop, maxRiders, polygons, points }
}

/**
 * 推計結果を地図に重ねる（F-8-2）：勢圏人口のヒートマップ（勢圏の円の色）と、バス停別の推計乗車数（円の大きさ）。
 * 地図は PNG に保存できる（F-8-5）。出典・シナリオ名・推計日時を画像の下に入れる（F-8-7）。
 */
export function ResultLayers({
  map,
  project,
  scenarioId,
  attributions,
  basemapAttributionIds,
}: Props) {
  const state = useResults(project)
  const [yearIndex, setYearIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const result =
    state.status === 'ready' ? state.results.find((r) => r.scenarioId === scenarioId) : null
  const year = result?.demand[Math.min(yearIndex, (result?.demand.length ?? 1) - 1)] ?? null
  const scenario = project.scenarios.find((s) => s.id === scenarioId) ?? null

  const data = year && scenario ? buildLayerData(year, scenario) : null

  useEffect(() => {
    if (!data) return
    const stepColor: unknown[] = ['step', ['get', 'pop'], HEAT[0]]
    HEAT.slice(1).forEach((c, i) => stepColor.push((data.maxPop * (i + 1)) / HEAT.length, c))
    map.addSource(CATCHMENT, { type: 'geojson', data: data.polygons })
    map.addLayer(
      {
        id: CATCHMENT,
        type: 'fill',
        source: CATCHMENT,
        paint: { 'fill-color': stepColor as never, 'fill-opacity': 0.45 },
      },
      'slot-analysis',
    )
    map.addLayer(
      {
        id: CATCHMENT_LINE,
        type: 'line',
        source: CATCHMENT,
        paint: { 'line-color': '#7c2d12', 'line-width': 1 },
      },
      'slot-analysis',
    )
    const k = 30 / Math.sqrt(data.maxRiders)
    map.addSource(STOPS, { type: 'geojson', data: data.points })
    map.addLayer(
      {
        id: STOPS,
        type: 'circle',
        source: STOPS,
        paint: {
          'circle-radius': ['+', 5, ['*', ['sqrt', ['get', 'riders']], k]],
          'circle-color': '#1d4ed8',
          'circle-opacity': 0.55,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      },
      'slot-analysis',
    )
    return () => {
      for (const id of [STOPS, CATCHMENT_LINE, CATCHMENT]) if (map.getLayer(id)) map.removeLayer(id)
      for (const id of [STOPS, CATCHMENT]) if (map.getSource(id)) map.removeSource(id)
    }
  }, [map, data])

  const savePng = () => {
    if (!year || !result) return
    setMessage(null)
    map.once('render', () => {
      try {
        const src = map.getCanvas()
        const footer = 74
        const out = document.createElement('canvas')
        out.width = src.width
        out.height = src.height + footer
        const ctx = out.getContext('2d')
        if (!ctx) throw new Error('画像を作れませんでした')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(src, 0, 0)
        const names = attributions
          .filter((a) => [...basemapAttributionIds, 'ksj-population', 'osm'].includes(a.id))
          .map((a) => a.name)
        ctx.fillStyle = '#1f2937'
        ctx.font = '13px sans-serif'
        const lines = [
          `${project.project.name}／${result.scenarioName}／${year.fiscalYear}年度／円の大きさ＝バス停別の年間延べ乗車人員、色＝勢圏人口`,
          `出典：${names.join('、')}、全国都市交通特性調査（令和3年）`,
          `推計日時 ${new Date().toLocaleString('ja-JP')}／ツール版数 v${__APP_VERSION__}`,
        ]
        lines.forEach((t, i) => ctx.fillText(t, 10, src.height + 20 + i * 20, out.width - 20))
        out.toBlob((b) => {
          if (b)
            downloadBlob(
              `${project.project.name}_${result.scenarioName}_${year.fiscalYear}_地図.png`,
              b,
            )
          else setMessage('画像を作れませんでした')
        }, 'image/png')
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e))
      }
    })
    map.triggerRepaint()
  }

  if (state.status === 'loading') return <div className="map-panel">推計結果を計算しています…</div>
  if (state.status === 'error') return <div className="map-panel error">{state.message}</div>
  if (!result || result.blocked || !year || !data) {
    return <div className="map-panel">{result?.blocked ?? '推計結果がありません'}</div>
  }
  return (
    <div className="map-panel" aria-label="推計結果の凡例">
      <label className="field field-compact">
        <span>表示する年度</span>
        <select
          aria-label="地図に表示する年度"
          value={yearIndex}
          onChange={(e) => setYearIndex(Number(e.target.value))}
        >
          {result.demand.map((d, i) => (
            <option key={d.fiscalYear} value={i}>
              {d.fiscalYear}年度
            </option>
          ))}
        </select>
      </label>
      <div className="hint">色：勢圏人口（濃いほど多い）</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} aria-hidden>
        {HEAT.map((c) => (
          <span key={c} style={{ background: c, width: 22, height: 10, display: 'inline-block' }} />
        ))}
        <span className="hint">0 〜 {fmt(data.maxPop)} 人</span>
      </div>
      <div className="hint">
        円の大きさ：バス停別の年間延べ乗車人員（最大 {fmt(data.maxRiders)} 人）
      </div>
      <ul className="hint" style={{ margin: '4px 0', paddingLeft: '1.2em' }}>
        {data.stops.map((s) => (
          <li key={s.id}>
            {s.name}：勢圏人口 {fmt(s.pop)}人／{fmt(s.riders)}人/年
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-small" onClick={savePng}>
        地図をPNGで保存
      </button>
      {message && <p className="error">{message}</p>}
    </div>
  )
}
