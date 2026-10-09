/**
 * ブラウザ内の経路計算（要件 F-2-5c・F-2-5d・F-2-5f）。
 * 道路網タイルを必要な範囲だけ読み込み、A* で最短経路を求める。UI からは worker.ts 経由で使う。
 */
import { decodeTile, maybeGunzip, type RoadTile } from './tileFormat'

export type LngLat = [number, number]

export type RoadIndex = {
  prefCode: string
  tileSizeDeg: number
  origin: [number, number]
  classes: string[]
  costFactor: number[]
  tiles: [number, number][]
  osmTimestamp: string
}

/** タイルの中身を取得する関数（無ければ null）。テストでは差し替える */
export type TileFetcher = (tx: number, ty: number) => Promise<Uint8Array | null>

export type RouteOptions = {
  /** 経路が見つからないときに読込範囲を広げる余白（km）。順に試す */
  marginsKm: number[]
  /** スナップ（最寄りの道路に寄せる）を探す半径（m） */
  snapSearchM: number
}

export type SnapResult = {
  /** 寄せた先の点 */
  point: LngLat
  /** 寄せた距離（m） */
  distanceM: number
}

export type RouteResult =
  | {
      found: true
      coordinates: LngLat[]
      lengthM: number
      from: SnapResult
      to: SnapResult
      /** 探索したノード数（性能確認用） */
      visited: number
    }
  | { found: false; reason: 'no-road-near-start' | 'no-road-near-end' | 'no-path'; message: string }

const EARTH_R = 6371008.8
const RAD = Math.PI / 180

export function haversineM(a: LngLat, b: LngLat): number {
  const p1 = a[1] * RAD
  const p2 = b[1] * RAD
  const dp = p2 - p1
  const dl = (b[0] - a[0]) * RAD
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 点 p から線分 a-b への最近点（局所的な平面近似）。t は a からの割合 */
function projectToSegment(p: LngLat, a: LngLat, b: LngLat): { t: number; point: LngLat } {
  const k = Math.cos(p[1] * RAD)
  const ax = a[0] * k
  const bx = b[0] * k
  const px = p[0] * k
  const dx = bx - ax
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return { t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
}

/** 二分ヒープ（優先度付きキュー） */
class MinHeap {
  private keys: number[] = []
  private vals: number[] = []
  get size() {
    return this.keys.length
  }
  push(key: number, val: number) {
    const k = this.keys
    const v = this.vals
    let i = k.length
    k.push(key)
    v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      k[i] = k[p]
      v[i] = v[p]
      i = p
    }
    k[i] = key
    v[i] = val
  }
  pop(): [number, number] {
    const k = this.keys
    const v = this.vals
    const topK = k[0]
    const topV = v[0]
    const lastK = k.pop()!
    const lastV = v.pop()!
    if (k.length > 0) {
      let i = 0
      const n = k.length
      for (;;) {
        const l = 2 * i + 1
        if (l >= n) break
        const r = l + 1
        const c = r < n && k[r] < k[l] ? r : l
        if (k[c] >= lastK) break
        k[i] = k[c]
        v[i] = v[c]
        i = c
      }
      k[i] = lastK
      v[i] = lastV
    }
    return [topK, topV]
  }
}

const TILE_BITS = 2 ** 20 // タイル内番号の上限（約100万）
const tileKey = (tx: number, ty: number) => (tx + 2048) * 4096 + (ty + 2048)
const nodeId = (tx: number, ty: number, i: number) => tileKey(tx, ty) * TILE_BITS + i

type EdgeRef = { tile: RoadTile; e: number }

/** 辺の向き付きの点列（出発ノード → 途中の点 → 行き先ノード） */
function edgeCoords(g: RoadGraph, ref: EdgeRef, srcIndex: number): LngLat[] | null {
  const { tile, e } = ref
  const target = g.tile(tile.edgeTargetTx[e], tile.edgeTargetTy[e])
  if (!target) return null
  const pts: LngLat[] = [[tile.coords[srcIndex * 2], tile.coords[srcIndex * 2 + 1]]]
  for (let j = tile.edgeShapeStart[e]; j < tile.edgeShapeStart[e + 1]; j++) {
    pts.push([tile.shape[j * 2], tile.shape[j * 2 + 1]])
  }
  const ti = tile.edgeTarget[e]
  pts.push([target.coords[ti * 2], target.coords[ti * 2 + 1]])
  return pts
}

/** 点列の先頭から distance m の位置で切り分ける */
function splitLine(pts: LngLat[], distance: number): [LngLat[], LngLat[]] {
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const d = haversineM(pts[i], pts[i + 1])
    if (acc + d >= distance) {
      const t = d === 0 ? 0 : (distance - acc) / d
      const p: LngLat = [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
      ]
      return [
        [...pts.slice(0, i + 1), p],
        [p, ...pts.slice(i + 1)],
      ]
    }
    acc += d
  }
  return [pts, [pts[pts.length - 1]]]
}

function lineLength(pts: LngLat[]): number {
  let s = 0
  for (let i = 0; i < pts.length - 1; i++) s += haversineM(pts[i], pts[i + 1])
  return s
}

/** 道路上の位置（辺の上の点） */
type EdgePosition = {
  tile: RoadTile
  src: number
  e: number
  coords: LngLat[]
  /** 辺の始点からの距離（m、辺の長さに換算） */
  offset: number
  point: LngLat
  distanceM: number
}

export class RoadGraph {
  private tiles = new Map<number, RoadTile | null>()
  private loading = new Map<number, Promise<void>>()
  private available: Set<number>
  private minFactor: number

  readonly index: RoadIndex
  private readonly fetchTile: TileFetcher

  constructor(index: RoadIndex, fetchTile: TileFetcher) {
    this.index = index
    this.fetchTile = fetchTile
    this.available = new Set(index.tiles.map(([x, y]) => tileKey(x, y)))
    this.minFactor = Math.min(1, ...index.costFactor)
  }

  tile(tx: number, ty: number): RoadTile | null {
    return this.tiles.get(tileKey(tx, ty)) ?? null
  }

  get loadedTileCount(): number {
    return [...this.tiles.values()].filter(Boolean).length
  }

  tileOf([lng, lat]: LngLat): [number, number] {
    const s = this.index.tileSizeDeg
    return [
      Math.floor((lng - this.index.origin[0]) / s),
      Math.floor((lat - this.index.origin[1]) / s),
    ]
  }

  private async loadTile(tx: number, ty: number): Promise<void> {
    const key = tileKey(tx, ty)
    if (this.tiles.has(key) || !this.available.has(key)) return
    let p = this.loading.get(key)
    if (!p) {
      p = (async () => {
        const raw = await this.fetchTile(tx, ty)
        const tile = raw
          ? decodeTile(await maybeGunzip(raw), this.index.tileSizeDeg, this.index.origin)
          : null
        this.tiles.set(key, tile)
      })()
      this.loading.set(key, p)
      p.finally(() => this.loading.delete(key))
    }
    await p
  }

  /** 範囲（経度・緯度）にかかるタイルと、その辺の行き先のタイルを読み込む */
  async ensureBounds(west: number, south: number, east: number, north: number): Promise<void> {
    const [x0, y0] = this.tileOf([west, south])
    const [x1, y1] = this.tileOf([east, north])
    const jobs: Promise<void>[] = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(this.loadTile(x, y))
    await Promise.all(jobs)
    // 範囲の端をまたぐ長い辺の行き先も読む（1回だけ）
    const more = new Set<string>()
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const t = this.tile(x, y)
        if (!t) continue
        for (let e = 0; e < t.edgeTarget.length; e++) {
          const k = `${t.edgeTargetTx[e]},${t.edgeTargetTy[e]}`
          if (!this.tiles.has(tileKey(t.edgeTargetTx[e], t.edgeTargetTy[e]))) more.add(k)
        }
      }
    }
    await Promise.all(
      [...more].map((k) => {
        const [x, y] = k.split(',').map(Number)
        return this.loadTile(x, y)
      }),
    )
  }

  /** 読込済みのタイルから、点に最も近い道路上の位置を探す（同じ距離の辺はすべて返す） */
  nearestPositions(p: LngLat, searchM: number): EdgePosition[] {
    const dLat = searchM / 111_000
    const dLng = dLat / Math.max(0.1, Math.cos(p[1] * RAD))
    const [x0, y0] = this.tileOf([p[0] - dLng, p[1] - dLat])
    const [x1, y1] = this.tileOf([p[0] + dLng, p[1] + dLat])
    let best = Infinity
    let found: EdgePosition[] = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const t = this.tile(x, y)
        if (!t) continue
        const n = t.edgeStart.length - 1
        for (let i = 0; i < n; i++) {
          for (let e = t.edgeStart[i]; e < t.edgeStart[i + 1]; e++) {
            const coords = edgeCoords(this, { tile: t, e }, i)
            if (!coords) continue
            // 粗い判定：辺の外接矩形が探索範囲にかからなければ飛ばす
            let minX = Infinity
            let minY = Infinity
            let maxX = -Infinity
            let maxY = -Infinity
            for (const [cx, cy] of coords) {
              if (cx < minX) minX = cx
              if (cx > maxX) maxX = cx
              if (cy < minY) minY = cy
              if (cy > maxY) maxY = cy
            }
            if (
              maxX < p[0] - dLng ||
              minX > p[0] + dLng ||
              maxY < p[1] - dLat ||
              minY > p[1] + dLat
            ) {
              continue
            }
            let along = 0
            for (let j = 0; j < coords.length - 1; j++) {
              const pr = projectToSegment(p, coords[j], coords[j + 1])
              const d = haversineM(p, pr.point)
              const segLen = haversineM(coords[j], coords[j + 1])
              if (d <= searchM && d < best - 0.01) {
                best = d
                found = []
              }
              if (d <= searchM && Math.abs(d - best) <= 0.01) {
                const geomLen = lineLength(coords)
                const scale = geomLen > 0 ? t.edgeLength[e] / geomLen : 1
                found.push({
                  tile: t,
                  src: i,
                  e,
                  coords,
                  offset: (along + segLen * pr.t) * scale,
                  point: pr.point,
                  distanceM: d,
                })
              }
              along += segLen
            }
          }
        }
      }
    }
    // 同じ辺が複数の線分で一致した場合は1つにする
    const seen = new Set<string>()
    return found.filter((f) => {
      const k = `${f.tile.tx},${f.tile.ty},${f.e}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  /** A*（読込済みのタイルの範囲で探索する） */
  private search(from: EdgePosition[], to: EdgePosition[]): RouteResult | null {
    const goalPoint = to[0].point
    const factor = this.index.costFactor
    const dist = new Map<number, number>()
    const prev = new Map<number, { node: number; tile: RoadTile; src: number; e: number } | null>()
    const where = new Map<number, [RoadTile, number]>()
    const heap = new MinHeap()
    const h = (lng: number, lat: number) => haversineM([lng, lat], goalPoint) * this.minFactor

    // 目的地の辺の始点に着いたら、その辺の途中まで進めばゴール
    const goalBySrc = new Map<number, EdgePosition[]>()
    for (const g of to) {
      const id = nodeId(g.tile.tx, g.tile.ty, g.src)
      goalBySrc.set(id, [...(goalBySrc.get(id) ?? []), g])
    }

    let best = Infinity
    let bestEnd: { node: number | null; goal: EdgePosition; start: EdgePosition | null } | null =
      null

    // 出発点と目的地が同じ辺の上で、順方向に並んでいる場合
    for (const s of from) {
      for (const g of to) {
        if (s.tile === g.tile && s.e === g.e && g.offset >= s.offset) {
          const c = (g.offset - s.offset) * factor[s.tile.edgeClass[s.e]]
          if (c < best) {
            best = c
            bestEnd = { node: null, goal: g, start: s }
          }
        }
      }
    }

    const startOf = new Map<number, EdgePosition>()
    for (const s of from) {
      const t = s.tile
      const tTile = this.tile(t.edgeTargetTx[s.e], t.edgeTargetTy[s.e])
      if (!tTile) continue
      const v = nodeId(t.edgeTargetTx[s.e], t.edgeTargetTy[s.e], t.edgeTarget[s.e])
      const c = (t.edgeLength[s.e] - s.offset) * factor[t.edgeClass[s.e]]
      if (c < (dist.get(v) ?? Infinity)) {
        dist.set(v, c)
        prev.set(v, null)
        startOf.set(v, s)
        where.set(v, [tTile, t.edgeTarget[s.e]])
        const vi = t.edgeTarget[s.e]
        heap.push(c + h(tTile.coords[vi * 2], tTile.coords[vi * 2 + 1]), v)
      }
    }

    let visited = 0
    const done = new Set<number>()
    while (heap.size > 0) {
      const [f, u] = heap.pop()
      if (f >= best) break
      if (done.has(u)) continue
      done.add(u)
      visited++
      const du = dist.get(u)!
      const [tile, i] = where.get(u)!
      for (const g of goalBySrc.get(u) ?? []) {
        const c = du + g.offset * factor[g.tile.edgeClass[g.e]]
        if (c < best) {
          best = c
          bestEnd = { node: u, goal: g, start: null }
        }
      }
      for (let e = tile.edgeStart[i]; e < tile.edgeStart[i + 1]; e++) {
        const vtx = tile.edgeTargetTx[e]
        const vty = tile.edgeTargetTy[e]
        const vt = this.tile(vtx, vty)
        if (!vt) continue // 読み込んでいない範囲には進まない
        const vi = tile.edgeTarget[e]
        const v = nodeId(vtx, vty, vi)
        const c = du + tile.edgeLength[e] * factor[tile.edgeClass[e]]
        if (c < (dist.get(v) ?? Infinity)) {
          dist.set(v, c)
          prev.set(v, { node: u, tile, src: i, e })
          where.set(v, [vt, vi])
          heap.push(c + h(vt.coords[vi * 2], vt.coords[vi * 2 + 1]), v)
        }
      }
    }
    if (!bestEnd) return null

    // 経路の線を組み立てる
    let coords: LngLat[]
    const goal = bestEnd.goal
    if (bestEnd.node === null) {
      const s = bestEnd.start!
      const [, rest] = splitLine(
        s.coords,
        (s.offset / s.tile.edgeLength[s.e]) * lineLength(s.coords),
      )
      const [part] = splitLine(
        rest,
        ((goal.offset - s.offset) / s.tile.edgeLength[s.e]) * lineLength(s.coords),
      )
      coords = part
    } else {
      const edges: { tile: RoadTile; src: number; e: number }[] = []
      let n: number = bestEnd.node
      while (prev.get(n)) {
        const p = prev.get(n)!
        edges.push(p)
        n = p.node
      }
      edges.reverse()
      const s = startOf.get(n)!
      const sLen = lineLength(s.coords)
      coords = splitLine(s.coords, (s.offset / s.tile.edgeLength[s.e]) * sLen)[1]
      for (const ed of edges) {
        const pts = edgeCoords(this, { tile: ed.tile, e: ed.e }, ed.src)!
        coords.push(...pts.slice(1))
      }
      const gLen = lineLength(goal.coords)
      const [part] = splitLine(goal.coords, (goal.offset / goal.tile.edgeLength[goal.e]) * gLen)
      coords.push(...part.slice(1))
    }
    const startPos = bestEnd.start ?? startOf.get(firstNode(prev, bestEnd.node!))!
    return {
      found: true,
      coordinates: dedupe(coords),
      lengthM: lineLength(coords),
      from: { point: startPos.point, distanceM: startPos.distanceM },
      to: { point: goal.point, distanceM: goal.distanceM },
      visited,
    }
  }

  /** 2点間の経路。必要な範囲のタイルを読み込み、見つからなければ範囲を広げて再試行する */
  async route(a: LngLat, b: LngLat, opt: RouteOptions): Promise<RouteResult> {
    let lastReason: RouteResult | null = null
    for (const marginKm of opt.marginsKm) {
      const dLat = marginKm / 111
      const dLng = dLat / Math.max(0.1, Math.cos(((a[1] + b[1]) / 2) * RAD))
      await this.ensureBounds(
        Math.min(a[0], b[0]) - dLng,
        Math.min(a[1], b[1]) - dLat,
        Math.max(a[0], b[0]) + dLng,
        Math.max(a[1], b[1]) + dLat,
      )
      const from = this.nearestPositions(a, opt.snapSearchM)
      if (from.length === 0) {
        lastReason = {
          found: false,
          reason: 'no-road-near-start',
          message: `出発側のバス停から${opt.snapSearchM}m以内に、バスが通れる道路がありません`,
        }
        continue
      }
      const to = this.nearestPositions(b, opt.snapSearchM)
      if (to.length === 0) {
        lastReason = {
          found: false,
          reason: 'no-road-near-end',
          message: `到着側のバス停から${opt.snapSearchM}m以内に、バスが通れる道路がありません`,
        }
        continue
      }
      const r = this.search(from, to)
      if (r) return r
      lastReason = {
        found: false,
        reason: 'no-path',
        message: 'バスが通れる道路で結ぶ経路が見つかりません（一方通行や道路の途切れのため）',
      }
    }
    return lastReason!
  }
}

function firstNode(prev: Map<number, { node: number } | null>, node: number): number {
  let n = node
  while (prev.get(n)) n = prev.get(n)!.node
  return n
}

function dedupe(pts: LngLat[]): LngLat[] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
}
