import type { Feature } from 'geojson'
import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { loadAttributions, loadBasemaps, loadPrefectures } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { MapView } from '../map/MapView'
import { useProjectStore } from '../project/store'
import { computeRoute, loadRoutingSettings, type RouteOutcome } from '../routing/client'
import { haversineM, type LngLat } from '../routing/router'

const loadAll = () =>
  Promise.all([loadBasemaps(), loadAttributions(), loadPrefectures(), loadRoutingSettings()])

const SRC = 'route-test'

type State =
  | { step: 'empty' }
  | { step: 'one'; a: LngLat }
  | { step: 'computing'; a: LngLat; b: LngLat }
  | { step: 'done'; a: LngLat; b: LngLat; outcome: RouteOutcome; straight: boolean }
  | { step: 'error'; a: LngLat; b: LngLat; message: string }

/** 経路計算の確認用画面（P0-6）：地図上で2点をクリックすると、道路に沿った経路と距離を表示する */
export function RouteTestPage() {
  const data = useAsync(loadAll)
  const [map, setMap] = useState<MlMap | null>(null)
  const [state, setState] = useState<State>({ step: 'empty' })
  const stateRef = useRef(state)
  const project = useProjectStore((s) => s.project?.project ?? null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const prefCode =
    data.status === 'ready' ? (project?.municipality.prefCode ?? data.data[2].defaultCode) : null

  // クリックで点を置く
  useEffect(() => {
    if (!map || !prefCode) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: `${SRC}-line`,
        type: 'line',
        source: SRC,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': ['case', ['get', 'straight'], '#9ca3af', '#1f6feb'],
          'line-width': 5,
          'line-dasharray': ['case', ['get', 'straight'], ['literal', [2, 2]], ['literal', [1, 0]]],
        },
      },
      'slot-edit',
    )
    map.addLayer(
      {
        id: `${SRC}-point`,
        type: 'circle',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'kind'], 'snap', '#ffffff', '#dc2626'],
          'circle-stroke-color': '#7f1d1d',
          'circle-stroke-width': 2,
        },
      },
      'slot-edit',
    )
    const onClick = async (e: MapMouseEvent) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat]
      const s = stateRef.current
      if (s.step === 'computing') return
      if (s.step === 'one') {
        setState({ step: 'computing', a: s.a, b: p })
        try {
          const outcome = await computeRoute(prefCode, s.a, p)
          setState({ step: 'done', a: s.a, b: p, outcome, straight: false })
        } catch (err) {
          setState({ step: 'error', a: s.a, b: p, message: String(err) })
        }
      } else {
        setState({ step: 'one', a: p })
      }
    }
    map.on('click', onClick)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', onClick)
      map.getCanvas().style.cursor = ''
      for (const id of [`${SRC}-line`, `${SRC}-point`]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SRC)) map.removeSource(SRC)
    }
  }, [map, prefCode])

  // 表示の更新
  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    const features: Feature[] = []
    const point = (c: LngLat, kind: string) =>
      features.push({
        type: 'Feature',
        properties: { kind },
        geometry: { type: 'Point', coordinates: c },
      })
    if (state.step !== 'empty') point(state.a, 'stop')
    if ('b' in state) point(state.b, 'stop')
    if (state.step === 'done') {
      const r = state.outcome.result
      if (state.straight || !r.found) {
        features.unshift({
          type: 'Feature',
          properties: { straight: true },
          geometry: { type: 'LineString', coordinates: [state.a, state.b] },
        })
      } else {
        features.unshift({
          type: 'Feature',
          properties: { straight: false },
          geometry: { type: 'LineString', coordinates: r.coordinates },
        })
        point(r.from.point, 'snap')
        point(r.to.point, 'snap')
      }
    }
    src.setData({ type: 'FeatureCollection', features })
  }, [map, state])

  if (data.status !== 'ready') {
    return (
      <section className="map-page" aria-label="経路計算の確認">
        <p className="page-message">
          {data.status === 'loading' ? '準備しています…' : data.error.message}
        </p>
      </section>
    )
  }
  const [basemaps, attributions, prefectures, settings] = data.data
  const basemap = basemaps.items.find((b) => b.id === basemaps.defaultId)!
  const pref = prefectures.items.find((p) => p.code === prefCode)

  return (
    <section className="map-page" aria-label="経路計算の確認">
      <MapView
        basemap={basemap}
        attributions={attributions}
        initialView={pref?.view ?? null}
        onMapReady={setMap}
      />
      <div className="map-overlay-top-left">
        <div className="map-panel route-test-panel" aria-live="polite">
          <div className="panel-title">経路計算の確認（{pref?.name}）</div>
          {state.step === 'empty' && <p>地図上で出発点をクリックしてください。</p>}
          {state.step === 'one' && <p>到着点をクリックしてください。</p>}
          {state.step === 'computing' && <p>経路を計算しています…</p>}
          {state.step === 'error' && <p className="error">エラー：{state.message}</p>}
          {state.step === 'done' && (
            <RouteSummary
              state={state}
              warnM={settings.snapWarnM}
              onStraight={() => setState({ ...state, straight: true })}
            />
          )}
          {state.step !== 'empty' && state.step !== 'computing' && (
            <p className="panel-note">もう一度クリックすると、新しい出発点になります。</p>
          )}
        </div>
      </div>
    </section>
  )
}

function RouteSummary({
  state,
  warnM,
  onStraight,
}: {
  state: Extract<State, { step: 'done' }>
  warnM: number
  onStraight: () => void
}) {
  const r = state.outcome.result
  const straightKm = haversineM(state.a, state.b) / 1000
  if (state.straight || !r.found) {
    return (
      <>
        {!r.found && <p className="error">{r.message}</p>}
        {state.straight ? (
          <p>
            直線でつないでいます：<strong>{straightKm.toFixed(2)} km</strong>
            （直線距離。実際の道のりはこれより長くなります）
          </p>
        ) : (
          <button type="button" className="btn" onClick={onStraight}>
            直線でつなぐ
          </button>
        )}
      </>
    )
  }
  const warn = [r.from, r.to].some((s) => s.distanceM > warnM)
  return (
    <>
      <p>
        道路に沿った距離：<strong>{(r.lengthM / 1000).toFixed(2)} km</strong>
        <br />
        <small className="hint">
          直線距離 {straightKm.toFixed(2)} km ／ 計算時間 {Math.round(state.outcome.elapsedMs)} ms
          ／ 読込タイル {state.outcome.loadedTiles} ／ 探索ノード {r.visited.toLocaleString()}
        </small>
      </p>
      <p className={warn ? 'text-warning' : 'hint'}>
        道路に寄せた距離：出発 {Math.round(r.from.distanceM)} m、到着 {Math.round(r.to.distanceM)} m
        {warn && `（${warnM}m を超えています。点の位置を確認してください）`}
      </p>
      <button type="button" className="btn btn-small" onClick={onStraight}>
        直線でつなぐ
      </button>
    </>
  )
}
