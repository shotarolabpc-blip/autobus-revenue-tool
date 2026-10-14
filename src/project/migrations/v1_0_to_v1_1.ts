import type { Migration, RawProject } from './index'

/**
 * 1.0 → 1.1：ルートに「停車順（sequence）」を追加する。
 * 1.0 ではバス停の並び（stops の順）がそのまま停車順だったので、stops の ID を順に並べる。
 */
export const v1_0_to_v1_1: Migration = {
  from: '1.0',
  to: '1.1',
  migrate: (data: RawProject): RawProject => {
    if (!Array.isArray(data.scenarios)) return data
    return {
      ...data,
      scenarios: data.scenarios.map((sc: unknown) => {
        if (typeof sc !== 'object' || sc === null) return sc
        const s = sc as Record<string, unknown>
        const stops = Array.isArray(s.stops) ? s.stops : []
        const route = (typeof s.route === 'object' && s.route !== null ? s.route : {}) as Record<
          string,
          unknown
        >
        return {
          ...s,
          route: {
            ...route,
            sequence: stops.map((x: unknown) => (x as { id?: unknown })?.id),
          },
        }
      }),
    }
  },
}
