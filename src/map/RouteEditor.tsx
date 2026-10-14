import type { Feature } from 'geojson'
import {
  Marker,
  type GeoJSONSource,
  type Map as MlMap,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { useNotice } from '../components/notice'
import { useEditState } from './editState'
import { circlePolygon, nearestSegmentIndex, segmentLine, type LngLat } from '../gis/route'
import { newId } from '../project/factory'
import { addStop, addVia, addVisit, moveVia, removeVia, updateStop } from '../project/routeEdit'
import type { Scenario } from '../project/schema'
import { useProjectStore } from '../project/store'
import { segmentKey, useRouteStatus } from '../project/useRouteComputation'
import { snapToRoad, loadRoutingSettings, placeViaPoint } from '../routing/client'

const SRC_ROUTE = 'edit-route'
const SRC_CATCH = 'edit-catchment'
const SRC_DRAG = 'edit-drag'
const HIT_LAYER = 'edit-route-hit'

type Props = { map: MlMap; scenario: Scenario; prefCode: string; defaultCatchmentM: number }

/** 道路に寄せる。遠くに寄せたら知らせる（F-2-5d） */
async function snapStop(prefCode: string, p: LngLat): Promise<LngLat> {
  const [snap, settings] = await Promise.all([snapToRoad(prefCode, p), loadRoutingSettings()])
  if (!snap) {
    useNotice.getState().show({
      kind: 'info',
      title: '近くに道路がありません',
      messages: [
        `${settings.snapSearchM}m 以内にバスが通れる道路が見つからないため、置いた位置のままにしました。`,
      ],
    })
    return p
  }
  if (snap.distanceM > settings.snapWarnM) {
    useNotice.getState().show({
      kind: 'info',
      title: 'バス停を道路に寄せました',
      messages: [
        `置いた位置から ${Math.round(snap.distanceM)}m 離れた道路上に寄せました（${settings.snapWarnM}m を超えています）。位置を確認してください。`,
      ],
    })
  }
  return snap.point
}

/**
 * 経由点を置く位置を決める。近くの交差点があればそこへ吸着させ、なければ最寄りの道路上へ寄せる。
 * 吸着の結果は、画面の下に短く表示する（交差点／道路上／近くに道路なし）。
 */
async function placeVia(prefCode: string, p: LngLat): Promise<LngLat> {
  const r = await placeViaPoint(prefCode, p)
  useEditState
    .getState()
    .setViaMessage(
      r.kind === 'intersection'
        ? `経由点を交差点に合わせました（${Math.round(r.distanceM)}m 移動）`
        : r.kind === 'road'
          ? `近くに交差点がないため、道路上に置きました（${Math.round(r.distanceM)}m 移動）`
          : '近くに道路がないため、置いた位置のままにしました',
    )
  return r.point
}

/** 地図上のルート・バス停の編集（F-2-3〜F-2-8、F-2-5b） */
export function RouteEditor({ map, scenario, prefCode, defaultCatchmentM }: Props) {
  const scenarioRef = useRef(scenario)
  useEffect(() => {
    scenarioRef.current = scenario
  }, [scenario])
  const mode = useEditState((s) => s.mode)
  const selected = useEditState((s) => s.selectedStopId)
  const statuses = useRouteStatus((s) => s.segments)

  const update = (fn: (s: Scenario) => Scenario) =>
    useProjectStore.getState().updateScenario(scenarioRef.current.id, fn)

  // レイヤーの用意
  useEffect(() => {
    const empty = { type: 'FeatureCollection' as const, features: [] }
    map.addSource(SRC_CATCH, { type: 'geojson', data: empty })
    map.addSource(SRC_ROUTE, { type: 'geojson', data: empty })
    map.addSource(SRC_DRAG, { type: 'geojson', data: empty })
    map.addLayer(
      {
        id: `${SRC_CATCH}-fill`,
        type: 'fill',
        source: SRC_CATCH,
        paint: { 'fill-color': '#1f6feb', 'fill-opacity': 0.08 },
      },
      'slot-edit',
    )
    map.addLayer(
      {
        id: `${SRC_CATCH}-line`,
        type: 'line',
        source: SRC_CATCH,
        paint: {
          'line-color': '#1f6feb',
          'line-width': 1,
          'line-dasharray': [2, 2],
          'line-opacity': 0.6,
        },
      },
      'slot-edit',
    )
    map.addLayer(
      {
        id: `${SRC_ROUTE}-casing`,
        type: 'line',
        source: SRC_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9 },
      },
      'slot-edit',
    )
    map.addLayer(
      {
        id: SRC_ROUTE,
        type: 'line',
        source: SRC_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'state'],
            'computing',
            '#9ca3af',
            'fallback',
            '#d97706',
            '#1f6feb',
          ],
          'line-width': 5,
          'line-dasharray': [
            'case',
            ['==', ['get', 'method'], 'straight'],
            ['literal', [1.5, 1.5]],
            ['==', ['get', 'method'], 'manual'],
            ['literal', [3, 1]],
            ['literal', [1, 0]],
          ],
        },
      },
      'slot-edit',
    )
    // 線をつかみやすくするための、見えない太い線（経由点の追加に使う）
    map.addLayer(
      {
        id: HIT_LAYER,
        type: 'line',
        source: SRC_ROUTE,
        paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
      },
      'slot-edit',
    )
    map.addLayer(
      {
        id: SRC_DRAG,
        type: 'circle',
        source: SRC_DRAG,
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#1f6feb',
          'circle-stroke-width': 3,
        },
      },
      'slot-edit',
    )
    return () => {
      for (const id of [
        `${SRC_CATCH}-fill`,
        `${SRC_CATCH}-line`,
        `${SRC_ROUTE}-casing`,
        SRC_ROUTE,
        HIT_LAYER,
        SRC_DRAG,
      ]) {
        if (map.getLayer(id)) map.removeLayer(id)
      }
      for (const id of [SRC_CATCH, SRC_ROUTE, SRC_DRAG]) if (map.getSource(id)) map.removeSource(id)
    }
  }, [map])

  // ルート線・勢圏の表示
  useEffect(() => {
    const byId = new Map(scenario.stops.map((s) => [s.id, s]))
    const routeFeatures: Feature[] = []
    scenario.route.segments.forEach((seg, i) => {
      const a = byId.get(seg.fromStopId)
      const b = byId.get(seg.toStopId)
      if (!a || !b) return
      const st = statuses[segmentKey(seg.fromStopId, seg.toStopId)]
      const pending = seg.method === 'auto' && seg.coordinates.length === 0
      routeFeatures.push({
        type: 'Feature',
        properties: {
          seg: i,
          method: seg.method,
          state: pending ? 'computing' : (st?.state ?? 'ok'),
        },
        geometry: { type: 'LineString', coordinates: segmentLine(seg, a, b) },
      })
    })
    ;(map.getSource(SRC_ROUTE) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: routeFeatures,
    })
    ;(map.getSource(SRC_CATCH) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: scenario.stops.map((s) => ({
        type: 'Feature',
        properties: { id: s.id },
        geometry: { type: 'Polygon', coordinates: [circlePolygon([s.lng, s.lat], s.catchmentM)] },
      })),
    })
  }, [map, scenario.stops, scenario.route.segments, statuses])

  // バス停のマーカー（番号つき。ドラッグで移動）
  useEffect(() => {
    const markers = scenario.stops.map((s, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `stop-marker${s.id === selected ? ' is-selected' : ''}${s.existingStopId ? ' is-existing' : ''}`
      // 停車順の番号（同じバス停を何度も通る場合は「1・5」のように並べる）
      const visits = scenario.route.sequence.flatMap((id, k) => (id === s.id ? [k + 1] : []))
      const label = visits.length ? visits.join('・') : String(i + 1)
      el.textContent = label
      if (visits.length > 1) el.classList.add('is-multi')
      el.title = `${label}. ${s.name}（ドラッグで移動）`
      el.setAttribute('aria-label', `バス停 ${label} ${s.name}`)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        // 「バス停を追加」中にルート上のバス停をクリックしたら、停車順にもう一度加える
        if (useEditState.getState().mode === 'addStop') {
          update((sc) => addVisit(sc, s.id))
          return
        }
        useEditState.getState().select(s.id)
      })
      const m = new Marker({ element: el, draggable: true }).setLngLat([s.lng, s.lat]).addTo(map)
      m.on('dragend', async () => {
        const p = m.getLngLat()
        const snapped = await snapStop(prefCode, [p.lng, p.lat])
        update((sc) =>
          updateStop(sc, s.id, { lng: snapped[0], lat: snapped[1], existingStopId: null }),
        )
      })
      return m
    })
    return () => markers.forEach((m) => m.remove())
    // update は scenarioRef 経由で最新のシナリオを使う
  }, [map, scenario.stops, scenario.route.sequence, selected, prefCode])

  // 経由点のマーカー（ドラッグで移動、ダブルクリックで削除）
  useEffect(() => {
    const markers: Marker[] = []
    scenario.route.segments.forEach((seg, i) => {
      seg.via.forEach((v, k) => {
        const el = document.createElement('div')
        el.className = 'via-marker'
        el.title = '経由点（ドラッグで移動、ダブルクリックで削除）'
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation()
          update((sc) => removeVia(sc, i, k))
        })
        const m = new Marker({ element: el, draggable: true }).setLngLat(v).addTo(map)
        m.on('dragend', async () => {
          const p = m.getLngLat()
          const snapped = await placeVia(prefCode, [p.lng, p.lat])
          update((sc) => moveVia(sc, i, k, snapped))
        })
        markers.push(m)
      })
    })
    return () => markers.forEach((m) => m.remove())
  }, [map, scenario.route.segments, prefCode])

  // ルート線をドラッグして経由点を追加（F-2-5b）
  useEffect(() => {
    const onDown = (e: MapLayerMouseEvent) => {
      if (useEditState.getState().mode !== 'view') return
      const f = e.features?.[0]
      if (!f) return
      e.preventDefault()
      const segIndex = Number(f.properties?.seg)
      map.dragPan.disable()
      map.getCanvas().style.cursor = 'grabbing'
      let last: LngLat | null = null
      const start = e.point
      const move = (ev: MapMouseEvent) => {
        // 少し動かしただけ（クリック）では経由点を作らない
        if (!last && Math.hypot(ev.point.x - start.x, ev.point.y - start.y) < 6) return
        last = [ev.lngLat.lng, ev.lngLat.lat]
        ;(map.getSource(SRC_DRAG) as GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: last },
        })
      }
      const up = () => {
        map.off('mousemove', move)
        map.dragPan.enable()
        map.getCanvas().style.cursor = ''
        ;(map.getSource(SRC_DRAG) as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [],
        })
        if (last) {
          const p = last
          placeVia(prefCode, p).then((snapped) => update((sc) => addVia(sc, segIndex, snapped)))
        }
      }
      map.on('mousemove', move)
      map.once('mouseup', up)
    }
    const enter = () => {
      if (useEditState.getState().mode === 'view') map.getCanvas().style.cursor = 'grab'
    }
    const leave = () => (map.getCanvas().style.cursor = '')
    map.on('mousedown', HIT_LAYER, onDown)
    map.on('mouseenter', HIT_LAYER, enter)
    map.on('mouseleave', HIT_LAYER, leave)
    return () => {
      map.off('mousedown', HIT_LAYER, onDown)
      map.off('mouseenter', HIT_LAYER, enter)
      map.off('mouseleave', HIT_LAYER, leave)
    }
  }, [map, prefCode])

  // 「経由点を追加」モード：地図をクリックした点に最も近い区間に、経由点を（交差点に寄せて）追加する
  useEffect(() => {
    if (mode !== 'addVia') return
    map.getCanvas().style.cursor = 'crosshair'
    const onClick = async (e: MapMouseEvent) => {
      const sc = scenarioRef.current
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat]
      const near = nearestSegmentIndex(sc.route, sc.stops, p)
      if (!near) {
        useEditState.getState().setViaMessage('先にバス停を2つ以上置いてください')
        return
      }
      const snapped = await placeVia(prefCode, p)
      update((s) => addVia(s, near.index, snapped))
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      map.getCanvas().style.cursor = ''
    }
  }, [map, mode, prefCode])

  // 「バス停を追加」モード：既存バス停をクリックで採用（F-2-3）、地図をクリックで新規（F-2-4）
  useEffect(() => {
    if (mode !== 'addStop') return
    map.getCanvas().style.cursor = 'crosshair'
    const onClick = async (e: MapMouseEvent) => {
      const layers = map
        .getStyle()
        .layers.map((l) => l.id)
        .filter((id) => id.startsWith('ref-busstops-'))
      const hits = layers.length
        ? map.queryRenderedFeatures(
            [
              [e.point.x - 6, e.point.y - 6],
              [e.point.x + 6, e.point.y + 6],
            ],
            { layers },
          )
        : []
      const sc = scenarioRef.current
      const catchmentM = sc.stops.at(-1)?.catchmentM ?? defaultCatchmentM
      if (hits.length > 0 && hits[0].geometry.type === 'Point') {
        const h = hits[0]
        const [lng, lat] = h.geometry.type === 'Point' ? (h.geometry.coordinates as LngLat) : [0, 0]
        const id = String(h.properties?.id ?? '')
        update((s) =>
          addStop(s, {
            id: newId(),
            name: String(h.properties?.name ?? `バス停${s.stops.length + 1}`),
            lng,
            lat,
            existingStopId: id || null,
            catchmentM,
          }),
        )
        return
      }
      const p = await snapStop(prefCode, [e.lngLat.lng, e.lngLat.lat])
      update((s) =>
        addStop(s, {
          id: newId(),
          name: `バス停${s.stops.length + 1}`,
          lng: p[0],
          lat: p[1],
          existingStopId: null,
          catchmentM,
        }),
      )
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      map.getCanvas().style.cursor = ''
    }
  }, [map, mode, prefCode, defaultCatchmentM])

  return null
}
