import { CURRENT_SCHEMA_VERSION } from '../schema'
import { v1_0_to_v1_1 } from './v1_0_to_v1_1'

/**
 * プロジェクトファイルの形式の変換（マイグレーション）。F-1-5。
 *
 * 形式を変えるときは：
 * 1. schema.ts の CURRENT_SCHEMA_VERSION を上げる（例：'1.0' → '1.1'）
 * 2. このフォルダに `v1_0_to_v1_1.ts` のような変換処理を作り、下の migrations に追加する
 * 3. 古い形式のサンプルを使ったテストを追加する
 *
 * 古い版のファイルは、版の順に変換を繰り返して最新の形式にする。
 */
export type RawProject = Record<string, unknown>

export type Migration = {
  from: string
  to: string
  migrate: (data: RawProject) => RawProject
}

/** 登録済みの変換処理（版の順に並べる） */
export const migrations: Migration[] = [v1_0_to_v1_1]

export class UnsupportedVersionError extends Error {}

/** "1.10" と "1.9" を正しく比べられるよう、数値の並びとして比較する */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  return 0
}

export function migrateToLatest(
  data: RawProject,
  list: Migration[] = migrations,
  latest: string = CURRENT_SCHEMA_VERSION,
): { data: RawProject; applied: string[] } {
  let version = data.schemaVersion
  if (typeof version !== 'string' || !/^\d+(\.\d+)*$/.test(version)) {
    throw new UnsupportedVersionError('schemaVersion（ファイル形式の版）がありません')
  }
  if (compareVersions(version, latest) > 0) {
    throw new UnsupportedVersionError(
      `このファイルは新しい版（${version}）のツールで作られています。ツールを最新にしてから読み込んでください（このツールの対応版：${latest}）`,
    )
  }
  const applied: string[] = []
  let current = data
  while (version !== latest) {
    const step = list.find((m) => m.from === version)
    if (!step) {
      throw new UnsupportedVersionError(`ファイル形式の版 ${version} には対応していません`)
    }
    current = { ...step.migrate(current), schemaVersion: step.to }
    applied.push(`${step.from}→${step.to}`)
    version = step.to
  }
  return { data: current, applied }
}
