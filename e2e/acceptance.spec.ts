import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * 受入基準（docs/requirements.md「10. 受入基準」）のうち、画面操作で確かめられるもの。
 *   8  保存 → 読込で、入力と計算結果が一致する
 *   9  不正なファイルを読み込んでも、問題が表示され、画面が壊れない
 *   10 入力データが外部へ送信されていない（通信は地図タイル・静的データの取得のみ）
 *   11 CSV（BOM付き）・xlsx・PNG が出力できる
 * 開発サーバーを使うので、バス停などの準備だけは開発用の入口（store）から入れる。
 */

const ALLOWED_HOSTS = new Set(['localhost:5174', 'cyberjapandata.gsi.go.jp'])

/** 作成直後のプロジェクトに、バス停3つ・車両・運賃を入れる（地図の操作は別途目視で確認する） */
const SEED = `(async () => {
  const { useProjectStore } = await import('/src/project/store.ts')
  const st = useProjectStore.getState()
  const id = st.project.scenarios[0].id
  const pts = [['A','三鷹駅',139.5606,35.7027],['B','中継',139.569,35.704],['C','終点',139.577,35.706]]
  st.updateScenario(id, (s) => ({
    ...s,
    stops: pts.map(([i, n, lng, lat]) => ({ id: i, name: n, lat, lng, existingStopId: null, catchmentM: 300 })),
    route: { loop: false, sequence: ['A','B','C'], lengthOverrideKm: null, segments: [
      { fromStopId: 'A', toStopId: 'B', method: 'straight', via: [], coordinates: [[139.5606,35.7027],[139.569,35.704]], lengthKm: 0.8, lengthOverrideKm: null },
      { fromStopId: 'B', toStopId: 'C', method: 'straight', via: [], coordinates: [[139.569,35.704],[139.577,35.706]], lengthKm: 0.8, lengthOverrideKm: null } ] },
    service: { ...s.service, weekdayTrips: 100, holidayTrips: 100, vehicles: 2,
      vehicle: { ...s.service.vehicle, capacity: 20, operatorOnBoard: false, standingAllowed: true, avgSpeedKmh: 15 } },
    fare: { ...s.fare, flatFare: 200 },
  }))
})()`

async function createProject(page: Page) {
  await page.goto('/#/project')
  await page.getByLabel('プロジェクト名').fill('E2Eテスト（三鷹）')
  await page.getByLabel('都道府県').selectOption('13')
  await page.getByLabel('対象自治体（市区町村）').selectOption({ label: '三鷹市' })
  await page.getByRole('button', { name: '作成する' }).click()
  await expect(page).toHaveURL(/#\/map/)
  await page.evaluate(SEED)
}

async function resultsText(page: Page): Promise<string> {
  await page.goto('/#/results')
  const table = page.getByRole('table', { name: '年度別の延べ乗車人員と収入' })
  await expect(table).toBeVisible({ timeout: 30_000 })
  return (await table.innerText()).replace(/\s+/g, ' ')
}

test('保存→読込で結果が一致し、通信は地図タイルと静的データだけ（基準8・10）', async ({
  page,
  browser,
}) => {
  const requests: { url: string; method: string }[] = []
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }))

  await createProject(page)
  const before = await resultsText(page)
  expect(before).toMatch(/20[0-9][0-9]/) // 推計開始年度は「今日」から決まるので、年の表示だけ確かめる

  // 保存（ダウンロード）
  const dir = mkdtempSync(join(tmpdir(), 'busproj-'))
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '保存（ダウンロード）' }).click(),
  ])
  const saved = join(dir, download.suggestedFilename())
  await download.saveAs(saved)
  const json = JSON.parse(readFileSync(saved, 'utf8'))
  expect(json.schemaVersion).toBeTruthy()
  // 計算結果は保存しない（読込時に再計算する）。入力だけが入っている
  expect(JSON.stringify(json)).not.toContain('totalAnnual')

  // 別のパソコンで開いたのと同じ状態にする（保存データのない新しいブラウザ）
  const other = await (await browser.newContext({ acceptDownloads: true })).newPage()
  other.on('request', (r) => requests.push({ url: r.url(), method: r.method() }))
  await other.goto('/#/project')
  await expect(other.getByText('プロジェクト未作成')).toBeVisible()

  // ファイルを開く
  const chooser = other.waitForEvent('filechooser')
  await other.getByRole('button', { name: 'ファイルを選んで開く' }).click()
  await (await chooser).setFiles(saved)
  await expect(other.getByText('E2Eテスト（三鷹）').first()).toBeVisible()

  const after = await resultsText(other)
  expect(after).toBe(before)

  // 基準10：外部への送信がない。通信はこのサイトと地理院タイルだけで、データを送る種類（POST など）もない
  const hosts = new Set(requests.map((r) => new URL(r.url).host).filter(Boolean))
  for (const h of hosts) expect(ALLOWED_HOSTS.has(h), `想定外の通信先：${h}`).toBe(true)
  expect(
    requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD' && r.method !== 'OPTIONS'),
  ).toEqual([])
})

test('不正なファイルを読み込むと、問題が表示され、画面は壊れない（基準9）', async ({ page }) => {
  await page.goto('/#/project')
  const dir = mkdtempSync(join(tmpdir(), 'busproj-'))
  const bad = join(dir, 'bad.busproj.json')
  writeFileSync(
    bad,
    JSON.stringify({ schemaVersion: '1.2', project: { name: '' }, scenarios: 'x' }),
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'ファイルを選んで開く' }).click()
  await (await chooser).setFiles(bad)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('navigation', { name: '画面の切り替え' })).toBeVisible()

  // JSON でないファイル
  const notJson = join(dir, 'x.busproj.json')
  writeFileSync(notJson, 'これはJSONではありません')
  await page.getByRole('button', { name: '閉じる' }).click()
  const chooser2 = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'ファイルを選んで開く' }).click()
  await (await chooser2).setFiles(notJson)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('navigation', { name: '画面の切り替え' })).toBeVisible()
})

test('Excel・CSV（BOM付き）・PNG が出力でき、出典・前提が入っている（基準11）', async ({
  page,
}) => {
  await createProject(page)
  await resultsText(page)

  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Excel（.xlsx）' }).click(),
  ])
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)
  const xlsxPath = join(mkdtempSync(join(tmpdir(), 'out-')), 'out.xlsx')
  await xlsx.saveAs(xlsxPath)
  const bytes = readFileSync(xlsxPath)
  expect(bytes.subarray(0, 2).toString()).toBe('PK') // xlsx は zip 形式

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV：前提条件' }).click(),
  ])
  const csvPath = join(mkdtempSync(join(tmpdir(), 'out-')), 'out.csv')
  await csv.saveAs(csvPath)
  const csvBytes = readFileSync(csvPath)
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM
  const text = csvBytes.toString('utf8')
  for (const word of [
    '推計日時',
    'シナリオ',
    'データ版数',
    '出典',
    'ツール版数',
    '全国都市交通特性調査',
  ]) {
    expect(text).toContain(word)
  }

  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'グラフ（延べ乗車人員）をPNGで保存' }).click(),
  ])
  const pngPath = join(mkdtempSync(join(tmpdir(), 'out-')), 'out.png')
  await png.saveAs(pngPath)
  expect([...readFileSync(pngPath).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]) // "PNG"
})

test('既存バス停と重なると「路線捕捉率 未設定」と警告し、便数を入れて按分できる（確認事項 Q5）', async ({
  page,
}) => {
  await createProject(page)
  await page.goto('/#/results')
  await expect(page.getByText('路線捕捉率 未設定')).toBeVisible({ timeout: 30_000 })

  await page.goto('/#/assumptions')
  const card = page
    .locator('.card', { hasText: '路線捕捉率（既存のバス路線と重なるバス停）' })
    .first()
  await expect(card.getByText('バス停「三鷹駅」')).toBeVisible({ timeout: 30_000 })
  await card.getByLabel('三鷹駅の捕捉率の決め方').getByText('既存路線の便数を入力して按分').click()
  await card.getByLabel('重なる既存路線の便数の合計（平日）').fill('300')
  await card.getByLabel('重なる既存路線の便数の合計（土休日）').fill('300')
  await expect(card.getByText('平日 25.0%／土休日 25.0%').first()).toBeVisible()

  // 三鷹駅は按分済み。ほかのバス停が重なっていれば、まだ未設定の表示が残る
  await page.goto('/#/results')
  await expect(page.getByRole('table', { name: '年度別の延べ乗車人員と収入' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('table', { name: '路線捕捉率' })).toContainText(
    '既存路線の便数を入力して按分',
  )
})
