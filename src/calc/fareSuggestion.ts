/**
 * 運賃の目安（「標準」「高め」）の提案と、上限運賃を超えたときの警告。要件 F-4、F-4-8。純粋関数のみ。
 *
 * 考え方：
 * - 乗合バスの運賃に、法律で決まった金額の上限はない。事業者が国から認可を受けた「上限運賃」の範囲内で届け出る
 *   （実施運賃）か、地域公共交通会議などで協議が調った額を届け出る（協議運賃）。
 * - 「標準」＝対象地域で実際に運行しているバスの運賃（相場）の中央値。
 * - 「高め」＝上限運賃（法律めいっぱい）。ユーザーが事業者の認可額を入力していればそれを使い、
 *   なければ参考データの上限運賃のうち最も高いものを使う。
 * 参考データは public/data/fare_references.json（各値に出典つき）。値を推測で補わない。
 */
import type { Fare } from '../project/schema'

export type FareType = 'flat' | 'distance'

export type FareReference = {
  id: string
  /** market＝実際に運行している路線の運賃（相場）、upperLimit＝認可された上限運賃 */
  kind: 'market' | 'upperLimit'
  prefCode: string
  /** 対象の市区町村コード（5桁）。null＝都道府県全体の参考 */
  cityCodes: string[] | null
  operator: string
  fareType: FareType
  flatFare: number | null
  baseFare: number | null
  ratePerKm: number | null
  source: { title: string; url: string; checkedAt: string; quote?: string }
  note?: string
}

export type UpperLimit = NonNullable<Fare['upperLimit']>

export type FareSuggestion = {
  fareType: FareType
  flatFare: number | null
  baseFare: number | null
  ratePerKm: number | null
  /** 何をもとにした値か（画面に表示する説明） */
  basis: string
  /** もとにした参考データ（出典を表示する）。ユーザー入力の上限運賃なら空 */
  references: FareReference[]
  /** 参考データの最小・最大（標準のみ） */
  range: { min: number; max: number } | null
}

export type SuggestionResult = {
  standard: FareSuggestion | null
  high: FareSuggestion | null
  /** 提案できない理由・注意（画面に表示する） */
  messages: string[]
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** 運賃は10円単位。中央値が10円単位でないときは、四捨五入する */
const to10 = (yen: number) => Math.round(yen / 10) * 10
/** 賃率（円/km）は小数第1位まで */
const to1 = (v: number) => Math.round(v * 10) / 10

/** 対象の地域に当てはまる参考データ（都道府県全体のものと、その市区町村のもの） */
export function refsForArea(
  refs: FareReference[],
  prefCode: string,
  cityCode: string | null,
): FareReference[] {
  return refs.filter(
    (r) =>
      r.prefCode === prefCode &&
      (r.cityCodes === null || (cityCode !== null && r.cityCodes.includes(cityCode))),
  )
}

export function suggestFares(args: {
  refs: FareReference[]
  prefCode: string
  cityCode: string | null
  fareType: FareType
  userUpperLimit: UpperLimit | null
}): SuggestionResult {
  const { fareType } = args
  const messages: string[] = []
  const area = refsForArea(args.refs, args.prefCode, args.cityCode)
  const typeLabel = fareType === 'flat' ? '均一制' : '対キロ区間制'

  // ---- 標準：相場（実際に運行しているバスの運賃）の中央値
  const market = area.filter((r) => r.kind === 'market' && r.fareType === fareType)
  let standard: FareSuggestion | null = null
  if (fareType === 'flat') {
    const used = market.filter((r) => r.flatFare !== null)
    const m = median(used.map((r) => r.flatFare as number))
    if (m !== null) {
      standard = {
        fareType,
        flatFare: to10(m),
        baseFare: null,
        ratePerKm: null,
        basis: `この地域で運行している${typeLabel}のバス ${used.length}件の運賃の中央値`,
        references: used,
        range: {
          min: Math.min(...used.map((r) => r.flatFare as number)),
          max: Math.max(...used.map((r) => r.flatFare as number)),
        },
      }
    }
  } else {
    const used = market.filter((r) => r.baseFare !== null && r.ratePerKm !== null)
    const b = median(used.map((r) => r.baseFare as number))
    const k = median(used.map((r) => r.ratePerKm as number))
    if (b !== null && k !== null) {
      standard = {
        fareType,
        flatFare: null,
        baseFare: to10(b),
        ratePerKm: to1(k),
        basis: `この地域で運行している${typeLabel}のバス ${used.length}件の初乗り運賃・賃率の中央値`,
        references: used,
        range: {
          min: Math.min(...used.map((r) => r.baseFare as number)),
          max: Math.max(...used.map((r) => r.baseFare as number)),
        },
      }
    }
  }
  if (!standard) {
    messages.push(
      `この地域の${typeLabel}の運賃の参考データがまだ載っていないため、「標準」は提案できません（運賃を直接入力してください）。`,
    )
  }

  // ---- 高め：上限運賃（ユーザー入力があれば優先。なければ参考データの最大）
  let high: FareSuggestion | null = null
  const u = args.userUpperLimit
  const userValues =
    u && (fareType === 'flat' ? u.flatFare !== null : u.baseFare !== null && u.ratePerKm !== null)
  if (u && userValues) {
    high = {
      fareType,
      flatFare: fareType === 'flat' ? u.flatFare : null,
      baseFare: fareType === 'distance' ? u.baseFare : null,
      ratePerKm: fareType === 'distance' ? u.ratePerKm : null,
      basis: `入力した上限運賃（${u.source || '出典未入力'}）`,
      references: [],
      range: null,
    }
  } else {
    const limits = area.filter((r) => r.kind === 'upperLimit' && r.fareType === fareType)
    if (fareType === 'flat') {
      const used = limits.filter((r) => r.flatFare !== null)
      if (used.length) {
        high = {
          fareType,
          flatFare: Math.max(...used.map((r) => r.flatFare as number)),
          baseFare: null,
          ratePerKm: null,
          basis: `この地域の事業者の上限運賃（認可額）${used.length}件のうち最も高い額`,
          references: used,
          range: null,
        }
      }
    } else {
      const used = limits.filter((r) => r.baseFare !== null && r.ratePerKm !== null)
      if (used.length) {
        // 事業者ごとに初乗り運賃と賃率はセットで認可されるので、複数の事業者の最大値を混ぜず、
        // 初乗り運賃がいちばん高い事業者（同じなら賃率が高い事業者）の上限運賃をそのまま使う
        const top = [...used].sort(
          (a, b) =>
            (b.baseFare as number) - (a.baseFare as number) ||
            (b.ratePerKm as number) - (a.ratePerKm as number),
        )[0]
        high = {
          fareType,
          flatFare: null,
          baseFare: top.baseFare,
          ratePerKm: top.ratePerKm,
          basis: `この地域の事業者の上限運賃（認可額）${used.length}件のうち、初乗り運賃が最も高い事業者（${top.operator}）の額`,
          references: [top],
          range: null,
        }
      }
    }
  }
  if (!high) {
    messages.push(
      `${typeLabel}の上限運賃の参考データがないため、「高め」は提案できません。運行事業者が認可を受けた上限運賃を、下の欄に入力してください。`,
    )
  }
  if (standard && high) {
    const over =
      fareType === 'flat'
        ? (standard.flatFare ?? 0) > (high.flatFare ?? Infinity)
        : (standard.baseFare ?? 0) > (high.baseFare ?? Infinity) ||
          (standard.ratePerKm ?? 0) > (high.ratePerKm ?? Infinity)
    if (over) {
      messages.push(
        '「標準」の運賃が上限運賃を超えています。運行事業者・上限運賃の前提を確認してください。',
      )
    }
  }
  return { standard, high, messages }
}

/** 入力した運賃が上限運賃を超えていれば、その内容（画面に表示する警告）を返す */
export function upperLimitWarnings(
  fare: Pick<Fare, 'type' | 'flatFare' | 'baseFare' | 'ratePerKm'>,
  upper: Fare['upperLimit'],
): string[] {
  if (!upper) return []
  const out: string[] = []
  if (fare.type === 'flat') {
    if (upper.flatFare !== null && fare.flatFare > upper.flatFare) {
      out.push(`運賃 ${fare.flatFare}円 が、上限運賃 ${upper.flatFare}円 を超えています`)
    }
  } else {
    if (upper.baseFare !== null && fare.baseFare > upper.baseFare) {
      out.push(`初乗り運賃 ${fare.baseFare}円 が、上限 ${upper.baseFare}円 を超えています`)
    }
    if (upper.ratePerKm !== null && fare.ratePerKm > upper.ratePerKm) {
      out.push(`賃率 ${fare.ratePerKm}円/km が、上限 ${upper.ratePerKm}円/km を超えています`)
    }
  }
  return out
}
