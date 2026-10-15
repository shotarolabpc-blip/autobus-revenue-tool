import { defineConfig } from '@playwright/test'

/**
 * 主要な操作の自動確認（受入基準 8・9・10・11）。npm run e2e で実行する。
 * ブラウザは、パソコンに入っている Chrome を使う（ブラウザ本体を新しくダウンロードしない）。
 * 開発サーバーを自動で起動する。
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    acceptDownloads: true,
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
