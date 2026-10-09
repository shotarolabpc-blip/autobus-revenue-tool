import { withBom } from '../util/text'
import { describe, expect, it } from 'vitest'
import type { Route, Stop } from '../project/schema'
import { emptySegment } from './route'
import { importStops, parseCsv, routeToGeoJson, stopsToCsv } from './stopsIO'

const stops: Stop[] = [
  { id: 'a', name: '駅前', lat: 35.0, lng: 139.0, existingStopId: '13-000001', catchmentM: 300 },
  { id: 'b', name: '市役所, 北口', lat: 35.01, lng: 139.01, existingStopId: null, catchmentM: 500 },
]
const route: Route = {
  loop: true,
  segments: [emptySegment('a', 'b', 'straight')],
  lengthOverrideKm: null,
}

describe('CSV', () => {
  it('書き出したCSVを読み込むと同じバス停になる（カンマを含む名称も）', () => {
    const csv = stopsToCsv(stops)
    expect(csv.split('\r\n')[0]).toBe('順番,名称,緯度,経度,勢圏半径m,既存バス停ID')
    expect(csv).toContain('"市役所, 北口"')
    const r = importStops(withBom(csv), 'stops.csv', 300)
    expect(r.ok).toBe(true)
    if (r.ok)
      expect(r.stops).toEqual(
        stops.map((s) => ({ ...s, id: undefined })).map(({ id, ...rest }) => (void id, rest)),
      )
  })

  it('「順番」の列で並べ替える', () => {
    const r = importStops('順番,名称,緯度,経度\n2,B,35.1,139.1\n1,A,35,139\n', 'x.csv', 300)
    expect(r.ok && r.stops.map((s) => s.name)).toEqual(['A', 'B'])
    expect(r.ok && r.stops[0].catchmentM).toBe(300)
  })

  it('緯度・経度の列がない、値が不正な場合は理由を返す', () => {
    expect(importStops('名称\nA\n', 'x.csv', 300)).toEqual({
      ok: false,
      errors: [expect.stringContaining('緯度')],
    })
    const r = importStops('緯度,経度\n95,139\n', 'x.csv', 300)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toBe('2行目：緯度が正しくありません')
  })

  it('改行を含むセル・空行', () => {
    expect(parseCsv('a,"b\nc"\n\n1,2')).toEqual([
      ['a', 'b\nc'],
      ['1', '2'],
    ])
  })
})

describe('GeoJSON', () => {
  it('書き出したGeoJSONを読み込むと同じバス停と循環の指定になる', () => {
    const gj = routeToGeoJson(stops, route, { tool: 'test' })
    expect(gj.features).toHaveLength(3)
    const r = importStops(JSON.stringify(gj), 'route.geojson', 300)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.stops.map((s) => s.name)).toEqual(['駅前', '市役所, 北口'])
      expect(r.loop).toBe(true)
    }
  })

  it('点がないGeoJSONはエラー', () => {
    const r = importStops('{"type":"FeatureCollection","features":[]}', 'x.geojson', 300)
    expect(r.ok).toBe(false)
  })

  it('対応していない形式', () => {
    expect(importStops('', 'x.xlsx', 300).ok).toBe(false)
  })
})
