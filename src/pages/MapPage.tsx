import { useState } from 'react'
import { loadAttributions, loadBasemaps, loadPrefectures } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { BasemapSwitcher } from '../map/BasemapSwitcher'
import { MapView } from '../map/MapView'

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

  if (state.status === 'loading') {
    return (
      <section className="map-page" aria-label="地図">
        <p className="page-message">地図を準備しています…</p>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="map-page" aria-label="地図">
        <p className="page-message error">地図を表示できません：{state.error.message}</p>
      </section>
    )
  }

  const [basemaps, attributions, prefectures] = state.data
  const basemap =
    basemaps.items.find((b) => b.id === basemapId) ??
    basemaps.items.find((b) => b.id === basemaps.defaultId)!
  const pref = prefectures.items.find((p) => p.code === prefectures.defaultCode)

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
      <MapView basemap={basemap} attributions={attributions} initialView={pref?.view ?? null} />
      <div className="map-overlay-top-left">
        <BasemapSwitcher items={basemaps.items} value={basemap.id} onChange={changeBasemap} />
      </div>
    </section>
  )
}
