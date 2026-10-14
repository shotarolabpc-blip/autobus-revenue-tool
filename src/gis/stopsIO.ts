import { stripBom } from '../util/text'
/**
 * ルート・バス停の GeoJSON／CSV 入出力（要件 F-2-11）。ブラウザ内で処理し、外部へ送らない。
 */
import type { Route, Stop } from '../project/schema'
import { routeLine } from './route'

export const CSV_HEADER = ['順番', '名称', '緯度', '経度', '勢圏半径m', '既存バス停ID'] as const

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** バス停の一覧（UTF-8 BOM 付きは呼び出し側で付ける） */
export function stopsToCsv(stops: Stop[]): string {
  const rows = [CSV_HEADER.join(',')]
  stops.forEach((s, i) =>
    rows.push([i + 1, s.name, s.lat, s.lng, s.catchmentM, s.existingStopId].map(csvCell).join(',')),
  )
  return rows.join('\r\n') + '\r\n'
}

export function routeToGeoJson(stops: Stop[], route: Route, meta: Record<string, unknown>) {
  return {
    type: 'FeatureCollection' as const,
    metadata: meta,
    features: [
      ...stops.map((s, i) => ({
        type: 'Feature' as const,
        properties: {
          kind: 'stop',
          order: i + 1,
          name: s.name,
          catchmentM: s.catchmentM,
          existingStopId: s.existingStopId,
        },
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      })),
      {
        type: 'Feature' as const,
        properties: {
          kind: 'route',
          loop: route.loop,
          // 停車順（バス停の「order」の並び。同じバス停が何度出てもよい）
          sequence: route.sequence.map((id) => stops.findIndex((s) => s.id === id) + 1),
        },
        geometry: { type: 'LineString' as const, coordinates: routeLine(route, stops) },
      },
    ],
  }
}

/** CSV の1行を読む（ダブルクォート対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const t = stripBom(text)
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

export type ImportedStop = Omit<Stop, 'id'>
export type ImportResult =
  | {
      ok: true
      stops: ImportedStop[]
      loop: boolean | null
      /** 停車順（stops の何番目か。1始まり）。ファイルになければ null（バス停の並びが停車順） */
      sequence: number[] | null
    }
  | { ok: false; errors: string[] }

/** 取り込み（GeoJSON または CSV）。バス停の並びは「順番」（なければファイルの順） */
export function importStops(
  text: string,
  fileName: string,
  defaultCatchmentM: number,
): ImportResult {
  const errors: string[] = []
  const check = (lat: number, lng: number, where: string) => {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      errors.push(`${where}：緯度が正しくありません`)
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      errors.push(`${where}：経度が正しくありません`)
  }
  if (/\.(geo)?json$/i.test(fileName)) {
    let gj: unknown
    try {
      gj = JSON.parse(stripBom(text))
    } catch {
      return { ok: false, errors: ['GeoJSON として読めません'] }
    }
    const feats = (gj as { features?: unknown[] }).features
    if (!Array.isArray(feats)) return { ok: false, errors: ['GeoJSON の features がありません'] }
    let loop: boolean | null = null
    let sequence: number[] | null = null
    const items: { order: number; stop: ImportedStop }[] = []
    feats.forEach((f, idx) => {
      const g = (f as { geometry?: { type?: string; coordinates?: unknown } }).geometry
      const p = ((f as { properties?: Record<string, unknown> }).properties ?? {}) as Record<
        string,
        unknown
      >
      if (g?.type === 'LineString' && typeof p.loop === 'boolean') loop = p.loop
      if (g?.type === 'LineString' && Array.isArray(p.sequence)) {
        sequence = p.sequence.map(Number)
      }
      if (g?.type !== 'Point') return
      const [lng, lat] = g.coordinates as number[]
      const where = `${items.length + 1}件目のバス停`
      check(lat, lng, where)
      items.push({
        order: Number(p.order ?? idx + 1),
        stop: {
          name: String(p.name ?? p['名称'] ?? `バス停${items.length + 1}`),
          lat,
          lng,
          catchmentM: Number(p.catchmentM ?? defaultCatchmentM) || defaultCatchmentM,
          existingStopId: typeof p.existingStopId === 'string' ? p.existingStopId : null,
        },
      })
    })
    if (items.length === 0) errors.push('バス停（点）がありません')
    if (errors.length) return { ok: false, errors: errors.slice(0, 20) }
    items.sort((a, b) => a.order - b.order)
    // 停車順は、取り込んだバス停の数の範囲に収まっているときだけ使う
    const n = items.length
    const validSequence =
      sequence && (sequence as number[]).every((k) => Number.isInteger(k) && k >= 1 && k <= n)
        ? (sequence as number[])
        : null
    return { ok: true, stops: items.map((x) => x.stop), loop, sequence: validSequence }
  }
  if (/\.csv$/i.test(fileName)) {
    const rows = parseCsv(text)
    if (rows.length < 2) return { ok: false, errors: ['CSV にデータの行がありません'] }
    const head = rows[0].map((h) => h.trim())
    const col = (name: string) => head.indexOf(name)
    const ci = {
      order: col('順番'),
      name: col('名称'),
      lat: col('緯度'),
      lng: col('経度'),
      r: col('勢圏半径m'),
      ex: col('既存バス停ID'),
    }
    if (ci.lat < 0 || ci.lng < 0) {
      return {
        ok: false,
        errors: [`CSV の1行目に「緯度」「経度」の列が必要です（列：${CSV_HEADER.join('、')}）`],
      }
    }
    const items = rows.slice(1).map((r, i) => {
      const lat = Number(r[ci.lat])
      const lng = Number(r[ci.lng])
      check(lat, lng, `${i + 2}行目`)
      return {
        order: ci.order >= 0 ? Number(r[ci.order]) : i + 1,
        stop: {
          name: ci.name >= 0 ? r[ci.name].trim() : `バス停${i + 1}`,
          lat,
          lng,
          catchmentM: ci.r >= 0 && Number(r[ci.r]) > 0 ? Number(r[ci.r]) : defaultCatchmentM,
          existingStopId: ci.ex >= 0 && r[ci.ex]?.trim() ? r[ci.ex].trim() : null,
        },
      }
    })
    if (errors.length) return { ok: false, errors: errors.slice(0, 20) }
    items.sort((a, b) => a.order - b.order)
    return { ok: true, stops: items.map((x) => x.stop), loop: null, sequence: null }
  }
  return { ok: false, errors: ['GeoJSON（.geojson／.json）または CSV（.csv）を選んでください'] }
}
