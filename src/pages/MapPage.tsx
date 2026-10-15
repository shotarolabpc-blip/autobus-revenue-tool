import type { Map as MlMap } from 'maplibre-gl'
import { useState } from 'react'
import { RoutePanel } from '../components/RoutePanel'
import { loadAttributions, loadBasemaps, loadDefaults, loadPrefectures } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { BasemapSwitcher } from '../map/BasemapSwitcher'
import { MapView } from '../map/MapView'
import { ReferenceLayers } from '../map/ReferenceLayers'
import { ResultLayers } from '../map/ResultLayers'
import { RouteEditor } from '../map/RouteEditor'
import { useActiveScenario, useProjectStore } from '../project/store'
import { useRouteComputation } from '../project/useRouteComputation'

const BASEMAP_KEY = 'basemap'
const NO_VERSIONS: Record<string, string> = {}

function readSavedBasemap(): string | null {
  try {
    return localStorage.getItem(BASEMAP_KEY)
  } catch {
    return null
  }
}

const loadAll = () =>
  Promise.all([loadBasemaps(), loadAttributions(), loadPrefectures(), loadDefaults()])

export function MapPage() {
  const state = useAsync(loadAll)
  const [basemapId, setBasemapId] = useState<string | null>(readSavedBasemap)
  const [map, setMap] = useState<MlMap | null>(null)
  const project = useProjectStore((s) => s.project?.project ?? null)
  const dataVersions = useProjectStore((s) => s.project?.dataVersions ?? NO_VERSIONS)
  const projectFile = useProjectStore((s) => s.project)
  const scenario = useActiveScenario()
  const [showResults, setShowResults] = useState(false)
  useRouteComputation(project?.municipality.prefCode ?? null)

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

  const [basemaps, attributions, prefectures, defaults] = state.data
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
        {projectFile && scenario && (
          <div className="map-panel">
            <label className="inline-radio">
              <input
                type="checkbox"
                checked={showResults}
                onChange={(e) => setShowResults(e.target.checked)}
              />
              推計結果を重ねる
            </label>
            {map && showResults && (
              <ResultLayers
                map={map}
                project={projectFile}
                scenarioId={scenario.id}
                attributions={attributions}
                basemapAttributionIds={basemap.attributionIds}
              />
            )}
          </div>
        )}
      </div>
      {map && scenario && (
        <RouteEditor
          map={map}
          scenario={scenario}
          prefCode={prefCode}
          defaultCatchmentM={defaults.items.catchmentM.value}
        />
      )}
      <div className="map-overlay-top-right">
        {scenario ? (
          <RoutePanel
            scenario={scenario}
            catchmentOptions={
              defaults.items.catchmentM.options ?? [defaults.items.catchmentM.value]
            }
            catchmentSource={defaults.items.catchmentM.source}
            dataVersions={dataVersions}
          />
        ) : (
          <div className="map-panel">
            ルートを作るには、まず「プロジェクト」画面でプロジェクトを作成してください。
          </div>
        )}
      </div>
    </section>
  )
}
