/**
 * 出力物（CSV・Excel）に載せる、運賃の前提条件・注記・出典（要件 F-4A-4、F-4A-5、CLAUDE.md 規則5）。純粋関数のみ。
 * 年度別結果・バス停別結果などの出力（P1-7）も、ここで作る行と出典一覧をそのまま使う。
 */
import {
  CATEGORY_LABELS,
  fareWarnings,
  highTitle,
  staleReferences,
  type FareReference,
  type FareSuggestion,
  type SuggestionResult,
} from '../calc/fareSuggestion'
import { fareSuggestionFor } from '../calc/fareInputs'
import type { ProjectFile, Scenario } from '../project/schema'

export type AssumptionRow = {
  item: string
  value: string
  /** 出典（目安のもとにした参考データなど） */
  source: string
  note: string
}

export type SourceEntry = { name: string; url: string; checkedAt: string }

function describeSuggestion(s: FareSuggestion): string {
  return s.fareType === 'flat'
    ? `${s.flatFare}円（均一）`
    : `初乗り${s.baseFare}円＋${s.ratePerKm}円/km`
}

function describeFare(scenario: Scenario): string {
  const f = scenario.fare
  return f.type === 'flat'
    ? `${f.flatFare}円（均一制・税込）`
    : `初乗り${f.baseFare}円＋${f.ratePerKm}円/km（対キロ区間制・税込）`
}

function sourceText(refs: FareReference[]): string {
  return refs
    .map((r) => `${r.operator}：${r.source.title}（${r.source.url}、${r.source.checkedAt}確認）`)
    .join(' ／ ')
}

/** 目安（標準・高め）のもとにした参考データの出典（URL と確認日）。重複は1つにまとめる（F-4A-5） */
export function fareSourceEntries(result: SuggestionResult): SourceEntry[] {
  const refs = [
    ...result.standards.flatMap((x) => x.suggestion.references),
    ...(result.high?.references ?? []),
  ]
  const seen = new Map<string, SourceEntry>()
  for (const r of refs) {
    const key = `${r.source.url}|${r.source.checkedAt}`
    if (!seen.has(key))
      seen.set(key, { name: r.source.title, url: r.source.url, checkedAt: r.source.checkedAt })
  }
  return [...seen.values()]
}

/**
 * 運賃の前提条件の行。警告（上限運賃の超過・運賃弾力性0）と、古い可能性のある参考データの注記を含む。
 * todayIso は「今日」の日付（YYYY-MM-DD）。
 */
export function fareAssumptionRows(
  project: ProjectFile,
  scenario: Scenario,
  refs: FareReference[],
  todayIso: string,
): { rows: AssumptionRow[]; warnings: string[]; sources: SourceEntry[] } {
  const f = scenario.fare
  const result = fareSuggestionFor(project, scenario, refs)
  const warnings = fareWarnings({
    fare: f,
    high: result.high,
    elasticity: scenario.coefficients.fareElasticity,
  })
  const rows: AssumptionRow[] = [
    { item: '運賃制度区分', value: f.system, source: '', note: '計算には使わない（出力物に記載）' },
    { item: '運賃', value: describeFare(scenario), source: '', note: '' },
    {
      item: '運賃弾力性',
      value: String(scenario.coefficients.fareElasticity),
      source: scenario.coefficients.fareElasticitySource ?? '',
      note:
        scenario.coefficients.fareElasticity === 0
          ? '0＝運賃を変えても利用者が変わらない計算（公的な根拠値がないため既定では補正しない）'
          : 'ユーザー設定',
    },
  ]
  if (f.upperLimit) {
    const u = f.upperLimit
    rows.push({
      item: '上限運賃（ユーザー入力）',
      value:
        f.type === 'flat'
          ? u.flatFare === null
            ? '未入力'
            : `${u.flatFare}円`
          : u.baseFare === null || u.ratePerKm === null
            ? '未入力'
            : `初乗り${u.baseFare}円＋${u.ratePerKm}円/km`,
      source: u.source,
      note: f.system === '協議運賃' ? '協議運賃のため、上限運賃は参考（超過の警告は出さない）' : '',
    })
  }
  for (const x of result.standards) {
    rows.push({
      item: `運賃の目安：標準（${CATEGORY_LABELS[x.category]}）`,
      value: describeSuggestion(x.suggestion),
      source: sourceText(x.suggestion.references),
      note: `${x.suggestion.basis}（参考にした運賃の幅 ${x.suggestion.range?.min}〜${x.suggestion.range?.max}円）${x.category === result.emphasized ? '。この種別を強調' : ''}`,
    })
  }
  if (result.high) {
    rows.push({
      item: `運賃の目安：${highTitle(f.system)}`,
      value: describeSuggestion(result.high),
      source: sourceText(result.high.references),
      note: result.high.basis,
    })
  }
  const stale = staleReferences(
    [
      ...result.standards.flatMap((x) => x.suggestion.references),
      ...(result.high?.references ?? []),
    ],
    todayIso,
  )
  for (const w of warnings) rows.push({ item: '注意', value: w, source: '', note: '' })
  if (stale.length > 0) {
    rows.push({
      item: '注意',
      value: `運賃の目安のもとにした参考データのうち${stale.length}件は、確認日から1年以上たっており、古い可能性があります`,
      source: stale.map((r) => `${r.operator}（${r.source.checkedAt}確認）`).join('、'),
      note: '',
    })
  }
  return { rows, warnings, sources: fareSourceEntries(result) }
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * 運賃の前提条件のCSV（UTF-8 BOM は呼び出し側で付ける）。
 * 前提条件の表のあとに、注意事項と、目安に使った参考データの出典一覧を並べる。
 */
export function fareAssumptionsCsv(
  project: ProjectFile,
  scenario: Scenario,
  refs: FareReference[],
  todayIso: string,
  meta: { estimatedAt: string; toolVersion: string },
): string {
  const { rows, warnings, sources } = fareAssumptionRows(project, scenario, refs, todayIso)
  const line = (cells: string[]) => cells.map(csvCell).join(',')
  const out: string[] = [
    line(['運賃の前提条件']),
    line(['プロジェクト', project.project.name]),
    line(['シナリオ', scenario.name]),
    line(['出力日時', meta.estimatedAt]),
    line(['ツール版数', meta.toolVersion]),
    '',
    line(['項目', '値', '出典', '備考']),
    ...rows.map((r) => line([r.item, r.value, r.source, r.note])),
    '',
  ]
  if (warnings.length > 0) {
    out.push(line(['【警告】']), ...warnings.map((w) => line([w])), '')
  }
  out.push(line(['【出典一覧】運賃の目安のもとにした参考データ']), line(['名称', 'URL', '確認日']))
  if (sources.length === 0) out.push(line(['（なし）']))
  for (const s of sources) out.push(line([s.name, s.url, s.checkedAt]))
  return out.join('\r\n') + '\r\n'
}
