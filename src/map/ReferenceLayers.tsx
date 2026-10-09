import { Popup, type GeoJSONSource, type Map as MlMap, type MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { loadPopulationUnits, populationMeshGeoJson } from '../data/population'
import type { Attribution, Prefecture, PopulationIndex, PopulationUnit } from '../data/schemas'
import { dataUrl } from '../data/staticData'
import type { Bounds } from '../gis/mesh'
import { attributionHtml } from './attribution'
import { useEditState } from './editState'

type Toggles = { population: boolean; busroutes: boolean; busstops: boolean }

const TOGGLES_KEY = 'referenceLayers'
const POPULATION_MIN_ZOOM = 10
const POP_SOURCE = 'ref-population'

/** 人口メッシュの色分け（表示用の区分。人／500mメッシュ） */
const POP_STEPS: [number, string][] = [
  [0, 'rgba(0,0,0,0)'],
  [1, '#fff5eb'],
  [100, '#fdd0a2'],
  [500, '#fdae6b'],
  [1000, '#fd8d3c'],
  [2000, '#e6550d'],
  [4000, '#a63603'],
]

function readToggles(): Toggles {
  try {
    const v = JSON.parse(localStorage.getItem(TOGGLES_KEY) ?? '{}')
    return { population: !!v.population, busroutes: !!v.busroutes, busstops: !!v.busstops }
  } catch {
    return { population: false, busroutes: false, busstops: false }
  }
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}

function mapBounds(map: MlMap): Bounds {
  const b = map.getBounds()
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
}

type Props = {
  map: MlMap
  prefectures: Prefecture[]
  attributions: Attribution[]
  /** 人口の表示年（未指定なら最初の年次） */
  preferredYear?: number
}

/** 参照レイヤ：既存バス停・既存バス路線・人口メッシュ（F-2-2、5.2） */
export function ReferenceLayers({ map, prefectures, attributions, preferredYear }: Props) {
  const [toggles, setToggles] = useState<Toggles>(readToggles)
  const [visiblePrefs, setVisiblePrefs] = useState<string[]>([])
  const [zoom, setZoom] = useState(map.getZoom())
  const [pop, setPop] = useState<{ index: PopulationIndex; units: PopulationUnit[] } | null>(null)
  const [yearIndex, setYearIndex] = useState<number | null>(null)

  const available = useMemo(
    () => prefectures.filter((p) => p.dataAvailable && p.view),
    [prefectures],
  )

  // 表示範囲にかかる都道府県（隣接県も含む）
  useEffect(() => {
    const update = () => {
      const b = mapBounds(map)
      const codes = available.filter((p) => intersects(p.view!, b)).map((p) => p.code)
      setVisiblePrefs((prev) => (prev.join() === codes.join() ? prev : codes))
      setZoom(map.getZoom())
    }
    update()
    map.on('moveend', update)
    return () => {
      map.off('moveend', update)
    }
  }, [map, available])

  const setToggle = (key: keyof Toggles, value: boolean) => {
    const next = { ...toggles, [key]: value }
    setToggles(next)
    try {
      localStorage.setItem(TOGGLES_KEY, JSON.stringify(next))
    } catch {
      // 保存できなくても表示には影響しない
    }
  }

  // 既存バス路線・既存バス停（都道府県ごとの GeoJSON）
  useEffect(() => {
    const added: string[] = []
    for (const pref of visiblePrefs) {
      if (toggles.busroutes) {
        const id = `ref-busroutes-${pref}`
        map.addSource(id, {
          type: 'geojson',
          data: dataUrl(`busroutes/${pref}.geojson`),
          attribution: attributionHtml(attributions, ['ksj-busroutes']),
        })
        map.addLayer(
          {
            id,
            type: 'line',
            source: id,
            minzoom: 9,
            paint: { 'line-color': '#7c3aed', 'line-width': 1.5, 'line-opacity': 0.6 },
          },
          'slot-reference',
        )
        added.push(id)
      }
      if (toggles.busstops) {
        const id = `ref-busstops-${pref}`
        map.addSource(id, {
          type: 'geojson',
          data: dataUrl(`busstops/${pref}.geojson`),
          attribution: attributionHtml(attributions, ['ksj-busstops']),
        })
        map.addLayer(
          {
            id,
            type: 'circle',
            source: id,
            minzoom: 11,
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 5],
              'circle-color': '#ffffff',
              'circle-stroke-color': '#0e7490',
              'circle-stroke-width': 1.5,
            },
          },
          'slot-reference',
        )
        added.push(id)
      }
    }
    const onClick = (e: MapLayerMouseEvent) => {
      // バス停の追加中は、クリックは「採用」に使うので吹き出しを出さない
      if (useEditState.getState().mode === 'addStop') return
      const f = e.features?.[0]
      if (!f || f.geometry.type !== 'Point') return
      const p = f.properties as { name: string; operator: string; routes: string }
      const routes: string[] = JSON.parse(p.routes ?? '[]')
      const el = document.createElement('div')
      el.className = 'map-popup'
      const title = document.createElement('strong')
      title.textContent = p.name
      const op = document.createElement('div')
      op.textContent = `事業者：${p.operator}`
      const rt = document.createElement('div')
      rt.textContent = routes.length
        ? `系統：${routes.slice(0, 8).join('、')}${routes.length > 8 ? ' ほか' : ''}`
        : ''
      el.append(title, op, rt)
      new Popup({ closeButton: true, maxWidth: '280px' })
        .setLngLat(f.geometry.coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map)
    }
    const stopLayers = added.filter((id) => id.startsWith('ref-busstops-'))
    const pointer = () => (map.getCanvas().style.cursor = 'pointer')
    const unpointer = () => (map.getCanvas().style.cursor = '')
    for (const id of stopLayers) {
      map.on('click', id, onClick)
      map.on('mouseenter', id, pointer)
      map.on('mouseleave', id, unpointer)
    }
    return () => {
      for (const id of stopLayers) {
        map.off('click', id, onClick)
        map.off('mouseenter', id, pointer)
        map.off('mouseleave', id, unpointer)
      }
      for (const id of added) {
        if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(id)) map.removeSource(id)
      }
    }
  }, [map, visiblePrefs, toggles.busroutes, toggles.busstops, attributions])

  // 人口メッシュ：表示範囲の2次メッシュ分だけ読み込む
  useEffect(() => {
    if (!toggles.population) return
    let alive = true
    const update = () => {
      if (map.getZoom() < POPULATION_MIN_ZOOM) return
      loadPopulationUnits(visiblePrefs, mapBounds(map)).then((r) => alive && setPop(r))
    }
    update()
    map.on('moveend', update)
    return () => {
      alive = false
      map.off('moveend', update)
    }
  }, [map, toggles.population, visiblePrefs])

  const years = pop?.index.years ?? []
  const effectiveYearIndex =
    yearIndex ??
    Math.max(
      0,
      years.findLastIndex((y) => preferredYear === undefined || y <= preferredYear),
    )

  useEffect(() => {
    if (!pop || !toggles.population) {
      if (map.getLayer(POP_SOURCE)) map.removeLayer(POP_SOURCE)
      if (map.getSource(POP_SOURCE)) map.removeSource(POP_SOURCE)
      return
    }
    const data = populationMeshGeoJson(pop.units, effectiveYearIndex)
    const src = map.getSource(POP_SOURCE) as GeoJSONSource | undefined
    if (src) {
      src.setData(data)
    } else {
      map.addSource(POP_SOURCE, {
        type: 'geojson',
        data,
        attribution: attributionHtml(attributions, ['ksj-population']),
      })
      map.addLayer(
        {
          id: POP_SOURCE,
          type: 'fill',
          source: POP_SOURCE,
          paint: {
            'fill-color': [
              'step',
              ['get', 'population'],
              ...POP_STEPS.flatMap(([v, c], i) => (i === 0 ? [c] : [v, c])),
            ] as never,
            'fill-opacity': 0.55,
            'fill-outline-color': 'rgba(120,53,15,0.25)',
          },
        },
        'slot-population',
      )
    }
  }, [map, pop, effectiveYearIndex, toggles.population, attributions])

  // 片付け
  useEffect(
    () => () => {
      if (map.getLayer(POP_SOURCE)) map.removeLayer(POP_SOURCE)
      if (map.getSource(POP_SOURCE)) map.removeSource(POP_SOURCE)
    },
    [map],
  )

  const noData = visiblePrefs.length === 0

  return (
    <div className="map-panel reference-layers">
      <div className="panel-title">参照データ</div>
      <label>
        <input
          type="checkbox"
          checked={toggles.busstops}
          onChange={(e) => setToggle('busstops', e.target.checked)}
        />
        既存バス停
      </label>
      <label>
        <input
          type="checkbox"
          checked={toggles.busroutes}
          onChange={(e) => setToggle('busroutes', e.target.checked)}
        />
        既存バス路線
      </label>
      <label>
        <input
          type="checkbox"
          checked={toggles.population}
          onChange={(e) => setToggle('population', e.target.checked)}
        />
        人口メッシュ
      </label>
      {toggles.population && years.length > 0 && (
        <label className="indent">
          年次
          <select value={effectiveYearIndex} onChange={(e) => setYearIndex(Number(e.target.value))}>
            {years.map((y, i) => (
              <option key={y} value={i}>
                {y}年
              </option>
            ))}
          </select>
        </label>
      )}
      {toggles.population && zoom < POPULATION_MIN_ZOOM && (
        <p className="panel-note">人口メッシュは地図を拡大すると表示されます。</p>
      )}
      {toggles.population && pop && zoom >= POPULATION_MIN_ZOOM && (
        <div className="legend" aria-label="人口の凡例">
          {POP_STEPS.slice(1).map(([v, c], i) => (
            <span key={v}>
              <i style={{ background: c }} />
              {v.toLocaleString()}
              {i === POP_STEPS.length - 2 ? '人〜' : ''}
            </span>
          ))}
          <small>人／500mメッシュ（{pop.index.version}）</small>
        </div>
      )}
      {(toggles.busstops || toggles.busroutes) && zoom < 11 && (
        <p className="panel-note">既存バス停は地図を拡大すると表示されます。</p>
      )}
      {toggles.busstops && (
        <p className="panel-note">
          ※既存バス停（国土数値情報
          2022年度版）は、同じ道路上の同じ事業者・同じ名称のバス停（上下線など）を1点にまとめているため、正確な位置ではありません。
        </p>
      )}
      {noData && (toggles.busstops || toggles.busroutes || toggles.population) && (
        <p className="panel-note">この範囲のデータはまだ整備されていません。</p>
      )}
    </div>
  )
}
