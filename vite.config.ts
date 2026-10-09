/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages ではリポジトリ名のサブパス（例：/autobus-revenue-tool/）で配信される。
// GitHub Actions が BASE_PATH を渡す。ローカルでは '/'。
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  // MapLibre は自身のファイル位置から Web Worker を読み込むため、事前バンドルの対象から外す
  optimizeDeps: { exclude: ['maplibre-gl'] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // 画面のテストはファイル先頭の @vitest-environment jsdom で切り替える
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
