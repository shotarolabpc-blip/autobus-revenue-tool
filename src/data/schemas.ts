import { z } from 'zod'

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

/** 人口メッシュ（都道府県ごとの目次）。data_build/population.py が生成 */
export const populationIndexSchema = z.object({
  prefCode: z.string(),
  version: z.string(),
  years: z.array(z.number().int()).min(1),
  ageClasses: z.tuple([
    z.literal('0-14'),
    z.literal('15-64'),
    z.literal('65-74'),
    z.literal('75+'),
  ]),
  tiles: z.array(z.string()),
})
export type PopulationIndex = z.infer<typeof populationIndexSchema>

/** 人口の集計単位（秘匿・合算メッシュをまとめたもの）。pop は [年次][年齢階層] */
export const populationUnitSchema = z.object({
  id: z.string(),
  meshes: z.array(z.string()).min(1),
  pop: z.array(z.array(z.number()).length(4)),
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
