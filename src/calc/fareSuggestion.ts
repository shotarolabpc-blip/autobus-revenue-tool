/**
 * 運賃の目安（「標準」「高め」）の提案と、運賃に関する警告。要件 F-4、F-4-8、F-4A。純粋関数のみ。
 *
 * 考え方：
 * - 乗合バスの運賃に、法律で決まった金額の上限はない。事業者が国から認可を受けた「上限運賃」の範囲内で届け出る
 *   （実施運賃）か、地域公共交通会議などで協議が調った額を届け出る（協議運賃）。
 * - 「標準」＝対象地域で実際に運行しているバスの運賃（相場）の中央値を、**種別（路線バス／コミュニティバス／自動運転バス）ごと**に出す。
 *   既定で強調する種別はコミュニティバス。その地域にコミュニティバスの参考データがなければ、件数の多い種別を強調し、理由を返す（F-4A-1）。
 * - 「高め」＝上限運賃（法律の範囲でいちばん高い額）。ユーザーが事業者の認可額を入力していればそれを使い、
 *   なければ参考データの上限運賃のうち最も高いものを使う（F-4A-2）。
 * - 協議運賃のときは、認可上限運賃の縛りを受けないので、上限超過の警告は出さない（F-4A-3、F-4-8）。
 * 参考データは public/data/fare_references.json（各値に出典つき）。値を推測で補わない（F-4A-6）。
 */
import type { Fare } from '../project/schema'

export type FareType = 'flat' | 'distance'
export type FareSystem = Fare['system']

/** 種別：路線バス／コミュニティバス／自動運転バス */
export type FareCategory = 'route' | 'community' | 'autonomous'

/** 表示順（既定で強調するコミュニティバスを先頭にする） */
export const CATEGORY_ORDER: FareCategory[] = ['community', 'route', 'autonomous']

export const CATEGORY_LABELS: Record<FareCategory, string> = {
  route: '路線バス',
  community: 'コミュニティバス',
  autonomous: '自動運転バス',
}

export type FareReference = {
  id: string
  /** market＝実際に運行している路線の運賃（相場）、upperLimit＝認可された上限運賃 */
  kind: 'market' | 'upperLimit'
  category: FareCategory
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
  /** 種別の分類の根拠（コミュニティバスは、自治体が運行主体、または委託・補助して運行していることを示す公式ページ） */
  categoryBasis?: { text: string; url: string }
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

/** 種別ごとの「標準」（中央値・件数・最小〜最大） */
export type CategoryStandard = {
  category: FareCategory
  count: number
  suggestion: FareSuggestion
}

export type SuggestionResult = {
  /** 種別ごとの標準（データのある種別だけ。CATEGORY_ORDER の順） */
  standards: CategoryStandard[]
  /** この地域に参考データがない種別 */
  missingCategories: FareCategory[]
  /** 強調する種別。標準が1つも出せなければ null */
  emphasized: FareCategory | null
  /** 強調する種別を既定（コミュニティバス）から変えた理由。既定のままなら空 */
  emphasisReason: string
  /** 強調する種別の標準（運賃欄に反映するときの既定） */
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

/** 同じ種別の相場の参考データから、「標準」（中央値）を作る。作れなければ null */
function standardFor(
  market: FareReference[],
  fareType: FareType,
  scope: string,
): FareSuggestion | null {
  const typeLabel = fareType === 'flat' ? '均一制' : '対キロ区間制'
  if (fareType === 'flat') {
    const used = market.filter((r) => r.flatFare !== null)
    const m = median(used.map((r) => r.flatFare as number))
    if (m === null) return null
    return {
      fareType,
      flatFare: to10(m),
      baseFare: null,
      ratePerKm: null,
      basis: `${scope}の${typeLabel}のバス ${used.length}件の運賃の中央値`,
      references: used,
      range: {
        min: Math.min(...used.map((r) => r.flatFare as number)),
        max: Math.max(...used.map((r) => r.flatFare as number)),
      },
    }
  }
  const used = market.filter((r) => r.baseFare !== null && r.ratePerKm !== null)
  const b = median(used.map((r) => r.baseFare as number))
  const k = median(used.map((r) => r.ratePerKm as number))
  if (b === null || k === null) return null
  return {
    fareType,
    flatFare: null,
    baseFare: to10(b),
    ratePerKm: to1(k),
    basis: `${scope}の${typeLabel}のバス ${used.length}件の初乗り運賃・賃率の中央値`,
    references: used,
    range: {
      min: Math.min(...used.map((r) => r.baseFare as number)),
      max: Math.max(...used.map((r) => r.baseFare as number)),
    },
  }
}

export function suggestFares(args: {
  refs: FareReference[]
  prefCode: string
  cityCode: string | null
  fareType: FareType
  userUpperLimit: UpperLimit | null
  /** 運賃制度。協議運賃のときは「標準が上限を超えている」などの上限運賃に関する注意を出さない */
  system?: FareSystem
}): SuggestionResult {
  const { fareType } = args
  const system = args.system ?? '実施運賃'
  const messages: string[] = []
  const area = refsForArea(args.refs, args.prefCode, args.cityCode)
  const typeLabel = fareType === 'flat' ? '均一制' : '対キロ区間制'

  // ---- 標準：種別ごとの相場（実際に運行しているバスの運賃）の中央値
  const standards: CategoryStandard[] = []
  const missingCategories: FareCategory[] = []
  for (const category of CATEGORY_ORDER) {
    const market = area.filter(
      (r) => r.kind === 'market' && r.fareType === fareType && r.category === category,
    )
    const s = standardFor(market, fareType, `この地域の${CATEGORY_LABELS[category]}`)
    if (s) standards.push({ category, count: s.references.length, suggestion: s })
    else missingCategories.push(category)
  }

  // 強調する種別：既定はコミュニティバス。なければ、件数の多い種別（同数なら表示順で先のもの）
  let emphasized: FareCategory | null = null
  let emphasisReason = ''
  if (standards.length > 0) {
    const community = standards.find((x) => x.category === 'community')
    if (community) {
      emphasized = 'community'
    } else {
      const top = standards.reduce((a, b) => (b.count > a.count ? b : a))
      emphasized = top.category
      emphasisReason = `この地域にはコミュニティバスの${typeLabel}の参考データがないため、件数の多い「${CATEGORY_LABELS[top.category]}」（${top.count}件）を強調しています。`
    }
  } else {
    messages.push(
      `この地域の${typeLabel}の運賃の参考データがまだ載っていないため、「標準」は提案できません（運賃を直接入力してください）。`,
    )
  }
  const standard = standards.find((x) => x.category === emphasized)?.suggestion ?? null

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
  if (standard && high && system === '実施運賃') {
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
  return { standards, missingCategories, emphasized, emphasisReason, standard, high, messages }
}

/**
 * 入力した運賃が上限運賃を超えていれば、その内容（画面に表示する警告）を返す（F-4-8）。
 * 協議運賃は認可上限運賃の縛りを受けないので、警告は出さない（F-4A-3）。
 */
export function upperLimitWarnings(
  fare: Pick<Fare, 'type' | 'flatFare' | 'baseFare' | 'ratePerKm'>,
  upper: Fare['upperLimit'],
  system: FareSystem = '実施運賃',
): string[] {
  if (!upper || system === '協議運賃') return []
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

/** 運賃弾力性が0のまま運賃が高いときの警告（F-4A-4）。画面と出力物で同じ文言を使う */
export const ELASTICITY_ZERO_WARNING =
  '運賃が「高め」（上限運賃の目安）以上になっていますが、運賃弾力性が0のため、運賃を上げても利用者が減らない計算になっています（利用者の減少を見込んでいません）。運賃弾力性は、値と出典を入力した場合だけ反映されます。'

/**
 * 「高め」の運賃（上限運賃以上）になっていて、運賃弾力性が0かどうか（F-4A-4）。
 * 「高め」のボタンで反映したかどうかは保存せず、運賃の値が高め以上かどうかで判定する
 * （手で同じ額を入力した場合も、利用者の減少を見込まない点は同じなので、同じ警告が必要なため）。
 *
 * 警告が出る条件（要件 F-4A-4 の文言どおり）：
 * - 均一制：運賃が「高め」以上のとき。標準と高めの間の運賃（高めより低い運賃）では出さない。
 * - 対キロ区間制：初乗り運賃も賃率も「高め」以上のときだけ。**片方だけ高い場合は出さない**。
 * - high が null（上限運賃の目安がない）、制定形態が違う、運賃弾力性が0でないときは出さない。
 */
export function highFareWithZeroElasticity(args: {
  fare: Pick<Fare, 'type' | 'flatFare' | 'baseFare' | 'ratePerKm'>
  high: FareSuggestion | null
  elasticity: number
}): boolean {
  const { fare, high, elasticity } = args
  if (elasticity !== 0 || !high || high.fareType !== fare.type) return false
  if (fare.type === 'flat') {
    return high.flatFare !== null && fare.flatFare > 0 && fare.flatFare >= high.flatFare
  }
  return (
    high.baseFare !== null &&
    high.ratePerKm !== null &&
    fare.baseFare > 0 &&
    fare.baseFare >= high.baseFare &&
    fare.ratePerKm >= high.ratePerKm
  )
}

/** 運賃に関する警告の一覧（画面・出力物で共通）。上限運賃の超過（実施運賃のみ）と、弾力性0の警告 */
export function fareWarnings(args: {
  fare: Pick<Fare, 'type' | 'flatFare' | 'baseFare' | 'ratePerKm' | 'system' | 'upperLimit'>
  high: FareSuggestion | null
  elasticity: number
}): string[] {
  const out = upperLimitWarnings(args.fare, args.fare.upperLimit, args.fare.system)
  if (
    highFareWithZeroElasticity({ fare: args.fare, high: args.high, elasticity: args.elasticity })
  ) {
    out.push(ELASTICITY_ZERO_WARNING)
  }
  return out
}

// ------------------------------------------------------------------ 参考データの古さ（F-4A）

const pad = (n: number) => String(n).padStart(2, '0')

/** その日の日付（その場所の暦。YYYY-MM-DD）。ブラウザの今日の日付を渡すのに使う */
export function localDateIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 確認日（YYYY-MM-DD）から1年以上たっていれば true（F-4A：「古い可能性があります」の表示）。
 * 確認日のちょうど1年後の日から true。うるう日（2月29日）の確認日は、翌年の3月1日から true になる。
 */
export function isStale(checkedAt: string, todayIso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkedAt)
  if (!m) return true // 確認日が読めない値は、古いものとして扱う
  const [y, mo, d] = [Number(m[1]), m[2], m[3]]
  const oneYearLater = `${y + 1}-${mo}-${d}`
  // うるう日の翌年（2月29日が存在しない年）は、3月1日とみなす
  const normalized =
    oneYearLater.endsWith('-02-29') && !isLeapYear(y + 1) ? `${y + 1}-03-01` : oneYearLater
  return todayIso >= normalized
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** 古い可能性がある参考データ */
export function staleReferences(refs: FareReference[], todayIso: string): FareReference[] {
  return refs.filter((r) => isStale(r.source.checkedAt, todayIso))
}

// ------------------------------------------------------------------ 協議運賃のときの表示（F-4A-3）

/** 「高め」の見出し。協議運賃のときは、上限運賃は参考であることがわかる見出しにする */
export function highTitle(system: FareSystem): string {
  return system === '協議運賃' ? '参考：周辺の路線バスの上限運賃' : '高め'
}

/** 協議運賃のときに、「高め」（参考）の下に表示する説明 */
export const COUNCIL_FARE_NOTE =
  '協議運賃は、地域公共交通会議などで協議が調った額を届け出るもので、事業者が認可を受けた上限運賃の縛りを受けません。ここに示す上限運賃は、周辺の路線バスの水準を知るための参考です（上限を超えても警告は出しません）。'
