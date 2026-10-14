import { z } from 'zod'

/**
 * プロジェクトファイル（.busproj.json）の形式。要件定義書「7. プロジェクトファイル仕様」。
 * 形式を変えたら CURRENT_SCHEMA_VERSION を上げ、src/project/migrations/ に変換処理を追加すること。
 * 計算結果と人口メッシュは保存しない（読込時に再計算する。F-1-10）。
 */
export const CURRENT_SCHEMA_VERSION = '1.1'

/** 年齢階層（要件 5.1「最低 0-14／15-64／65-74／75歳以上」） */
export const AGE_CLASSES = ['0-14', '15-64', '65-74', '75+'] as const
export type AgeClass = (typeof AGE_CLASSES)[number]

const id = z.string().min(1)
const lng = z.number().min(-180).max(180)
const lat = z.number().min(-90).max(90)
const position = z.tuple([lng, lat])
const nonNegative = z.number().min(0)
const ratio = z.number().min(0).max(1)
const fiscalYear = z.number().int().min(2000).max(2100)

export const stopSchema = z.object({
  id,
  name: z.string(),
  lat,
  lng,
  /** 既存バス停（国土数値情報）から採用した場合の参照ID */
  existingStopId: z.string().nullable(),
  /** 勢圏半径（m） */
  catchmentM: z.number().positive(),
})

/** バス停間の1区間。バス停の並び順（stops の配列順）に対応する */
export const segmentSchema = z.object({
  fromStopId: id,
  toStopId: id,
  /** 自動（道路沿いの経路計算）／直線／手描き（F-2-5c） */
  method: z.enum(['auto', 'straight', 'manual']),
  /** 経由点（バス停扱いしない。F-2-5b） */
  via: z.array(position),
  /** 区間の線形。道路データが更新されても同じ結果を再現できるよう保存する */
  coordinates: z.array(position),
  /** 線形から求めた距離（km） */
  lengthKm: nonNegative.nullable(),
  /** 手修正した距離（km）。null なら lengthKm を使う（F-2-6） */
  lengthOverrideKm: nonNegative.nullable(),
})

export const routeSchema = z.object({
  /** true＝循環（最後のバス停から最初のバス停まで自動でつなぐ）、false＝往復（F-2-7） */
  loop: z.boolean(),
  /**
   * 停車順（バス停IDの並び）。同じバス停が何度出てもよい（ラケット型・8の字など、きれいな循環でないルート）。
   * scenario.stops は、ここに出てくるバス停を「最初に出てきた順」に1つずつ並べたもの（schemaVersion 1.1 で追加）。
   */
  sequence: z.array(id),
  /** segments[i] は sequence[i] → sequence[i+1]。循環なら最後の区間は sequence の最後 → 最初 */
  segments: z.array(segmentSchema),
  /** ルート総延長の手修正（km）。null なら区間の合計 */
  lengthOverrideKm: nonNegative.nullable(),
})

export const vehicleSchema = z.object({
  /** プリセットのID（カスタムは 'custom'） */
  presetId: z.string(),
  name: z.string(),
  /** 公道・自動運転時の運用定員 */
  capacity: nonNegative.nullable(),
  seats: nonNegative.nullable(),
  standingAllowed: z.boolean().nullable(),
  operatorOnBoard: z.boolean().nullable(),
  operatorCount: nonNegative.nullable(),
  maxSpeedKmh: nonNegative.nullable(),
  avgSpeedKmh: nonNegative.nullable(),
  rangeKm: nonNegative.nullable(),
  chargeHours: nonNegative.nullable(),
  wheelchair: z.boolean().nullable(),
  autonomyLevel: z.enum(['L2', 'L4']).nullable(),
  /** 値ごとの出典（項目名 → 出典） */
  sources: z.record(z.string(), z.string()),
})

export const serviceSchema = z.object({
  weekdayTrips: nonNegative,
  holidayTrips: nonNegative,
  /** 運行時間帯（"HH:MM"）。未入力なら null */
  serviceStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  serviceEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  /** 年末年始を運休するか（付録B：ユーザー設定） */
  yearEndSuspended: z.boolean(),
  /** 年間運行日数の手修正。null ならカレンダーから自動計算（F-3-1） */
  weekdayDaysOverride: nonNegative.nullable(),
  holidayDaysOverride: nonNegative.nullable(),
  vehicle: vehicleSchema,
  vehicles: z.number().int().min(0),
  spareVehicles: z.number().int().min(0),
  /** 想定最大乗車率（F-3A-4） */
  maxLoadFactor: ratio,
  /** 片道（循環は1周）の所要時間の手修正（分）。null なら延長÷平均速度 */
  tripMinutesOverride: nonNegative.nullable(),
})

export const fareCategorySchema = z.object({
  name: z.string(),
  /** 利用者構成比（0〜1） */
  share: ratio,
  /** 割引率（0〜1。無料パスは1） */
  discount: ratio,
})

export const fareSchema = z.object({
  /** 運賃制度区分（計算には使わず出力に記載。F-4-1） */
  system: z.enum(['実施運賃', '協議運賃']),
  type: z.enum(['flat', 'distance']),
  /** 均一制の運賃（円・税込） */
  flatFare: nonNegative,
  /** 対キロ区間制：初乗り運賃（円・税込） */
  baseFare: nonNegative,
  /** 対キロ区間制：賃率（円/km・税込） */
  ratePerKm: nonNegative,
  /** 端数処理（10円単位の切上げ・四捨五入・切捨て） */
  rounding: z.enum(['ceil10', 'round10', 'floor10']),
  /** 運賃表の手修正（F-4-5）。乗車・降車バス停の組ごと */
  tableOverrides: z.array(z.object({ fromStopId: id, toStopId: id, fare: nonNegative })),
  categories: z.array(fareCategorySchema),
  /** 平均乗車距離（km、対キロ区間制の平均運賃算出に使う仮定値）。null なら自動 */
  avgRideKmOverride: nonNegative.nullable(),
})

/** 係数の上書き。ユーザーが値と出典を入れたときだけ反映する（5.1A） */
export const coefficientOverrideSchema = z.object({
  /** 例：'outingRate.weekday.65-74' */
  key: z.string().min(1),
  value: z.number(),
  source: z.string().min(1),
})

export const coefficientsSchema = z.object({
  /** 都市類型の手動指定。null なら対象自治体から自動判定 */
  cityTypeOverride: z.string().nullable(),
  overrides: z.array(coefficientOverrideSchema),
  /** 立ち上がり係数（運行開始からの年数ごと）。空なら補正なし */
  rampUp: z.array(z.object({ yearIndex: z.number().int().min(0), factor: z.number().min(0) })),
  rampUpSource: z.string().nullable(),
  fareElasticity: z.number(),
  fareElasticitySource: z.string().nullable(),
  /** 運賃弾力性の基準運賃（円）。弾力性を使うときに必要 */
  referenceFare: nonNegative.nullable(),
  /** 運行サービス補正係数（便数・運行時間帯）。1＝補正なし */
  serviceFactor: z.number().min(0),
  serviceFactorSource: z.string().nullable(),
  /** 路線捕捉率の手動指定。null なら自動 */
  routeCaptureOverride: ratio.nullable(),
})

const ageMixSchema = z.object({
  '0-14': ratio,
  '15-64': ratio,
  '65-74': ratio,
  '75+': ratio,
})

export const developmentSchema = z.object({
  id,
  name: z.string(),
  /** 地点（地図クリック）またはメッシュ指定（F-5-1） */
  location: z.discriminatedUnion('type', [
    z.object({ type: z.literal('point'), lat, lng }),
    z.object({ type: z.literal('mesh'), meshCode: z.string().regex(/^\d{9}$/) }),
  ]),
  startFiscalYear: fiscalYear,
  people: nonNegative,
  /** 段階入居の年数（F-5-2） */
  phaseYears: z.number().int().min(1),
  /** 年齢構成。null なら既定比率 */
  ageMix: ageMixSchema.nullable(),
})

export const facilityDemandSchema = z.object({
  id,
  name: z.string(),
  visitorsPerDay: nonNegative,
  busShare: ratio,
  startFiscalYear: fiscalYear,
  /** 来訪がある日（全運行日／平日のみ／土休日のみ） */
  days: z.enum(['all', 'weekday', 'holiday']),
})

export const yearAmountSchema = z.object({
  fiscalYear,
  item: z.string(),
  /** 円 */
  amount: z.number(),
})

export const scenarioSchema = z.object({
  id,
  name: z.string().min(1),
  /** 標準／楽観／悲観／その他 */
  type: z.enum(['base', 'optimistic', 'pessimistic', 'custom']),
  /** 楽観・悲観を自動生成したときの元シナリオと増減率（F-7-2） */
  derivedFrom: z.object({ scenarioId: id, adjustPercent: z.number() }).nullable(),
  stops: z.array(stopSchema),
  route: routeSchema,
  service: serviceSchema,
  fare: fareSchema,
  coefficients: coefficientsSchema,
  /** エリア全体の人口補正率（%／年。F-5-3） */
  areaPopulationAdjustPctPerYear: z.number(),
  developments: z.array(developmentSchema),
  facilityDemand: z.array(facilityDemandSchema),
  otherRevenue: z.array(yearAmountSchema),
  /** 補助金・負担金（参考扱いで別集計。F-6-3） */
  subsidies: z.array(yearAmountSchema),
})

export const userReferenceSchema = z.object({
  id,
  name: z.string(),
  operator: z.string(),
  fiscalYear: fiscalYear.nullable(),
  dailyRiders: nonNegative,
  dailyTrips: nonNegative.nullable(),
  /** 乗車料収入（円/日） */
  dailyFareRevenue: nonNegative.nullable(),
  routeLengthKm: nonNegative.nullable(),
  source: z.string(),
})

export const projectFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  toolVersion: z.string(),
  /** 保存日時（ISO 8601） */
  savedAt: z.string(),
  project: z.object({
    name: z.string().min(1),
    municipality: z.object({
      /** 都道府県コード（JIS X 0401、2桁） */
      prefCode: z.string().regex(/^\d{2}$/),
      /** 市区町村コード（5桁）。未選択なら null */
      cityCode: z
        .string()
        .regex(/^\d{5}$/)
        .nullable(),
      name: z.string(),
    }),
    startFiscalYear: fiscalYear,
    years: z.number().int().min(1).max(50),
  }),
  /** 推計に使ったデータの版（例：population＝R6国政局推計） */
  dataVersions: z.record(z.string(), z.string()),
  scenarios: z.array(scenarioSchema).min(1),
  /** ユーザー定義の車両プリセット（F-3A-7） */
  userVehiclePresets: z.array(vehicleSchema),
  /** ユーザーが追加した参考実績（F-5-8） */
  userReferenceData: z.array(userReferenceSchema),
  /** Step2（費用計画）用に予約 */
  costs: z.null(),
})

export type Stop = z.infer<typeof stopSchema>
export type Segment = z.infer<typeof segmentSchema>
export type Route = z.infer<typeof routeSchema>
export type Vehicle = z.infer<typeof vehicleSchema>
export type Service = z.infer<typeof serviceSchema>
export type Fare = z.infer<typeof fareSchema>
export type FareCategory = z.infer<typeof fareCategorySchema>
export type Coefficients = z.infer<typeof coefficientsSchema>
export type Development = z.infer<typeof developmentSchema>
export type FacilityDemand = z.infer<typeof facilityDemandSchema>
export type YearAmount = z.infer<typeof yearAmountSchema>
export type Scenario = z.infer<typeof scenarioSchema>
export type UserReference = z.infer<typeof userReferenceSchema>
export type ProjectFile = z.infer<typeof projectFileSchema>
