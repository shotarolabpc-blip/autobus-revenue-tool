/**
 * 年齢区分（Q3：B、2026-10-15 決定）。純粋関数のみ。
 *
 * 人口データと係数は、全国都市交通特性調査の年齢区分に合わせた7区分で持つ。
 *   0-4（調査の対象外。扱いはQ2で決める）／5-14／15-29／30-49／50-64／65-74／75+
 * 区分ごとに「外出率×トリップ数×バス分担率」をそのまま掛けるので、区分をまとめるための平均や重みは要らない。
 * 要件定義書の4階層（0-14／15-64／65-74／75+）は、画面の表示と、開発計画の年齢構成の入力に使う。
 */

export const AGE_CLASSES_7 = ['0-4', '5-14', '15-29', '30-49', '50-64', '65-74', '75+'] as const
export type AgeClass7 = (typeof AGE_CLASSES_7)[number]

/** 4階層（表示用）と、それに含まれる7区分 */
export const GROUPS_4 = {
  '0-14': ['0-4', '5-14'],
  '15-64': ['15-29', '30-49', '50-64'],
  '65-74': ['65-74'],
  '75+': ['75+'],
} as const satisfies Record<string, readonly AgeClass7[]>
export type Group4 = keyof typeof GROUPS_4
export type Mix4 = Record<Group4, number>

/** 7区分の人口を、4階層にまとめる（画面の表示用） */
export function groupPopulation(pop7: readonly number[]): Record<Group4, number> {
  const out = { '0-14': 0, '15-64': 0, '65-74': 0, '75+': 0 }
  for (const [group, members] of Object.entries(GROUPS_4)) {
    for (const m of members) out[group as Group4] += pop7[AGE_CLASSES_7.indexOf(m)] ?? 0
  }
  return out
}

/**
 * 4階層の年齢構成（開発計画で入力する割合。合計1）を、7区分の割合に広げる。
 * 各階層の割合は、その階層の中の区分に、基準の人口（勢圏の年齢構成）の比で分ける。
 * 基準の人口がその階層で0のときは、均等に分ける。
 */
export function expandAgeMix(mix4: Mix4, basis7: readonly number[]): number[] {
  const out = new Array<number>(AGE_CLASSES_7.length).fill(0)
  for (const [group, members] of Object.entries(GROUPS_4)) {
    const idx = members.map((m) => AGE_CLASSES_7.indexOf(m))
    const total = idx.reduce((a, i) => a + (basis7[i] ?? 0), 0)
    for (const i of idx) {
      const share = total > 0 ? (basis7[i] ?? 0) / total : 1 / idx.length
      out[i] = mix4[group as Group4] * share
    }
  }
  return out
}
