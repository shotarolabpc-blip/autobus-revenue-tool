import type { Map as MlMap } from 'maplibre-gl'
import { useState } from 'react'
import { loadAttributions, loadBasemaps, loadPrefectures } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { BasemapSwitcher } from '../map/BasemapSwitcher'
import { MapView } from '../map/MapView'
import { ReferenceLayers } from '../map/ReferenceLayers'
import { useProjectStore } from '../project/store'

const BASEMAP_KEY = 'basemap'

function readSavedBasemap(): string | null {
  try {
    return localStorage.getItem(BASEMAP_KEY)
  } catch {
    return null
  }
}

const loadAll = () => Promise.all([loadBasemaps(), loadAttributions(), loadPrefectures()])

export function MapPage() {
  const state = useAsync(loadAll)
  const [basemapId, setBasemapId] = useState<string | null>(readSavedBasemap)
  const [map, setMap] = useState<MlMap | null>(null)
  const project = useProjectStore((s) => s.project?.project ?? null)

  if (state.status !== 'ready') {
    return (
      <section className="map-page" aria-label="地図">
        {state.status === 'loading' ? (
          <p className="page-message">地図を準備しています…</p>
        ) : (
          <p className="page-message error">地図を表示できません：{state.error.message}</p>
        )}
      </section>
    )
  }

  const [basemaps, attributions, prefectures] = state.data
  const basemap =
    basemaps.items.find((b) => b.id === basemapId) ??
    basemaps.items.find((b) => b.id === basemaps.defaultId)!
  // 初期表示：プロジェクトの都道府県（なければ既定の都道府県）
  const prefCode = project?.municipality.prefCode ?? prefectures.defaultCode
  const pref = prefectures.items.find((p) => p.code === prefCode)

  const changeBasemap = (id: string) => {
    setBasemapId(id)
    try {
      localStorage.setItem(BASEMAP_KEY, id)
    } catch {
      // 保存できなくても表示には影響しない
    }
  }

  return (
    <section className="map-page" aria-label="地図">
      <MapView
        basemap={basemap}
        attributions={attributions}
        initialView={pref?.view ?? null}
        onMapReady={setMap}
      />
      <div className="map-overlay-top-left">
        <BasemapSwitcher items={basemaps.items} value={basemap.id} onChange={changeBasemap} />
        {map && (
          <ReferenceLayers
            map={map}
            prefectures={prefectures.items}
            attributions={attributions}
            preferredYear={project?.startFiscalYear}
          />
        )}
      </div>
    </section>
  )
}
