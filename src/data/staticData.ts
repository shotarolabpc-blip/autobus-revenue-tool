import type { z } from 'zod'
import type { ExistingStop } from '../gis/overlap'
import {
  attributionsFileSchema,
  cityTypesFileSchema,
  type CityTypesFile,
  coefficientsFileSchema,
  referenceActualsFileSchema,
  type ReferenceActualsFile,
  type CoefficientsFile,
  basemapsFileSchema,
  defaultsFileSchema,
  fareReferencesFileSchema,
  type FareReferencesFile,
  holidaysFileSchema,
  vehiclePresetsFileSchema,
  type HolidaysFile,
  type VehiclePresetsFile,
  municipalitiesFileSchema,
  prefecturesFileSchema,
  type Attribution,
  type BasemapsFile,
  type DefaultsFile,
  type Municipality,
  type PrefecturesFile,
} from './schemas'

/** このサイト自身が配信する静的データ（public/data/）のURLを作る */
export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`
}

/** サイト内の JSON を取得し、形式を検証する。外部のURLには使わない。 */
export async function fetchJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(dataUrl(path))
  if (!res.ok) throw new Error(`データを読み込めませんでした（${path}：${res.status}）`)
  return schema.parse(await res.json())
}

const cache = new Map<string, Promise<unknown>>()

function cached<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  if (!cache.has(path)) {
    const p = fetchJson(path, schema)
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}

export const loadAttributions = (): Promise<Attribution[]> =>
  cached('attributions.json', attributionsFileSchema).then((f) => f.items)

export const loadBasemaps = (): Promise<BasemapsFile> => cached('basemaps.json', basemapsFileSchema)

export const loadPrefectures = (): Promise<PrefecturesFile> =>
  cached('prefectures.json', prefecturesFileSchema)

export const loadDefaults = (): Promise<DefaultsFile> => cached('defaults.json', defaultsFileSchema)

/** 市区町村の一覧。未生成の都道府県は空の一覧を返す */
export const loadMunicipalities = (prefCode: string): Promise<Municipality[]> =>
  cached(`municipalities/${prefCode}.json`, municipalitiesFileSchema)
    .then((f) => f.items)
    .catch(() => [])

export const loadHolidays = (): Promise<HolidaysFile> => cached('holidays.json', holidaysFileSchema)

export const loadVehiclePresets = (): Promise<VehiclePresetsFile> =>
  cached('vehicle_presets.json', vehiclePresetsFileSchema)

export const loadFareReferences = (): Promise<FareReferencesFile> =>
  cached('fare_references.json', fareReferencesFileSchema)

export const loadCoefficients = (): Promise<CoefficientsFile> =>
  cached('coefficients.json', coefficientsFileSchema)

export const loadCityTypes = (): Promise<CityTypesFile> =>
  cached('city_types.json', cityTypesFileSchema)

/** 既存のバス停（国土数値情報）。読み込めない都道府県は null（重なりの判定をしない） */
export async function loadBusStops(prefCode: string): Promise<ExistingStop[] | null> {
  try {
    const res = await fetch(dataUrl(`busstops/${prefCode}.geojson`))
    if (!res.ok) return null
    const json = (await res.json()) as {
      features?: {
        geometry?: { type?: string; coordinates?: unknown }
        properties?: { id?: string; name?: string; operator?: string | null }
      }[]
    }
    const out: ExistingStop[] = []
    for (const f of json.features ?? []) {
      if (f.geometry?.type !== 'Point') continue
      const [lng, lat] = f.geometry.coordinates as [number, number]
      out.push({
        id: f.properties?.id ?? `${lng},${lat}`,
        name: f.properties?.name ?? '',
        operator: f.properties?.operator ?? null,
        lng,
        lat,
      })
    }
    return out
  } catch {
    return null
  }
}

export const loadReferenceActuals = (): Promise<ReferenceActualsFile> =>
  cached('reference_actuals.json', referenceActualsFileSchema)
