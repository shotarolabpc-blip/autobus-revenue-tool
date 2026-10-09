/**
 * 道路網タイル（data_build/roadgraph.py の build_tiles が書き出す "RTL1" 形式）の読込。
 * 形式を変えるときは Python 側と両方を直すこと。
 */

const COORD_SCALE = 1_000_000

export type RoadTile = {
  tx: number
  ty: number
  /** ノードの経度・緯度（[経度0, 緯度0, 経度1, 緯度1, …]） */
  coords: Float64Array
  /** ノードiの出ていく辺は edgeStart[i] 〜 edgeStart[i+1]-1 */
  edgeStart: Uint32Array
  /** 行き先ノードのタイル（tx, ty）とタイル内番号 */
  edgeTargetTx: Int32Array
  edgeTargetTy: Int32Array
  edgeTarget: Uint32Array
  /** 長さ（m） */
  edgeLength: Float64Array
  /** 道路種別（index.json の classes の番号） */
  edgeClass: Uint8Array
  /** 途中の点（[経度, 緯度, …]）。辺ごとに edgeShapeStart の範囲 */
  edgeShapeStart: Uint32Array
  shape: Float64Array
}

class Reader {
  pos = 0
  private readonly buf: Uint8Array
  constructor(buf: Uint8Array) {
    this.buf = buf
  }

  uvarint(): number {
    let result = 0
    let mul = 1
    for (;;) {
      if (this.pos >= this.buf.length) throw new Error('道路網タイルが途中で切れています')
      const b = this.buf[this.pos++]
      result += (b & 0x7f) * mul
      if (b < 0x80) return result
      mul *= 128
    }
  }

  svarint(): number {
    const n = this.uvarint()
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2
  }
}

/** gzip 圧縮されていれば展開する（サーバが展開済みで返す場合もそのまま扱う） */
export async function maybeGunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function decodeTile(
  bytes: Uint8Array,
  tileSizeDeg: number,
  origin: [number, number],
): RoadTile {
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RTL1') {
    throw new Error('道路網タイルの形式が違います')
  }
  const r = new Reader(bytes)
  r.pos = 4
  const version = r.uvarint()
  if (version !== 1) throw new Error(`道路網タイルの版 ${version} には対応していません`)
  const tx = r.svarint()
  const ty = r.svarint()
  const n = r.uvarint()
  const coords = new Float64Array(n * 2)
  let px = Math.round((origin[0] + tx * tileSizeDeg) * COORD_SCALE)
  let py = Math.round((origin[1] + ty * tileSizeDeg) * COORD_SCALE)
  for (let i = 0; i < n; i++) {
    px += r.svarint()
    py += r.svarint()
    coords[i * 2] = px / COORD_SCALE
    coords[i * 2 + 1] = py / COORD_SCALE
  }
  const edgeStart = new Uint32Array(n + 1)
  const tTx: number[] = []
  const tTy: number[] = []
  const tIdx: number[] = []
  const len: number[] = []
  const cls: number[] = []
  const shapeStart: number[] = []
  const shape: number[] = []
  for (let i = 0; i < n; i++) {
    edgeStart[i] = tIdx.length
    const count = r.uvarint()
    for (let k = 0; k < count; k++) {
      tTx.push(tx + r.svarint())
      tTy.push(ty + r.svarint())
      tIdx.push(r.uvarint())
      len.push(r.uvarint() / 10)
      cls.push(r.uvarint())
      shapeStart.push(shape.length / 2)
      const m = r.uvarint()
      let qx = Math.round(coords[i * 2] * COORD_SCALE)
      let qy = Math.round(coords[i * 2 + 1] * COORD_SCALE)
      for (let j = 0; j < m; j++) {
        qx += r.svarint()
        qy += r.svarint()
        shape.push(qx / COORD_SCALE, qy / COORD_SCALE)
      }
    }
  }
  edgeStart[n] = tIdx.length
  shapeStart.push(shape.length / 2)
  return {
    tx,
    ty,
    coords,
    edgeStart,
    edgeTargetTx: Int32Array.from(tTx),
    edgeTargetTy: Int32Array.from(tTy),
    edgeTarget: Uint32Array.from(tIdx),
    edgeLength: Float64Array.from(len),
    edgeClass: Uint8Array.from(cls),
    edgeShapeStart: Uint32Array.from(shapeStart),
    shape: Float64Array.from(shape),
  }
}
