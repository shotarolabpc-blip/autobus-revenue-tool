/**
 * 運賃の計算。要件 F-4（F-4-2・F-4-3・F-4-5・F-4-6）。純粋関数のみ。
 * 運賃は税込（円）で扱い、税抜換算も返す（F-6-4）。
 */

export type Rounding = 'ceil10' | 'round10' | 'floor10'

export type FareCategory = { name: string; share: number; discount: number }

/** 10円単位の端数処理 */
export function roundFare(yen: number, rounding: Rounding): number {
  // 浮動小数の誤差（例：10.000000001）で切上げにならないよう、1銭未満を丸めてから処理する
  const v = Math.round(yen * 100) / 100 / 10
  const r =
    rounding === 'ceil10' ? Math.ceil(v) : rounding === 'floor10' ? Math.floor(v) : Math.round(v)
  return r * 10
}

/** 対キロ区間制：初乗り運賃＋賃率×区間キロ（端数処理あり） */
export function distanceFare(
  km: number,
  baseFare: number,
  ratePerKm: number,
  rounding: Rounding,
): number {
  return roundFare(baseFare + ratePerKm * km, rounding)
}

/**
 * バス停間の距離（km）。stopKm[i] はルートの起点から i 番目のバス停までの距離。
 * 往復ルートは |stopKm[j] − stopKm[i]|、循環ルートは進行方向に回った距離。
 */
export function sectionKm(
  stopKm: number[],
  i: number,
  j: number,
  loop: boolean,
  totalKm: number,
): number {
  if (!loop) return Math.abs(stopKm[j] - stopKm[i])
  return j >= i ? stopKm[j] - stopKm[i] : totalKm - stopKm[i] + stopKm[j]
}

export type FareSettings = {
  type: 'flat' | 'distance'
  flatFare: number
  baseFare: number
  ratePerKm: number
  rounding: Rounding
}

/**
 * 運賃表（乗車 i → 降車 j の運賃、円）。対角は null。
 * overrides は手修正した運賃（キー "i-j"）で、自動計算の値より優先する（F-4-5）。
 */
export function fareTable(
  stopKm: number[],
  loop: boolean,
  totalKm: number,
  s: FareSettings,
  overrides: Map<string, number> = new Map(),
): (number | null)[][] {
  const n = stopKm.length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return null
      const o = overrides.get(`${i}-${j}`)
      if (o !== undefined) return o
      if (s.type === 'flat') return s.flatFare
      return distanceFare(
        sectionKm(stopKm, i, j, loop, totalKm),
        s.baseFare,
        s.ratePerKm,
        s.rounding,
      )
    }),
  )
}

export type CategoryCheck = { shareTotal: number; ok: boolean }

/** 割引区分の構成比の合計（1になっているか） */
export function checkCategories(categories: FareCategory[]): CategoryCheck {
  const shareTotal = categories.reduce((a, c) => a + c.share, 0)
  return { shareTotal, ok: Math.abs(shareTotal - 1) < 1e-6 }
}

/**
 * 実効平均運賃＝Σ（区分別構成比 × 運賃 × (1−割引率)）（F-4 本文）。
 * 構成比の合計が1でない場合は、合計で割って比率にそろえる。
 */
export function effectiveFare(baseFare: number, categories: FareCategory[]): number {
  const total = categories.reduce((a, c) => a + c.share, 0)
  if (total <= 0) return baseFare
  return categories.reduce((a, c) => a + (c.share / total) * baseFare * (1 - c.discount), 0)
}

/** 税込 → 税抜 */
export function excludeTax(yenIncludingTax: number, taxRate: number): number {
  return yenIncludingTax / (1 + taxRate)
}

/**
 * 対キロ区間制の平均運賃（割引前）。
 * - 平均乗車距離（avgRideKm）が入力されていれば、その距離の運賃。
 * - なければ、バス停別の乗車数（boardings）で重みを付け、各バス停から先のバス停へ均等に降車すると仮定して、運賃表を平均する。
 *   TODO(根拠未確定)：「均等に降車」は仮定。平均乗車距離の既定の決め方はユーザー確認待ち。
 */
export function averageDistanceFare(
  table: (number | null)[][],
  boardings: number[],
  loop: boolean,
  s: FareSettings,
  avgRideKm: number | null,
): { fare: number; method: 'avgRideKm' | 'uniformAlighting' } {
  if (avgRideKm !== null) {
    return {
      fare: distanceFare(avgRideKm, s.baseFare, s.ratePerKm, s.rounding),
      method: 'avgRideKm',
    }
  }
  const n = table.length
  let sum = 0
  let weight = 0
  for (let i = 0; i < n; i++) {
    const dests: number[] = []
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      // 往復ルートは両方向に乗る。循環ルートは一方向に回る（全バス停が行き先）
      const f = table[i][j]
      if (f !== null) dests.push(f)
    }
    if (dests.length === 0) continue
    const avg = dests.reduce((a, b) => a + b, 0) / dests.length
    const w = boardings[i] ?? 0
    sum += avg * w
    weight += w
  }
  void loop
  return { fare: weight > 0 ? sum / weight : 0, method: 'uniformAlighting' }
}
