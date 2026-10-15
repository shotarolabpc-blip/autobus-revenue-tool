import type { Attribution, CoefficientsFile, DefaultsFile, HolidaysFile } from '../../data/schemas'

export type BaselineProps = {
  defaults: DefaultsFile
  coefficients: CoefficientsFile
  holidays: HolidaysFile
  attributions: Attribution[]
}

export type BaselineRow = { item: string; value: string; source: string }

/** 初期値と根拠の一覧（付録B）。値はすべて設定ファイル（public/data）から読み、コードに直書きしない */
export function baselineRows({
  defaults,
  coefficients,
  holidays,
  attributions,
}: BaselineProps): BaselineRow[] {
  const d = defaults.items
  const pop = attributions.find((a) => a.id === 'ksj-population')
  const withYear = (src: string, year: number | null) => (year ? `${src}（${year}年）` : src)
  return [
    {
      item: 'バス停勢圏',
      value: `${d.catchmentM.value}${d.catchmentM.unit}（${d.catchmentM.options?.join('・')}mから選択）`,
      source: withYear(d.catchmentM.source, d.catchmentM.year),
    },
    {
      item: '外出率・トリップ数・バス分担率',
      value: '都市類型 × 年齢区分（7区分）× 平日／休日',
      source: `${coefficients.survey.name}（${coefficients.survey.provider}）。${coefficients.ageMappingStatus}`,
    },
    {
      item: '年間運行日数（平日／土休日）',
      value: '対象年度の実際のカレンダーから自動計算',
      source: `${holidays.source}。年末年始の運休はユーザー設定。${holidays.estimatedNote}`,
    },
    {
      item: '人口',
      value: '500mメッシュ別将来推計人口（年次は線形補間）',
      source: pop
        ? `${pop.name}（${pop.provider}、${pop.license}、${pop.dataVersion ?? ''}）`
        : '国土数値情報',
    },
    {
      item: '推計期間',
      value: `${d.projectYears.value}${d.projectYears.unit}（${d.projectYears.min}〜${d.projectYears.max}年で変更可）`,
      source: d.projectYears.source,
    },
    {
      item: '運賃の消費税',
      value: `税込で入力し、税率${d.consumptionTaxRate.value * 100}%で税抜に換算`,
      source: withYear(d.consumptionTaxRate.source, d.consumptionTaxRate.year),
    },
    {
      item: '車両定員',
      value: '車両プリセットの「自動運転時」定員',
      source: '各メーカー・運行事業者の公表値（車両ごとに出典を記載）',
    },
    {
      item: '最大乗車率',
      value: `${d.maxLoadFactor.value * 100}%`,
      source: d.maxLoadFactor.source,
    },
    {
      item: '立ち上がり係数',
      value: `${d.rampUpFactor.value * 100}%（補正なし）`,
      source: d.rampUpFactor.source,
    },
    {
      item: '運賃弾力性',
      value: `${d.fareElasticity.value}（補正なし）`,
      source: d.fareElasticity.source,
    },
    {
      item: '運賃の目安（標準・高め）',
      value: '標準＝種別ごとの相場の中央値（既定はコミュニティバス）、高め＝認可上限運賃',
      source:
        '公式資料（運輸局の公示・事業者の運賃表など）。各値に出典URLと確認日を記載（「運行・運賃」画面）',
    },
    {
      item: '路線捕捉率',
      value: '手入力（空欄は100%＝既存路線との重なりを考慮しない）',
      source:
        '計算ルールとして設定（数値の仮置きはしない）。既存路線の便数が分かる資料がないため、重なりがあるときは手入力が必要',
    },
  ]
}
