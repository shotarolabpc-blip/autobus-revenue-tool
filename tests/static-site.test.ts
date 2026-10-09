import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

describe('公開サイトの設定（要件 5章 検索除外）', () => {
  it('index.html に noindex, nofollow の meta タグがある', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8')
    expect(html).toMatch(/<meta\s+name="robots"\s+content="noindex, nofollow"\s*\/?>/)
  })

  it('index.html は日本語ページとして宣言されている', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8')
    expect(html).toContain('<html lang="ja">')
  })

  it('robots.txt とサイトマップを置いていない', () => {
    expect(existsSync(new URL('public/robots.txt', root))).toBe(false)
    const files = readdirSync(new URL('public/', root), { recursive: true }).map(String)
    expect(files.filter((f) => /sitemap/i.test(f))).toEqual([])
  })
})
