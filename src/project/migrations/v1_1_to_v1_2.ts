import type { Migration, RawProject } from './index'

/**
 * 1.1 → 1.2：運賃に「上限運賃（upperLimit）」を追加する。入力がないので、すべて null（未入力）にする。
 */
export const v1_1_to_v1_2: Migration = {
  from: '1.1',
  to: '1.2',
  migrate: (data: RawProject): RawProject => {
    if (!Array.isArray(data.scenarios)) return data
    return {
      ...data,
      scenarios: data.scenarios.map((sc: unknown) => {
        if (typeof sc !== 'object' || sc === null) return sc
        const s = sc as Record<string, unknown>
        const fare = (typeof s.fare === 'object' && s.fare !== null ? s.fare : {}) as Record<
          string,
          unknown
        >
        return { ...s, fare: { ...fare, upperLimit: null } }
      }),
    }
  },
}
