import {
  AttributionControl,
  Map as MlMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef } from 'react'
import type { Attribution, Basemap, BBox } from '../data/schemas'
import { attributionHtml } from './attribution'

// ビルド後も MapLibre の Web Worker を正しい場所から読み込めるよう、URLを明示する
setWorkerUrl(maplibreWorkerUrl)

/** 都道府県の初期表示範囲が未生成のときに使う、日本全体の範囲 */
const JAPAN_BBOX: BBox = [122.9, 24.0, 146.0, 45.6]
const BASEMAP_SOURCE = 'basemap'

type Props = {
  basemap: Basemap
  attributions: Attribution[]
  initialView: BBox | null
  onMapReady?: (map: MlMap) => void
}

function setBasemap(map: MlMap, basemap: Basemap, attributions: Attribution[]) {
  if (map.getLayer(BASEMAP_SOURCE)) map.removeLayer(BASEMAP_SOURCE)
  if (map.getSource(BASEMAP_SOURCE)) map.removeSource(BASEMAP_SOURCE)
  map.addSource(BASEMAP_SOURCE, {
    type: 'raster',
    tiles: basemap.tiles,
    tileSize: basemap.tileSize,
    minzoom: basemap.minzoom,
    maxzoom: basemap.maxzoom,
    attribution: attributionHtml(attributions, basemap.attributionIds),
  })
  // 背景地図は常に一番下に置く（後から追加するバス停・路線などの下）
  const firstLayer = map.getStyle().layers[0]?.id
  map.addLayer({ id: BASEMAP_SOURCE, type: 'raster', source: BASEMAP_SOURCE }, firstLayer)
}

export function MapView({ basemap, attributions, initialView, onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const basemapRef = useRef(basemap)
  useEffect(() => {
    basemapRef.current = basemap
  }, [basemap])

  useEffect(() => {
    const map = new MlMap({
      container: containerRef.current!,
      style: { version: 8, sources: {}, layers: [] },
      bounds: initialView ?? JAPAN_BBOX,
      fitBoundsOptions: { padding: 20 },
      minZoom: 5,
      maxZoom: 19,
      attributionControl: false,
    })
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right')
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('load', () => {
      setBasemap(map, basemapRef.current, attributions)
      onMapReady?.(map)
    })
    mapRef.current = map
    // 開発時・自動テスト時に地図の状態を確認できるようにする（本番ビルドには含まれない）
    if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // 地図は最初の1回だけ作る。背景地図の切替は下の effect で行う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map?.isStyleLoaded()) setBasemap(map, basemap, attributions)
  }, [basemap, attributions])

  return <div ref={containerRef} className="map-view" data-testid="map" />
}
