// ビルド結果（dist/）が公開ルールを守っているかを確認する。
// - すべての HTML に <meta name="robots" content="noindex, nofollow"> がある
// - robots.txt とサイトマップを置いていない
// - 1ファイル 100MB 未満、合計 1GB 以下（GitHub Pages の制約）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const MAX_FILE = 100 * 1024 * 1024
const MAX_TOTAL = 1024 * 1024 * 1024
const NOINDEX = /<meta\s+name="robots"\s+content="noindex, nofollow"\s*\/?>/i

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
}

const files = walk(distDir)
const errors = []
let total = 0

for (const file of files) {
  const rel = relative(distDir, file).split(sep).join('/')
  const size = statSync(file).size
  total += size
  if (size >= MAX_FILE) errors.push(`100MB以上のファイルがあります: ${rel}`)
  if (/^robots\.txt$/i.test(rel)) {
    errors.push('robots.txt を置かないでください（noindex が読まれなくなります）')
  }
  if (/sitemap/i.test(rel)) errors.push(`サイトマップを置かないでください: ${rel}`)
  if (rel.endsWith('.html') && !NOINDEX.test(readFileSync(file, 'utf8'))) {
    errors.push(`noindex の meta タグがありません: ${rel}`)
  }
}
if (total > MAX_TOTAL) {
  errors.push(`合計容量が1GBを超えています: ${(total / 1024 / 1024).toFixed(1)}MB`)
}

if (errors.length > 0) {
  console.error(errors.map((e) => `NG: ${e}`).join('\n'))
  process.exit(1)
}
console.log(`OK: ${files.length} ファイル / 合計 ${(total / 1024 / 1024).toFixed(2)} MB`)
