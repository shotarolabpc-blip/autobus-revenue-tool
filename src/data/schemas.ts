import { z } from 'zod'
import { AGE_CLASSES_7, type AgeClass7 } from '../calc/ageClasses'

/** 出典の1件。画面と出力物（CSV・Excel・PNG）の両方で使う。 */
export const attributionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  url: z.url(),
  license: z.string(),
  licenseUrl: z.url().nullable(),
  /** データの版（例：P11-2022）。地図タイルなど版を持たないものは null */
  dataVersion: z.string().nullable(),
  /** 元データを加工して使っているか（CC BY の「変更した旨」の表示に使う） */
  modified: z.boolean().optional(),
  note: z.string().optional(),
})
export type Attribution = z.infer<typeof attributionSchema>

export const attributionsFileSchema = z.object({
  items: z.array(attributionSchema),
})

export const basemapSchema = z.object({
  id: z.string(),
  label: z.string(),
  tiles: z.array(z.string()).min(1),
  tileSize: z.number().int().positive(),
  /** 地理院タイルの標準・淡色地図はズーム5以上で提供 */
  minzoom: z.number().int(),
  maxzoom: z.number().int(),
  attributionIds: z.array(z.string()),
})
export type Basemap = z.infer<typeof basemapSchema>

export const basemapsFileSchema = z.object({
  defaultId: z.string(),
  items: z.array(basemapSchema).min(1),
})
export type BasemapsFile = z.infer<typeof basemapsFileSchema>

/** [西, 南, 東, 北]（経度・緯度） */
export const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type BBox = z.infer<typeof bboxSchema>

export const prefectureSchema = z.object({
  /** JIS X 0401 の2桁コード */
  code: z.string().regex(/^\d{2}$/),
  name: z.string(),
  /** 初期表示範囲（本土・本島の範囲）。data_build が生成する。未生成なら null */
  view: bboxSchema.nullable(),
  /** 配信データ（人口・バス停など）を生成済みか */
  dataAvailable: z.boolean(),
})
export type Prefecture = z.infer<typeof prefectureSchema>

export const prefecturesFileSchema = z.object({
  defaultCode: z.string().regex(/^\d{2}$/),
  items: z.array(prefectureSchema).length(47),
})
export type PrefecturesFile = z.infer<typeof prefecturesFileSchema>

/** 画面の初期値（出典・年付き） */
export const defaultItemSchema = z.object({
  value: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.number()).optional(),
  unit: z.string(),
  source: z.string().min(1),
  year: z.number().int().nullable(),
})
export type DefaultItem = z.infer<typeof defaultItemSchema>

export const defaultsFileSchema = z.object({
  items: z.object({
    projectYears: defaultItemSchema,
    catchmentM: defaultItemSchema,
    maxLoadFactor: defaultItemSchema,
    consumptionTaxRate: defaultItemSchema,
    rampUpFactor: defaultItemSchema,
    fareElasticity: defaultItemSchema,
  }),
})
export type DefaultsFile = z.infer<typeof defaultsFileSchema>

/** 市区町村の一覧（data_build が都道府県ごとに生成） */
export const municipalitiesFileSchema = z.object({
  prefCode: z.string().regex(/^\d{2}$/),
  items: z.array(z.object({ code: z.string().regex(/^\d{5}$/), name: z.string() })),
})
export type Municipality = z.infer<typeof municipalitiesFileSchema>['items'][number]

/**
 * 人口の年齢区分（全国都市交通特性調査の年齢区分に合わせた7区分。Q3：B、2026-10-15 決定）。
 * 0〜4歳は調査の対象外だが、人口データには別に持つ（係数の扱いはQ2で決める）。
 */
export const POPULATION_AGE_CLASSES = AGE_CLASSES_7
export type PopulationAgeClass = AgeClass7

/** 人口メッシュ（都道府県ごとの目次）。data_build/population.py が生成 */
export const populationIndexSchema = z.object({
  prefCode: z.string(),
  version: z.string(),
  years: z.array(z.number().int()).min(1),
  ageClasses: z.tuple([
    z.literal('0-4'),
    z.literal('5-14'),
    z.literal('15-29'),
    z.literal('30-49'),
    z.literal('50-64'),
    z.literal('65-74'),
    z.literal('75+'),
  ]),
  tiles: z.array(z.string()),
})
export type PopulationIndex = z.infer<typeof populationIndexSchema>

/** 人口の集計単位（秘匿・合算メッシュをまとめたもの）。pop は [年次][年齢区分（7区分）] */
export const populationUnitSchema = z.object({
  id: z.string(),
  meshes: z.array(z.string()).min(1),
  pop: z.array(z.array(z.number()).length(POPULATION_AGE_CLASSES.length)),
})
export type PopulationUnit = z.infer<typeof populationUnitSchema>

export const populationTileSchema = z.object({ units: z.array(populationUnitSchema) })

/** 祝日データ（data_build/build_holidays.py が生成） */
export const holidaysFileSchema = z.object({
  source: z.string(),
  sourceUrl: z.url(),
  publishedThrough: z.string(),
  estimatedNote: z.string(),
  yearEnd: z.object({ from: z.string(), to: z.string(), source: z.string() }),
  items: z.array(z.object({ date: z.string(), name: z.string(), estimated: z.boolean() })),
})
export type HolidaysFile = z.infer<typeof holidaysFileSchema>

/** 車両プリセット（public/data/vehicle_presets.json） */
export const vehiclePresetsFileSchema = z.object({
  checkedAt: z.string(),
  items: z.array(
    z.object({
      presetId: z.string(),
      name: z.string(),
      capacity: z.number().nullable(),
      seats: z.number().nullable(),
      standingAllowed: z.boolean().nullable(),
      operatorOnBoard: z.boolean().nullable(),
      operatorUsesPassengerSeat: z.boolean().nullable(),
      unverified: z.array(z.string()),
      operatorCount: z.number().nullable(),
      maxSpeedKmh: z.number().nullable(),
      avgSpeedKmh: z.number().nullable(),
      rangeKm: z.number().nullable(),
      chargeHours: z.number().nullable(),
      wheelchair: z.boolean().nullable(),
      autonomyLevel: z.enum(['L2', 'L4']).nullable(),
      sources: z.record(z.string(), z.string()),
    }),
  ),
})
export type VehiclePresetsFile = z.infer<typeof vehiclePresetsFileSchema>

/** 運賃の参考データ（public/data/fare_references.json）。各値に出典を持つ */
export const fareReferenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['market', 'upperLimit']),
  /** 種別：route＝路線バス、community＝コミュニティバス、autonomous＝自動運転バス（F-4A-1） */
  category: z.enum(['route', 'community', 'autonomous']),
  prefCode: z.string().regex(/^\d{2}$/),
  cityCodes: z.array(z.string().regex(/^\d{5}$/)).nullable(),
  operator: z.string(),
  fareType: z.enum(['flat', 'distance']),
  flatFare: z.number().nullable(),
  baseFare: z.number().nullable(),
  ratePerKm: z.number().nullable(),
  source: z.object({
    title: z.string(),
    url: z.url(),
    checkedAt: z.string(),
    quote: z.string().optional(),
  }),
  note: z.string().optional(),
  /** 種別の分類の根拠（運行主体・委託・補助が書かれた公式ページと、その文言）。コミュニティバスで必須 */
  categoryBasis: z.object({ text: z.string(), url: z.url() }).optional(),
})

export const fareReferencesFileSchema = z.object({
  checkedAt: z.string(),
  /** 注意書き（画面に表示する） */
  notice: z.string(),
  /** 調べたが公式資料で確認できなかった項目（空欄のまま） */
  notFound: z.array(z.string()),
  items: z.array(fareReferenceSchema),
})
export type FareReferencesFile = z.infer<typeof fareReferencesFileSchema>

/** 需要推計の係数（public/data/coefficients.json）。data_build/build_coefficients.py が生成。年齢は人口と同じ7区分 */
const ageCoefficientSchema = z.object({
  outingRate: z.number().min(0).max(1),
  tripRate: z.number().min(0),
  busShare: z.number().min(0).max(1),
})
const dayCoefficientsSchema = z.object(
  Object.fromEntries(AGE_CLASSES_7.map((a) => [a, ageCoefficientSchema])) as Record<
    AgeClass7,
    typeof ageCoefficientSchema
  >,
)
export const coefficientsFileSchema = z.object({
  survey: z.object({
    name: z.string(),
    year: z.number().int(),
    provider: z.string(),
    pageUrl: z.url(),
  }),
  tables: z.record(z.string(), z.string()),
  tableFiles: z.array(z.object({ title: z.string(), url: z.url() })),
  ageMapping: z.record(z.string(), z.object({ from: z.array(z.string()), note: z.string() })),
  ageMappingStatus: z.string(),
  cityTypes: z.array(z.object({ code: z.number().int(), name: z.string() })),
  /** 都市類型コード → 平日／休日 → 年齢区分 → 係数 */
  values: z.record(
    z.string(),
    z.object({ weekday: dayCoefficientsSchema, holiday: dayCoefficientsSchema }),
  ),
})
export type CoefficientsFile = z.infer<typeof coefficientsFileSchema>

/** 市区町村 → 都市類型（public/data/city_types.json）。一覧にない市区町村は自動判定しない */
export const cityTypesFileSchema = z.object({
  source: z.object({ title: z.string(), url: z.url(), note: z.string() }),
  fallbackCode: z.number().int(),
  fallbackName: z.string(),
  rules: z.array(
    z.object({
      prefCode: z.string().regex(/^\d{2}$/),
      cityCodeFrom: z.string().regex(/^\d{5}$/),
      cityCodeTo: z.string().regex(/^\d{5}$/),
      cityType: z.number().int(),
      basis: z.string(),
    }),
  ),
})
export type CityTypesFile = z.infer<typeof cityTypesFileSchema>

/** 同梱の参考実績（public/data/reference_actuals.json。data_build/build_reference_actuals.py が生成。F-5-5） */
export const referenceActualsFileSchema = z.object({
  checkedAt: z.string(),
  note: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      operator: z.string(),
      category: z.enum(['route', 'community', 'other']),
      fiscalYear: z.number().int().nullable(),
      dailyRiders: z.number().positive(),
      dailyTrips: z.number().nullable(),
      dailyFareRevenue: z.number().nullable(),
      routeLengthKm: z.number().nullable(),
      source: z.object({ title: z.string(), url: z.url(), checkedAt: z.string() }),
    }),
  ),
})
export type ReferenceActualsFile = z.infer<typeof referenceActualsFileSchema>
