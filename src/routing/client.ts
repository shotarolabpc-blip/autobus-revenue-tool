import { z } from 'zod'
import { fetchJson } from '../data/staticData'
import type { LngLat, RouteResult, SnapResult } from './router'
import type { RouteRequest, RouteResponse } from './worker'

export const routingSettingsSchema = z.object({
  snapSearchM: z.number().positive(),
  /** これより遠くへ寄せたら警告する（m） */
  snapWarnM: z.number().positive(),
  /** 経由点を、この距離以内の交差点に吸着させる（m） */
  viaSnapM: z.number().positive(),
  marginsKm: z.array(z.number().positive()).min(1),
})
export type RoutingSettings = z.infer<typeof routingSettingsSchema>

let settings: Promise<RoutingSettings> | null = null
export function loadRoutingSettings(): Promise<RoutingSettings> {
  settings ??= fetchJson('routing.json', routingSettingsSchema)
  return settings
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (r: RouteResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<RouteResponse>) => {
      pending.get(ev.data.id)?.(ev.data)
      pending.delete(ev.data.id)
    }
  }
  return worker
}

export type RouteOutcome = { result: RouteResult; elapsedMs: number; loadedTiles: number }

/** 道路に沿った2点間の経路を、Web Worker で計算する */
export async function computeRoute(
  prefCode: string,
  from: LngLat,
  to: LngLat,
): Promise<RouteOutcome> {
  const s = await loadRoutingSettings()
  const id = nextId++
  const req: RouteRequest = {
    type: 'route',
    id,
    prefCode,
    from,
    to,
    options: { marginsKm: s.marginsKm, snapSearchM: s.snapSearchM },
  }
  const res = await new Promise<RouteResponse>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(req)
  })
  if (!res.ok) throw new Error(res.error)
  if (!('result' in res)) throw new Error('経路計算の応答が不正です')
  return { result: res.result, elapsedMs: res.elapsedMs, loadedTiles: res.loadedTiles }
}

/** 点を最寄りの道路に寄せる（近くに道路がなければ null） */
export async function snapToRoad(prefCode: string, point: LngLat): Promise<SnapResult | null> {
  const s = await loadRoutingSettings()
  const id = nextId++
  const req: RouteRequest = { type: 'snap', id, prefCode, point, searchM: s.snapSearchM }
  const res = await new Promise<RouteResponse>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(req)
  })
  if (!res.ok) throw new Error(res.error)
  return 'snap' in res ? res.snap : null
}

/** 点を最寄りの交差点に寄せる（searchM 以内に交差点がなければ null） */
export async function snapToIntersection(
  prefCode: string,
  point: LngLat,
  searchM: number,
): Promise<SnapResult | null> {
  const id = nextId++
  const req: RouteRequest = { type: 'snapNode', id, prefCode, point, searchM }
  const res = await new Promise<RouteResponse>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(req)
  })
  if (!res.ok) throw new Error(res.error)
  return 'snap' in res ? res.snap : null
}

export type ViaPlacement = {
  point: LngLat
  /** 交差点に吸着した／道路上に寄せた／そのまま（近くに道路がない） */
  kind: 'intersection' | 'road' | 'free'
  distanceM: number
}

/**
 * 経由点を置く位置を決める：近くの交差点があればそこへ、なければ最寄りの道路上へ、道路がなければそのまま。
 */
export async function placeViaPoint(prefCode: string, p: LngLat): Promise<ViaPlacement> {
  const s = await loadRoutingSettings()
  const node = await snapToIntersection(prefCode, p, s.viaSnapM)
  if (node) return { point: node.point, kind: 'intersection', distanceM: node.distanceM }
  const road = await snapToRoad(prefCode, p)
  if (road) return { point: road.point, kind: 'road', distanceM: road.distanceM }
  return { point: p, kind: 'free', distanceM: 0 }
}
