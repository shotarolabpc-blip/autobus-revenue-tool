import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useProjectStore } from '../project/store'
import { useEditState } from './editState'
import { usePickLocation } from './pickLocation'

/**
 * 開発計画の場所の選択（F-5-1）。「前提条件」画面の「地図で位置を選ぶ」から来たとき、
 * 地図をクリックした地点をその開発計画の場所にして、「前提条件」画面に戻る。
 */
export function LocationPicker({ map }: { map: MlMap }) {
  const target = usePickLocation((s) => s.target)
  const navigate = useNavigate()

  useEffect(() => {
    if (!target) return
    // 選んでいるあいだは、バス停の追加などの編集をやめる（クリックを取り合わないように）
    useEditState.getState().setMode('view')
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const onClick = (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      const round = (v: number) => Math.round(v * 1e6) / 1e6
      useProjectStore.getState().updateScenario(target.scenarioId, (s) => ({
        ...s,
        developments: s.developments.map((d) =>
          d.id === target.developmentId
            ? { ...d, location: { type: 'point', lng: round(lng), lat: round(lat) } }
            : d,
        ),
      }))
      usePickLocation.getState().clear()
      navigate('/assumptions')
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      canvas.style.cursor = ''
    }
  }, [map, target, navigate])

  if (!target) return null
  return (
    <div className="map-panel" role="status">
      <strong>開発計画「{target.name}」の場所を、地図をクリックして選んでください。</strong>
      <div>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            usePickLocation.getState().clear()
            navigate('/assumptions')
          }}
        >
          やめる
        </button>
      </div>
    </div>
  )
}
