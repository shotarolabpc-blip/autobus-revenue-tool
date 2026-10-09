import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { meshBounds, secondMeshesInBounds, type Bounds } from '../gis/mesh'
import {
  populationIndexSchema,
  populationTileSchema,
  type PopulationIndex,
  type PopulationUnit,
} from './schemas'
import { fetchJson } from './staticData'

const indexCache = new Map<string, Promise<PopulationIndex | null>>()
const tileCache = new Map<string, Promise<PopulationUnit[]>>()

/** 都道府県の人口メッシュの目次。未生成なら null */
export function loadPopulationIndex(prefCode: string): Promise<PopulationIndex | null> {
  if (!indexCache.has(prefCode)) {
    indexCache.set(
      prefCode,
      fetchJson(`population/${prefCode}/index.json`, populationIndexSchema).catch(() => null),
    )
  }
  return indexCache.get(prefCode)!
}

function loadTile(prefCode: string, tile: string): Promise<PopulationUnit[]> {
  const key = `${prefCode}/${tile}`
  if (!tileCache.has(key)) {
    const p = fetchJson(`population/${key}.json`, populationTileSchema).then((t) => t.units)
    p.catch(() => tileCache.delete(key))
    tileCache.set(key, p)
  }
  return tileCache.get(key)!
}

/**
 * 範囲にかかる人口の集計単位を読み込む（範囲にかかる2次メッシュのファイルだけを取得する）。
 * 複数の都道府県・ファイルにまたがる集計単位は id で重複を除く。
 */
export async function loadPopulationUnits(
  prefCodes: string[],
  bounds: Bounds,
): Promise<{ index: PopulationIndex; units: PopulationUnit[] } | null> {
  const wanted = new Set(secondMeshesInBounds(bounds))
  let index: PopulationIndex | null = null
  const byId = new Map<string, PopulationUnit>()
  for (const pref of prefCodes) {
    const idx = await loadPopulationIndex(pref)
    if (!idx) continue
    index ??= idx
    const tiles = idx.tiles.filter((t) => wanted.has(t))
    const lists = await Promise.all(tiles.map((t) => loadTile(pref, t)))
    for (const u of lists.flat()) byId.set(u.id, u)
  }
  return index ? { index, units: [...byId.values()] } : null
}

/** 集計単位の人口（年齢階層の合計）を、構成メッシュに均等に割り振った GeoJSON（表示用） */
export function populationMeshGeoJson(
  units: PopulationUnit[],
  yearIndex: number,
): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = []
  for (const u of units) {
    const pop = u.pop[yearIndex]
    if (!pop) continue
    const total = pop.reduce((a, b) => a + b, 0)
    const perMesh = total / u.meshes.length
    for (const m of u.meshes) {
      const [w, s, e, n] = meshBounds(m)
      features.push({
        type: 'Feature',
        properties: { mesh: m, unit: u.id, population: Math.round(perMesh * 10) / 10 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
