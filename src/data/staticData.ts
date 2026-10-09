import type { z } from 'zod'
import {
  attributionsFileSchema,
  basemapsFileSchema,
  prefecturesFileSchema,
  type Attribution,
  type BasemapsFile,
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
