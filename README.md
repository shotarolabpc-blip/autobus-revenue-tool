# 自動運転バス 収入予測Webツール

ルート・バス停・運賃・運行計画・人口データから、自動運転バスの年度別の運賃収入を推計するWebツールです。
要件は [docs/requirements.md](docs/requirements.md)（要件定義書 v0.5）を参照してください。

- ログインなし・サーバなしの静的サイトです（GitHub Pages で公開）。
- 入力したデータはブラウザの中だけで扱い、外部へは送信しません。
- 検索エンジンには載せません（全ページに `noindex, nofollow`）。ただし URL を知っている人は誰でも見られます。

## 必要なもの

- Node.js 24（LTS）と npm
- Git
- Python 3.11 以上（データ加工 `data_build/` を使うときだけ）

## ローカルでの起動

```bash
npm install
```

```bash
npm run dev
```

表示された URL（通常は http://localhost:5173/ ）をブラウザで開きます。
画面のURLは `#/map`（地図）、`#/results`（推計結果）、`#/assumptions`（前提条件）です。

## よく使うコマンド

| コマンド             | 内容                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `npm run dev`        | 開発用サーバを起動する                                                     |
| `npm test`           | テスト（Vitest）を実行する                                                 |
| `npm run lint`       | 静的解析（ESLint）                                                         |
| `npm run typecheck`  | 型チェック（TypeScript）                                                   |
| `npm run format`     | 書式を整える（Prettier）                                                   |
| `npm run build`      | 公開用ファイルを `dist/` に作る                                            |
| `npm run check:dist` | `dist/` が公開ルール（noindex、robots.txt なし、容量制限）を守るか確認する |
| `npm run preview`    | `dist/` をローカルで表示する                                               |

### 公開時と同じサブパスで確認する

GitHub Pages では `https://<アカウント>.github.io/<リポジトリ名>/` のようにサブパス付きで配信されます。
同じ条件で確認するには、PowerShell で次を実行します（`autobus-revenue-tool` はリポジトリ名に置き換え）。

```powershell
$env:BASE_PATH = "/autobus-revenue-tool/"; npm run build; npm run check:dist
```

```powershell
npx vite preview --base /autobus-revenue-tool/
```

Git Bash で実行する場合は、パスが書き換えられないよう先頭に `MSYS_NO_PATHCONV=1` を付けてください。

## 公開（GitHub Pages）

`main` ブランチに push すると、GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が
**書式・静的解析・型チェック → テスト → ビルド → 公開ルールの確認 → GitHub Pages へ公開** を自動で行います。
Actions タブの「Deploy to GitHub Pages」から手動で実行することもできます。

### 初回だけ必要な設定

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
2. `main` に push する。

### 公開URLの確認方法

- リポジトリの **Actions** タブで、最新の「Deploy to GitHub Pages」が緑のチェックになっていることを確認する。
- その実行結果の `deploy` ジョブに表示される URL、または **Settings → Pages** の「Your site is live at …」が公開URLです。
  通常は `https://<アカウント>.github.io/<リポジトリ名>/` になります。

### 検索除外（noindex）の確認方法

- 公開URLを開き、右クリック →「ページのソースを表示」で
  `<meta name="robots" content="noindex, nofollow" />` があることを確認する。
- `https://<アカウント>.github.io/<リポジトリ名>/robots.txt` が **404（見つからない）** になることを確認する。
  robots.txt でクロールを禁止すると、検索エンジンが noindex を読めなくなるため、置いていません。
- 同じ確認はビルド時に `npm run check:dist` でも自動で行っています。

## ディレクトリ

ディレクトリ構成とルールは [CLAUDE.md](CLAUDE.md) を参照してください。
