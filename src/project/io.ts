import type { z } from 'zod'
import { migrateToLatest, UnsupportedVersionError } from './migrations'
import { projectFileSchema, type ProjectFile } from './schema'

export const PROJECT_FILE_EXTENSION = '.busproj.json'

/** 先頭のBOM（Excelなどで保存し直したファイル対策） */
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`)

/** 項目名の日本語表示（エラー表示用） */
const FIELD_LABELS: Record<string, string> = {
  schemaVersion: 'ファイル形式の版',
  toolVersion: 'ツール版数',
  savedAt: '保存日時',
  project: 'プロジェクト',
  name: '名称',
  municipality: '対象自治体',
  prefCode: '都道府県コード',
  cityCode: '市区町村コード',
  startFiscalYear: '開始年度',
  years: '推計年数',
  dataVersions: 'データ版数',
  scenarios: 'シナリオ',
  stops: 'バス停',
  lat: '緯度',
  lng: '経度',
  existingStopId: '既存バス停ID',
  catchmentM: '勢圏半径',
  route: 'ルート',
  loop: '循環／往復',
  segments: '区間',
  method: '経路の引き方',
  via: '経由点',
  coordinates: '線形',
  lengthKm: '距離',
  lengthOverrideKm: '距離（手修正）',
  service: '運行計画',
  weekdayTrips: '平日便数',
  holidayTrips: '土休日便数',
  serviceStart: '運行開始時刻',
  serviceEnd: '運行終了時刻',
  vehicle: '車両',
  capacity: '定員',
  seats: '座席数',
  vehicles: '車両台数',
  spareVehicles: '予備車台数',
  maxLoadFactor: '最大乗車率',
  fare: '運賃',
  system: '運賃制度区分',
  type: '種類',
  flatFare: '均一運賃',
  baseFare: '初乗り運賃',
  ratePerKm: '賃率',
  rounding: '端数処理',
  categories: '割引区分',
  share: '構成比',
  discount: '割引率',
  coefficients: '係数',
  developments: '開発計画',
  people: '人数',
  phaseYears: '入居年数',
  facilityDemand: '施設需要',
  otherRevenue: 'その他収入',
  subsidies: '補助金・負担金',
  amount: '金額',
  fiscalYear: '年度',
  userVehiclePresets: 'ユーザー定義の車両',
  userReferenceData: '参考実績',
  costs: '費用（予約）',
}

/** エラー箇所を「シナリオ1 › バス停3 › 緯度」のような日本語にする */
export function describePath(path: readonly PropertyKey[]): string {
  const parts: string[] = []
  for (const key of path) {
    if (typeof key === 'number') {
      // 直前の項目名に番号を付ける（配列は1から数える）
      parts[parts.length - 1] = `${parts[parts.length - 1] ?? ''}${key + 1}`
    } else {
      const k = String(key)
      parts.push(FIELD_LABELS[k] ?? k)
    }
  }
  return parts.length ? parts.join(' › ') : 'ファイル全体'
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const where = describePath(issue.path)
  switch (issue.code) {
    case 'invalid_type':
      // 入力値そのものはエラーに含まれないため、メッセージから「値がない」ことを判定する
      return /received undefined/.test(issue.message)
        ? `${where}：必須の項目がありません`
        : `${where}：値の種類が違います（${expectedLabel(issue.expected)}が必要です）`
    case 'too_small':
      return issue.origin === 'array'
        ? `${where}：${issue.minimum}件以上必要です`
        : issue.origin === 'string'
          ? `${where}：入力されていません`
          : `${where}：${issue.minimum}以上の値にしてください`
    case 'too_big':
      return issue.origin === 'array'
        ? `${where}：${issue.maximum}件以下にしてください`
        : `${where}：${issue.maximum}以下の値にしてください`
    case 'invalid_value':
      return `${where}：使えない値です（${issue.values.map(String).join('／')} のいずれか）`
    case 'invalid_format':
      return `${where}：書式が正しくありません`
    case 'unrecognized_keys':
      return `${where}：不明な項目があります（${issue.keys.join('、')}）`
    default:
      return `${where}：値が正しくありません`
  }
}

function expectedLabel(t: string): string {
  return (
    {
      number: '数値',
      string: '文字',
      boolean: 'はい／いいえ',
      array: '一覧',
      object: '項目のまとまり',
      null: '空（null）',
    }[t] ?? t
  )
}

export type ParseResult =
  { ok: true; project: ProjectFile; migrated: string[] } | { ok: false; errors: string[] }

/**
 * プロジェクトファイルの文字列を読み、検証する（F-1-4〜F-1-6）。
 * 問題があれば、どの項目がおかしいかを日本語で返す（画面は壊さない）。
 */
export function parseProjectFile(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(BOM, ''))
  } catch {
    return {
      ok: false,
      errors: ['ファイルの中身がJSON形式として読めません。プロジェクトファイルか確認してください'],
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['プロジェクトファイルの形式ではありません'] }
  }
  let migrated: string[]
  let data: unknown
  try {
    const r = migrateToLatest(raw as Record<string, unknown>)
    data = r.data
    migrated = r.applied
  } catch (e) {
    if (e instanceof UnsupportedVersionError) return { ok: false, errors: [e.message] }
    throw e
  }
  const result = projectFileSchema.safeParse(data)
  if (!result.success) {
    const errors = result.error.issues.map(describeIssue)
    return { ok: false, errors: [...new Set(errors)].slice(0, 20) }
  }
  const integrity = checkIntegrity(result.data)
  if (integrity.length) return { ok: false, errors: integrity }
  return { ok: true, project: result.data, migrated }
}

/** 形式は正しいが、中身の整合がとれていない箇所を探す */
export function checkIntegrity(p: ProjectFile): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  p.scenarios.forEach((s, i) => {
    if (ids.has(s.id)) errors.push(`シナリオ${i + 1}：IDが重複しています`)
    ids.add(s.id)
    const stopIds = new Set(s.stops.map((x) => x.id))
    if (stopIds.size !== s.stops.length)
      errors.push(`シナリオ${i + 1}「${s.name}」：バス停のIDが重複しています`)
    s.route.segments.forEach((seg, j) => {
      if (!stopIds.has(seg.fromStopId) || !stopIds.has(seg.toStopId)) {
        errors.push(`シナリオ${i + 1}「${s.name}」› 区間${j + 1}：存在しないバス停を参照しています`)
      }
    })
  })
  return errors
}

/** 保存用の文字列を作る（保存日時・ツール版数を更新する） */
export function serializeProject(p: ProjectFile, now: Date, toolVersion: string): string {
  const out: ProjectFile = { ...p, savedAt: toIsoWithOffset(now), toolVersion }
  return JSON.stringify(out, null, 2)
}

/** ファイル名：{プロジェクト名}_{yyyymmdd_hhmm}.busproj.json（F-1-3） */
export function projectFileName(projectName: string, now: Date): string {
  // ファイル名に使えない文字・制御文字を _ に置き換える
  // eslint-disable-next-line no-control-regex
  const safe = projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'project'
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${safe}_${stamp}${PROJECT_FILE_EXTENSION}`
}

/** ローカル時刻の ISO 8601（例：2026-10-05T17:00:00+09:00） */
export function toIsoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  )
}
