import type { Attribution } from '../data/schemas'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * 地図の右下に出す出典表示（HTML）を作る。
 * 指定した id の順に並べ、見つからない id があればエラーにする（出典の表示漏れを防ぐ）。
 */
export function attributionHtml(all: Attribution[], ids: string[]): string {
  return ids
    .map((id) => {
      const a = all.find((x) => x.id === id)
      if (!a) throw new Error(`出典 ${id} が attributions.json にありません`)
      return `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>`
    })
    .join(' | ')
}

/** 出力物（CSV・Excel など）に書く、文字だけの出典一覧 */
export function attributionText(a: Attribution): string {
  const parts = [`${a.name}（${a.provider}）${a.modified ? 'を加工して作成' : ''}`, a.license]
  if (a.dataVersion) parts.push(`版：${a.dataVersion}`)
  parts.push(a.url)
  return parts.join(' / ')
}
