import { describe, expect, it } from 'vitest'
import type { Attribution } from '../data/schemas'
import { attributionHtml, attributionText } from './attribution'

const items: Attribution[] = [
  {
    id: 'a',
    name: '地理院タイル',
    provider: '国土地理院',
    url: 'https://maps.gsi.go.jp/development/ichiran.html',
    license: '国土地理院コンテンツ利用規約',
    licenseUrl: null,
    dataVersion: null,
  },
  {
    id: 'b',
    name: '国土数値情報 <バス停>',
    provider: '国土交通省',
    url: 'https://nlftp.mlit.go.jp/',
    license: 'CC BY 4.0',
    licenseUrl: null,
    dataVersion: 'P11-2022',
  },
]

describe('attributionHtml', () => {
  it('指定した順にリンクを並べる', () => {
    const html = attributionHtml(items, ['b', 'a'])
    expect(html.indexOf('国土数値情報')).toBeLessThan(html.indexOf('地理院タイル'))
    expect(html).toContain('href="https://maps.gsi.go.jp/development/ichiran.html"')
    expect(html).toContain(' | ')
  })

  it('HTMLとして危険な文字をエスケープする', () => {
    expect(attributionHtml(items, ['b'])).toContain('&#60;バス停&#62;')
  })

  it('未登録の出典を指定するとエラー（表示漏れを防ぐ）', () => {
    expect(() => attributionHtml(items, ['x'])).toThrow('x')
  })
})

describe('attributionText', () => {
  it('名称・提供者・ライセンス・版・URLを含む', () => {
    expect(attributionText(items[1])).toBe(
      '国土数値情報 <バス停>（国土交通省） / CC BY 4.0 / 版：P11-2022 / https://nlftp.mlit.go.jp/',
    )
  })
})
