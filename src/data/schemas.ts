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
