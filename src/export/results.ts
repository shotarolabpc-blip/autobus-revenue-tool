/**
 * 推計結果の出力（CSV・Excel 共通の表）。要件 F-8-3・F-8-4・F-8-7。純粋関数のみ。
 *
 * シート：前提条件／運賃表／年度別推計／バス停別／出典一覧
 * （参考実績比較シートは、参考実績データ〈F-5-5〜F-5-8〉の実装後に追加する）
 * すべてのシートの先頭に「推計日時・シナリオ名・データ版数・出典・ツール版数」を入れる（F-8-7）。
 */
import { fareTableFromDistances } from '../calc/fare'
import { fareSettings, overridesByIndex } from '../calc/fareInputs'
import { stopAnnualRiders, type ScenarioResult } from '../calc/pipeline'
import { effectiveCapacity, dailyCapacity } from '../calc/service'
import { AGE_CLASSES_7 } from '../calc/ageClasses'
import { positionDistancesKm, stopToStopKm } from '../gis/route'
import { attributionText } from '../map/attribution'
import type { Attribution, CoefficientsFile, FareReferencesFile } from '../data/schemas'
import type { ProjectFile, Scenario } from '../project/schema'
import { fareAssumptionRows } from './fareNotes'
import { withBom } from '../util/text'

export type Cell = string | number | null
export type Sheet = {
  name: string
  rows: Cell[][]
  /** 表の見出し行の位置（Excel で太字にする） */ headerRows: number[]
}

export type ExportContext = {
  project: ProjectFile
  /** 元のシナリオから自動生成した楽観・悲観は、元の入力を引き継いだもの（resolveDerived 済み） */
  scenario: Scenario
  result: ScenarioResult
  coefficientsFile: CoefficientsFile
  fareRefs: FareReferencesFile
  attributions: Attribution[]
  populationVersion: string | null
  /** 消費税率（比率） */
  taxRate: number
  toolVersion: string
  now: Date
}

/** 出力する数値の丸め（人数は小数第1位、金額は円） */
const r1 = (v: number) => Math.round(v * 10) / 10
const yen = (v: number) => Math.round(v)

const stamp = (d: Date) => d.toLocaleString('ja-JP', { hour12: false })
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 全シート共通の先頭部分（F-8-7） */
export function metaRows(ctx: ExportContext): Cell[][] {
  const used = ctx.attributions.filter((a) =>
    ['ksj-population', 'osm', 'mlit-survey', 'vehicle-specs'].includes(a.id),
  )
  return [
    ['推計日時', stamp(ctx.now)],
    ['プロジェクト', ctx.project.project.name],
    ['シナリオ', ctx.result.scenarioName],
    [
      'データ版数',
      `人口：${ctx.populationVersion ?? '不明'}／係数：${ctx.coefficientsFile.survey.name}／都市類型：${ctx.result.cityType.name}`,
    ],
    ['出典', used.map((a) => a.name).join('、') + '（詳細は「出典一覧」）'],
    ['ツール版数', `v${ctx.toolVersion}`],
    [],
  ]
}

export function assumptionsSheet(ctx: ExportContext): Sheet {
  const { project, scenario: sc, result: r, coefficientsFile: cf } = ctx
  const sv = sc.service
  const v = sv.vehicle
  const meta = metaRows(ctx)
  const rows: Cell[][] = [...meta, ['項目', '値', '出典・根拠', '備考']]
  const header = [meta.length]
  const add = (item: string, value: Cell, source = '', note = '') =>
    rows.push([item, value, source, note])

  const m = project.project.municipality
  add('対象自治体', `${m.name}（${m.prefCode}${m.cityCode ? `・${m.cityCode}` : ''}）`)
  add('推計期間', `${project.project.startFiscalYear}年度から${project.project.years}年間`)
  add('延べ乗車人員', '乗車した回数の合計（往復で2回乗れば2回）。実人数ではない')
  add(
    '年度の人口',
    'その年の暦年の値（5年刻みの推計を線形補間）',
    '国土数値情報 500mメッシュ別将来推計人口（R6国政局推計）',
  )
  add(
    '都市類型',
    r.cityType.name,
    r.cityType.basis,
    r.cityType.auto ? '自動判定' : '自動判定できない、またはユーザー指定',
  )
  for (const [k, t] of Object.entries(cf.tables)) {
    add(
      `係数の元の表：${{ outingRate: '外出率', tripRate: 'トリップ数', busShare: 'バス分担率' }[k] ?? k}`,
      t,
      cf.survey.pageUrl,
    )
  }
  add(
    '係数の出典',
    `${cf.survey.name}（${cf.survey.provider}）`,
    cf.survey.pageUrl,
    cf.ageMappingStatus,
  )
  add(
    '路線捕捉率',
    r.captureRate,
    sc.coefficients.routeCaptureOverride === null ? '既定（重複を考慮しない）' : 'ユーザー指定',
  )
  add(
    '運行サービス補正係数',
    sc.coefficients.serviceFactor,
    sc.coefficients.serviceFactorSource ?? '',
    sc.coefficients.serviceFactor === 1 ? '補正なし' : 'ユーザー設定',
  )
  add(
    '立ち上がり係数',
    sc.coefficients.rampUp.length === 0
      ? '補正なし（100%）'
      : sc.coefficients.rampUp.map((x) => `${x.yearIndex}年目以降 ${x.factor}`).join('、'),
    sc.coefficients.rampUpSource ?? '',
    sc.coefficients.rampUp.length === 0
      ? '公的な根拠値がないため既定では補正しない'
      : 'ユーザー設定',
  )
  add(
    '運賃補正係数（運賃弾力性）',
    r.fareFactor,
    sc.coefficients.fareElasticitySource ?? '',
    `弾力性 ${sc.coefficients.fareElasticity}／基準運賃 ${sc.coefficients.referenceFare ?? '未入力'}`,
  )
  add('エリア全体の人口補正率', `${sc.areaPopulationAdjustPctPerYear} %/年`)
  if (sc.derivedFrom) {
    add(
      'シナリオの種類',
      `${sc.type === 'optimistic' ? '楽観' : '悲観'}（元のシナリオの入力を引き継ぎ、住民の需要を ${sc.derivedFrom.adjustPercent > 0 ? '+' : ''}${sc.derivedFrom.adjustPercent}%）`,
    )
  }
  for (const k of r.overriddenKeys) {
    const o = sc.coefficients.overrides.find((x) => x.key === k)
    add(`係数の上書き：${k}`, o?.value ?? null, o?.source ?? '', 'ユーザー設定')
  }
  for (const d of sc.developments) {
    add(
      `開発計画：${d.name}`,
      `${d.people}人／${d.startFiscalYear}年度開始／${d.phaseYears}年で入居`,
      'ユーザー入力',
    )
  }
  for (const f of sc.facilityDemand) {
    add(
      `施設需要：${f.name}`,
      `来訪者${f.visitorsPerDay}人/日×バス利用率${f.busShare}`,
      'ユーザー入力',
      `${f.startFiscalYear}年度開始・${{ all: '全運行日', weekday: '平日のみ', holiday: '土休日のみ' }[f.days]}`,
    )
  }
  add('バス停数・ルート延長', `${sc.stops.length}か所・${r.routeKm.toFixed(2)} km`)
  for (const s of sc.stops) add(`勢圏半径：${s.name}`, `${s.catchmentM} m`)
  const eff = effectiveCapacity(v)
  add(
    '車両',
    v.name,
    Object.values(v.sources).filter(Boolean).join(' ／ '),
    '定員等は参考値。メーカー・運行事業者に確認すること',
  )
  add('実効定員', eff ?? '未入力', '', '運用定員−乗車する保安要員の人数')
  add('便数（平日／土休日）', `${sv.weekdayTrips}／${sv.holidayTrips}`)
  add('最大乗車率', sv.maxLoadFactor)
  if (eff !== null) {
    add(
      '1日の輸送力（平日／土休日）',
      `${dailyCapacity(eff, sv.weekdayTrips, sv.maxLoadFactor)}／${dailyCapacity(eff, sv.holidayTrips, sv.maxLoadFactor)} 人`,
    )
  }
  add('年末年始の運休', sv.yearEndSuspended ? 'する' : 'しない')
  add(
    '消費税率',
    `${Math.round(ctx.taxRate * 1000) / 10}%`,
    '消費税法（標準税率10%）',
    '運賃は税込で入力し、税抜に換算',
  )
  add(
    '実効平均運賃（税込）',
    r.effectiveFare,
    '',
    r.fareMethod === 'flat'
      ? '均一制'
      : r.fareMethod === 'avgRideKm'
        ? '平均乗車距離の運賃'
        : '各バス停から先のバス停へ均等に降車すると仮定した運賃表の平均',
  )
  // 運賃の前提・注意（F-4A）
  const fare = fareAssumptionRows(project, sc, ctx.fareRefs.items, isoDay(ctx.now))
  for (const x of fare.rows) rows.push([x.item, x.value, x.source, x.note])
  for (const w of r.warnings) add('注意', w)
  // 係数の表
  rows.push([])
  header.push(rows.length)
  rows.push(['係数（日種別・年齢区分）', '外出率', 'トリップ数（回/人/日）', 'バス分担率'])
  for (const dt of ['weekday', 'holiday'] as const) {
    for (const age of AGE_CLASSES_7) {
      const c = r.coefficients[dt][age]
      rows.push([
        `${dt === 'weekday' ? '平日' : '土休日'} ${age}歳`,
        c.outingRate,
        c.tripRate,
        c.busShare,
      ])
    }
  }
  return { name: '前提条件', rows, headerRows: header }
}

export function fareTableSheet(ctx: ExportContext): Sheet {
  const { scenario: sc } = ctx
  const meta = metaRows(ctx)
  const { positionKm, totalKm } = positionDistancesKm(sc.route, sc.stops)
  const ids = sc.stops.map((s) => s.id)
  const dist = stopToStopKm(sc.route.sequence, positionKm, sc.route.loop, totalKm, ids)
  const table = fareTableFromDistances(dist, fareSettings(sc.fare), overridesByIndex(sc))
  const rows: Cell[][] = [
    ...meta,
    ['乗車＼降車（円・税込）', ...sc.stops.map((s) => s.name)],
    ...table.map((row, i) => [sc.stops[i].name, ...row.map((x) => x ?? '−')]),
  ]
  return { name: '運賃表', rows, headerRows: [meta.length] }
}

export function yearSheet(ctx: ExportContext): Sheet {
  const { result: r } = ctx
  const meta = metaRows(ctx)
  const rows: Cell[][] = [
    ...meta,
    [
      '年度',
      '運行日数（平日）',
      '運行日数（土休日）',
      '1日の延べ乗車人員（平日）',
      '1日の延べ乗車人員（土休日）',
      '年間延べ乗車人員（住民）',
      '年間延べ乗車人員（施設等）',
      '年間延べ乗車人員（合計）',
      '実効平均運賃（税込・円）',
      '運賃収入（税込・円）',
      '運賃収入（税抜・円）',
      'その他収入（円）',
      '合計（税込・円）',
      '合計（税抜・円）',
      '補助金・負担金（参考・円）',
      '輸送力で頭打ち',
    ],
  ]
  r.demand.forEach((d, i) => {
    const x = r.revenue[i]
    rows.push([
      d.fiscalYear,
      d.days.weekday,
      d.days.holiday,
      r1(d.dailyRiders.weekday),
      r1(d.dailyRiders.holiday),
      r1(d.residentsAnnual),
      r1(d.facilityAnnual),
      r1(d.totalAnnual),
      r1(x.effectiveFare),
      yen(x.fareRevenue),
      yen(x.fareRevenueExTax),
      yen(x.otherRevenue),
      yen(x.total),
      yen(x.totalExTax),
      yen(x.subsidies),
      [d.capped.weekday ? '平日' : '', d.capped.holiday ? '土休日' : '']
        .filter(Boolean)
        .join('・') || 'なし',
    ])
  })
  return { name: '年度別推計', rows, headerRows: [meta.length] }
}

export function stopSheet(ctx: ExportContext): Sheet {
  const { result: r } = ctx
  const meta = metaRows(ctx)
  const rows: Cell[][] = [
    ...meta,
    [
      '年度',
      'バス停',
      '勢圏人口（合計）',
      ...AGE_CLASSES_7.map((a) => `勢圏人口（${a}歳）`),
      'うち開発計画による増加',
      '年間延べ乗車人員（住民分）',
    ],
  ]
  for (const d of r.demand) {
    for (const s of d.stops) {
      rows.push([
        d.fiscalYear,
        r.stopNames.get(s.stopId) ?? s.stopId,
        r1(s.pop.reduce((a, b) => a + b, 0)),
        ...s.pop.map(r1),
        r1(s.development.reduce((a, b) => a + b, 0)),
        r1(stopAnnualRiders(d, s.stopId)),
      ])
    }
  }
  rows.push([], ['※施設等の外部需要は、バス停別には配分していません。'])
  return { name: 'バス停別', rows, headerRows: [meta.length] }
}

export function sourceSheet(ctx: ExportContext): Sheet {
  const meta = metaRows(ctx)
  const fare = fareAssumptionRows(ctx.project, ctx.scenario, ctx.fareRefs.items, isoDay(ctx.now))
  const rows: Cell[][] = [...meta, ['名称', '内容・ライセンス', 'URL', '確認日・版']]
  for (const a of ctx.attributions)
    rows.push([a.name, attributionText(a), a.url, a.dataVersion ?? ''])
  for (const t of ctx.coefficientsFile.tableFiles) {
    rows.push([
      `${ctx.coefficientsFile.survey.name}：${t.title}`,
      '集計表（係数の元）',
      t.url,
      `${ctx.coefficientsFile.survey.year}年`,
    ])
  }
  for (const [item, src] of Object.entries(ctx.scenario.service.vehicle.sources)) {
    if (src) rows.push([`車両：${item}`, src, '', ''])
  }
  for (const s of fare.sources)
    rows.push([`運賃の参考データ：${s.name}`, '運賃の目安のもとにした資料', s.url, s.checkedAt])
  return { name: '出典一覧', rows, headerRows: [meta.length] }
}

export function buildSheets(ctx: ExportContext): Sheet[] {
  return [
    assumptionsSheet(ctx),
    fareTableSheet(ctx),
    yearSheet(ctx),
    stopSheet(ctx),
    sourceSheet(ctx),
  ]
}

const csvCell = (v: Cell): string => {
  const s = v === null ? '' : typeof v === 'number' ? String(v) : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV（UTF-8 BOM 付き。Excel で文字化けしない。F-8-3） */
export function sheetToCsv(sheet: Sheet): string {
  return withBom(sheet.rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n')
}

/** ファイル名に使えない文字を除く */
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|\s]+/g, '_')
