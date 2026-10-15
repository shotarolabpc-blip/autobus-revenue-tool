/** 色覚の違いでも区別しやすい配色（Okabe-Ito） */
export const SERIES_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7']

/** 見やすい目盛り（0から、1・2・5の倍数）。最大値より大きい最初の目盛りまで */
export function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  const out: number[] = []
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v / step) * step)
  return out
}
