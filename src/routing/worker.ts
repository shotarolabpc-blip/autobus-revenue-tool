/// <reference lib="webworker" />
/**
 * 経路計算の Web Worker（画面を固まらせないため。F-2-5c）。
 * 通信するのは、このサイト自身の道路網タイルの取得だけ（入力データは外部へ送らない）。
 */
import {
  RoadGraph,
  type LngLat,
  type RoadIndex,
  type RouteOptions,
  type RouteResult,
} from './router'

export type RouteRequest = {
  id: number
  prefCode: string
  from: LngLat
  to: LngLat
  options: RouteOptions
}

export type RouteResponse =
  | { id: number; ok: true; result: RouteResult; elapsedMs: number; loadedTiles: number }
  | { id: number; ok: false; error: string }

const graphs = new Map<string, Promise<RoadGraph | null>>()

function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`
}

function getGraph(prefCode: string): Promise<RoadGraph | null> {
  if (!graphs.has(prefCode)) {
    const p = (async () => {
      const res = await fetch(dataUrl(`roads/${prefCode}/index.json`))
      if (!res.ok) return null
      const index = (await res.json()) as RoadIndex
      return new RoadGraph(index, async (tx, ty) => {
        const r = await fetch(dataUrl(`roads/${prefCode}/${tx}_${ty}.bin.gz`))
        return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
      })
    })()
    p.catch(() => graphs.delete(prefCode))
    graphs.set(prefCode, p)
  }
  return graphs.get(prefCode)!
}

self.onmessage = async (ev: MessageEvent<RouteRequest>) => {
  const { id, prefCode, from, to, options } = ev.data
  try {
    const t0 = performance.now()
    const graph = await getGraph(prefCode)
    if (!graph) {
      const res: RouteResponse = {
        id,
        ok: true,
        result: {
          found: false,
          reason: 'no-path',
          message: 'この都道府県の道路網データはまだ整備されていません',
        },
        elapsedMs: 0,
        loadedTiles: 0,
      }
      self.postMessage(res)
      return
    }
    const result = await graph.route(from, to, options)
    const res: RouteResponse = {
      id,
      ok: true,
      result,
      elapsedMs: performance.now() - t0,
      loadedTiles: graph.loadedTileCount,
    }
    self.postMessage(res)
  } catch (e) {
    const res: RouteResponse = { id, ok: false, error: e instanceof Error ? e.message : String(e) }
    self.postMessage(res)
  }
}
